use adl_errors::AppError;
use aes_gcm::aead::{Aead, KeyInit, OsRng, rand_core::RngCore};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use dirs::config_dir;
use hkdf::Hkdf;
use sha2::Sha256;
use std::path::Path;
use std::path::PathBuf;

const CREDENTIALS_SUBDIR: &str = "ai-digital-life/credentials";

const DEFAULT_SERVICE: &str = "ai-digital-life";

/// Magic header for AES-256-GCM encrypted credential files.
/// Files without this prefix use the legacy XOR format (auto-migrated on read).
const CREDENTIAL_MAGIC: &str = "ADL1";
/// CI access token 在凭证系统中的账号名
pub const CI_CREDENTIAL_ACCOUNT: &str = "ci-access-token";
/// Static HKDF salt used when deriving the AES key from machine identifier.
/// A fixed salt is acceptable here because the input (machine_id) is already
/// globally unique per-install; HKDF provides standard domain separation and
/// length-expansion semantics over the raw SHA-256 hash we used previously.
const HKDF_SALT: &[u8] = b"adl-credential-machine-key-salt-v1";
const HKDF_INFO: &[u8] = b"adl-credential-aes-256-gcm-key-v1";

pub struct CredentialStore {
    service: String,
    account: String,
    store: StoreBackend,
}

enum StoreBackend {
    Keyring(keyring::Entry),
    EncryptedFile { config_dir: PathBuf, machine_key: [u8; 32] },
}

impl CredentialStore {
    pub fn new(service: &str, account: &str) -> Self {
        match KeyringBackend::try_new(service, account) {
            Ok(entry) => CredentialStore {
                service: service.to_string(),
                account: account.to_string(),
                store: StoreBackend::Keyring(entry),
            },
            Err(()) => {
                let config_dir = config_dir().unwrap_or_else(|| PathBuf::from("."));
                let machine_key = derive_machine_key();
                CredentialStore {
                    service: service.to_string(),
                    account: account.to_string(),
                    store: StoreBackend::EncryptedFile { config_dir, machine_key },
                }
            },
        }
    }

    pub fn new_with_config_dir(service: &str, account: &str, config_dir: PathBuf) -> Self {
        let machine_key = derive_machine_key();
        CredentialStore {
            service: service.to_string(),
            account: account.to_string(),
            store: StoreBackend::EncryptedFile { config_dir, machine_key },
        }
    }

    pub fn set_password(&self, password: &str) -> Result<(), AppError> {
        match &self.store {
            StoreBackend::Keyring(entry) => {
                entry.set_password(password).map_err(|e| AppError::Security(e.to_string()))
            },
            StoreBackend::EncryptedFile { config_dir, machine_key } => {
                let path = encrypted_path(config_dir, &self.service, &self.account);
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        AppError::Storage(format!("Failed to create credentials dir: {}", e))
                    })?;
                }
                let ciphertext = aes_encrypt(password.as_bytes(), machine_key)?;
                let encoded = format!("{}{}", CREDENTIAL_MAGIC, hex::encode(&ciphertext));
                write_secure_file(&path, &encoded)
            },
        }
    }

    pub fn get_password(&self) -> Result<String, AppError> {
        match &self.store {
            StoreBackend::Keyring(entry) => match entry.get_password() {
                Ok(pw) => Ok(pw),
                Err(keyring::Error::NoEntry) => {
                    Err(AppError::Security("No credential found".into()))
                },
                Err(e) => Err(AppError::Security(e.to_string())),
            },
            StoreBackend::EncryptedFile { config_dir, machine_key } => {
                let path = encrypted_path(config_dir, &self.service, &self.account);
                let content = std::fs::read_to_string(&path).map_err(|e| {
                    if e.kind() == std::io::ErrorKind::NotFound {
                        AppError::Security("No credential found".into())
                    } else {
                        AppError::Storage(format!("Failed to read credential file: {}", e))
                    }
                })?;
                let trimmed = content.trim();
                let plaintext = if let Some(rest) = trimmed.strip_prefix(CREDENTIAL_MAGIC) {
                    // 新格式：ADL1 + hex(nonce || ciphertext+tag)，AES-256-GCM 解密
                    let ciphertext = hex::decode(rest).map_err(|e| {
                        AppError::Storage(format!("Invalid credential file format: {}", e))
                    })?;
                    aes_decrypt(&ciphertext, machine_key)?
                } else {
                    // 旧格式：hex(XOR(plaintext, key)) — 向后兼容，读取后迁移到 AES
                    let ciphertext = hex::decode(trimmed).map_err(|e| {
                        AppError::Storage(format!("Invalid credential file format: {}", e))
                    })?;
                    let plaintext = xor_cipher(&ciphertext, machine_key);
                    // 1) 先验证是合法 UTF-8 明文（避免把误判的字节写回新格式）
                    let utf8_valid = String::from_utf8(plaintext.clone()).is_ok();
                    if utf8_valid {
                        // 2) 用 AES 重新加密
                        match aes_encrypt(&plaintext, machine_key) {
                            Ok(new_ciphertext) => {
                                let encoded =
                                    format!("{}{}", CREDENTIAL_MAGIC, hex::encode(&new_ciphertext));
                                // 3) 写回新格式；失败仅记录，不影响本次读取返回
                                if let Err(e) = write_secure_file(&path, &encoded) {
                                    tracing::warn!(
                                        service = %self.service,
                                        account = %self.account,
                                        error = %e,
                                        "Failed to migrate credential from XOR to AES format"
                                    );
                                }
                            },
                            Err(e) => {
                                tracing::warn!(
                                    service = %self.service,
                                    account = %self.account,
                                    error = %e,
                                    "AES re-encryption failed during XOR→AES credential migration; will retry next read"
                                );
                            },
                        }
                    } else {
                        tracing::warn!(
                            service = %self.service,
                            account = %self.account,
                            "Legacy XOR credential is not valid UTF-8 after decryption; skipping AES migration to avoid data corruption"
                        );
                    }
                    plaintext
                };
                String::from_utf8(plaintext)
                    .map_err(|e| AppError::Storage(format!("Invalid credential data: {}", e)))
            },
        }
    }

    pub fn delete_password(&self) -> Result<(), AppError> {
        match &self.store {
            StoreBackend::Keyring(entry) => match entry.delete_credential() {
                Ok(()) => Ok(()),
                Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(AppError::Security(e.to_string())),
            },
            StoreBackend::EncryptedFile { config_dir, .. } => {
                let path = encrypted_path(config_dir, &self.service, &self.account);
                match std::fs::remove_file(&path) {
                    Ok(()) => Ok(()),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                    Err(e) => {
                        Err(AppError::Storage(format!("Failed to delete credential file: {}", e)))
                    },
                }
            },
        }
    }
}

// ============ CI Access Token 专用便捷 API ============

/// 设置 CI access token
///
/// 优先写入系统钥匙串（服务名 `ai-digital-life`，账号名 `ci-access-token`）。
/// 若系统钥匙串不可用，自动降级到加密文件存储。
pub fn set_ci_access_token(token: &str) -> Result<(), AppError> {
    if token.is_empty() {
        delete_ci_access_token()?;
        return Ok(());
    }
    CredentialStore::new(DEFAULT_SERVICE, CI_CREDENTIAL_ACCOUNT).set_password(token)?;
    Ok(())
}

/// 读取 CI access token（如果不存在则返回 `None`）
pub fn get_ci_access_token() -> Option<String> {
    let store = CredentialStore::new(DEFAULT_SERVICE, CI_CREDENTIAL_ACCOUNT);
    store.get_password().ok()
}

/// 删除 CI access token
pub fn delete_ci_access_token() -> Result<(), AppError> {
    CredentialStore::new(DEFAULT_SERVICE, CI_CREDENTIAL_ACCOUNT).delete_password()?;
    Ok(())
}

// =========================================================

fn encrypted_path(config_dir: &Path, service: &str, account: &str) -> PathBuf {
    config_dir.join(CREDENTIALS_SUBDIR).join(format!("{}.{}.enc", service, account))
}

fn derive_machine_key() -> [u8; 32] {
    let machine_id = resolve_machine_id();
    // HKDF-SHA256: extract + expand to a 32-byte AES key with explicit domain info.
    let hk = Hkdf::<Sha256>::new(Some(HKDF_SALT), machine_id.as_bytes());
    let mut key = [0u8; 32];
    hk.expand(HKDF_INFO, &mut key).expect("HKDF expand for 32-byte key is infallible");
    key
}

fn resolve_machine_id() -> String {
    if let Ok(id) = try_platform_machine_id() {
        return id;
    }
    match config_dir() {
        Some(base) => {
            let path = base.join("ai-digital-life-machine-id");
            match std::fs::read_to_string(&path) {
                Ok(id) => {
                    let trimmed = id.trim().to_string();
                    if !trimmed.is_empty() {
                        return trimmed;
                    }
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    // Normal: first launch, no persisted id yet. Fall through → generate.
                },
                Err(e) => {
                    // Read failure (permissions, transient IO, corruption etc). Warn loudly
                    // before generating a new id, because overwriting an existing machine-id
                    // will orphan ALL previously-encrypted file credentials.
                    tracing::warn!(
                        path = %path.display(),
                        error = %e,
                        "Failed to read persisted machine-id file; a NEW machine id will be generated. Any credentials encrypted against the old id will no longer be decryptable unless this file is restored."
                    );
                },
            }
            let id = uuid::Uuid::new_v4().to_string();
            if let Err(e) = std::fs::write(&path, &id) {
                tracing::warn!(
                    path = %path.display(),
                    error = %e,
                    "Failed to persist generated machine id; credential encryption key will change on every launch"
                );
            }
            id
        },
        None => {
            // Absolute worst case: ephemeral key. This means credentials written
            // this session will NOT be recoverable next run. We MUST surface a
            // warning so operators notice.
            let fallback = uuid::Uuid::new_v4().to_string();
            tracing::warn!(
                "No config_dir available and platform machine-id unavailable; using EPHEMERAL machine id. Credentials stored via encrypted-file backend will NOT be decryptable after this process exits."
            );
            fallback
        },
    }
}

#[cfg(target_os = "linux")]
fn try_platform_machine_id() -> Result<String, ()> {
    let path = Path::new("/etc/machine-id");
    if path.exists() {
        match std::fs::read_to_string(path) {
            Ok(s) => {
                let trimmed = s.trim().to_string();
                if !trimmed.is_empty() {
                    return Ok(trimmed);
                }
            },
            Err(e) => {
                tracing::debug!(path = %path.display(), error = %e, "Failed to read /etc/machine-id")
            },
        }
    }
    Err(())
}

#[cfg(target_os = "macos")]
fn try_platform_machine_id() -> Result<String, ()> {
    let candidates = &["/var/db/.MachineUuid", "/System/Library/CoreServices/SystemVersion.plist"];
    for candidate in candidates {
        let path = Path::new(candidate);
        if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(content) => {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        return Ok(trimmed);
                    }
                },
                Err(e) => {
                    tracing::debug!(path = %path.display(), error = %e, "Failed to read macOS machine-id candidate")
                },
            }
        }
    }
    Err(())
}

#[cfg(target_os = "windows")]
fn try_platform_machine_id() -> Result<String, ()> {
    if let Some(localappdata) = std::env::var_os("LOCALAPPDATA") {
        let path = Path::new(&localappdata).join("ai-digital-life-machine-id");
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        return Ok(trimmed);
                    }
                },
                Err(e) => {
                    tracing::debug!(path = %path.display(), error = %e, "Failed to read LOCALAPPDATA machine-id file")
                },
            }
        }
        let id = uuid::Uuid::new_v4().to_string();
        match std::fs::write(&path, &id) {
            Ok(()) => return Ok(id),
            Err(e) => tracing::warn!(
                path = %path.display(),
                error = %e,
                "Failed to write machine id to LOCALAPPDATA, falling back to config_dir-based id"
            ),
        }
    }
    Err(())
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn try_platform_machine_id() -> Result<String, ()> {
    Err(())
}

fn xor_cipher(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter().enumerate().map(|(i, b)| b ^ key[i % key.len()]).collect()
}

/// AES-256-GCM 加密。返回 `nonce (12 bytes) || ciphertext+tag`。
fn aes_encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, AppError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|e| AppError::Storage(format!("AES encryption failed: {e}")))?;
    Ok([&nonce_bytes[..], &ciphertext[..]].concat())
}

/// AES-256-GCM 解密。输入为 `nonce (12 bytes) || ciphertext+tag`。
fn aes_decrypt(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, AppError> {
    if data.len() < 12 {
        return Err(AppError::Storage("ciphertext too short".into()));
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|e| AppError::Storage(format!("AES decryption failed: {e}")))
}

/// 写入凭证文件并在 Unix 上设置 0600 权限。
fn write_secure_file(path: &Path, content: &str) -> Result<(), AppError> {
    std::fs::write(path, content)
        .map_err(|e| AppError::Storage(format!("Failed to write credential file: {}", e)))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(e) = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)) {
            tracing::warn!(
                path = %path.display(),
                error = %e,
                "Failed to chmod 0600 on credential file; file may be readable by other users on this machine"
            );
        }
    }
    Ok(())
}

struct KeyringBackend;

impl KeyringBackend {
    fn try_new(service: &str, account: &str) -> Result<keyring::Entry, ()> {
        keyring::Entry::new(service, account).map_err(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xor_cipher_roundtrip() {
        let key = [0xABu8; 32];
        let data = b"hello-world-secret-123";
        let encrypted = xor_cipher(data, &key);
        let decrypted = xor_cipher(&encrypted, &key);
        assert_eq!(decrypted, data);
    }

    #[test]
    fn xor_cipher_different_keys_produce_different_output() {
        let key1 = [0xABu8; 32];
        let key2 = [0xCDu8; 32];
        let data = b"test-data";
        let enc1 = xor_cipher(data, &key1);
        let enc2 = xor_cipher(data, &key2);
        assert_ne!(enc1, enc2);
    }

    #[test]
    fn aes_roundtrip() {
        let key = [0x42u8; 32];
        let data = b"super-secret-api-key-sk-12345";
        let encrypted = aes_encrypt(data, &key).unwrap();
        let decrypted = aes_decrypt(&encrypted, &key).unwrap();
        assert_eq!(decrypted, data);
    }

    #[test]
    fn aes_decrypt_wrong_key_fails() {
        let key1 = [0x42u8; 32];
        let key2 = [0x99u8; 32];
        let encrypted = aes_encrypt(b"secret", &key1).unwrap();
        assert!(aes_decrypt(&encrypted, &key2).is_err());
    }

    #[test]
    fn encrypted_file_roundtrip() {
        let dir = std::env::temp_dir().join(format!("cred_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let store = CredentialStore::new_with_config_dir("test-svc", "test-acct", dir.clone());
        store.set_password("supersecret").unwrap();

        let got = store.get_password().unwrap();
        assert_eq!(got, "supersecret");

        store.delete_password().unwrap();
        assert!(store.get_password().is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn encrypted_file_uses_aes_magic_header() {
        let dir = std::env::temp_dir().join(format!("cred_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let store = CredentialStore::new_with_config_dir("test-svc", "magic", dir.clone());
        store.set_password("secret-value").unwrap();

        let path = encrypted_path(&dir, "test-svc", "magic");
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(
            content.starts_with(CREDENTIAL_MAGIC),
            "credential file should start with AES magic header"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn encrypted_file_migrates_from_xor_legacy() {
        let dir = std::env::temp_dir().join(format!("cred_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let machine_key = derive_machine_key();
        let path = encrypted_path(&dir, "legacy-svc", "legacy-acct");
        // 手动写入旧 XOR 格式（无 magic header）
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let legacy_ciphertext = xor_cipher(b"legacy-secret", &machine_key);
        let legacy_encoded = hex::encode(&legacy_ciphertext);
        std::fs::write(&path, &legacy_encoded).unwrap();

        let store = CredentialStore::new_with_config_dir("legacy-svc", "legacy-acct", dir.clone());
        // 第一次读取：旧格式解密 + 自动迁移
        let got = store.get_password().unwrap();
        assert_eq!(got, "legacy-secret");

        // 验证文件已迁移为新格式（有 magic header）
        let migrated = std::fs::read_to_string(&path).unwrap();
        assert!(migrated.starts_with(CREDENTIAL_MAGIC), "file should be migrated to AES format");

        // 第二次读取：新格式解密
        let got2 = store.get_password().unwrap();
        assert_eq!(got2, "legacy-secret");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn file_store_nonexistent_returns_error() {
        let dir = std::env::temp_dir().join(format!("cred_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let store = CredentialStore::new_with_config_dir("no-svc", "no-acct", dir.clone());
        let result = store.get_password();
        assert!(result.is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn file_store_delete_nonexistent_is_ok() {
        let dir = std::env::temp_dir().join(format!("cred_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let store = CredentialStore::new_with_config_dir("no-svc", "no-acct", dir.clone());
        assert!(store.delete_password().is_ok());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Regression guard: credentials MUST survive an app restart. keyring v3.x
    /// has no default features, and without an explicit platform backend it
    /// silently selects the in-memory mock store (CredentialPersistence::
    /// EntryOnly): set_password "succeeds" in-process but the credential is
    /// gone in the next process. This test writes a credential, spawns a fresh
    /// subprocess (simulating restart) that reads it back, and fails if the
    /// value is not there. It passes via either the real platform keyring or
    /// the encrypted-file fallback — only the non-persistent mock store fails.
    #[test]
    fn credentials_persist_across_process_restart() {
        if std::env::var("ADL_CRED_PROBE_READ").is_ok() {
            let service =
                std::env::var("ADL_CRED_PROBE_SERVICE").expect("probe service env not set");
            let account =
                std::env::var("ADL_CRED_PROBE_ACCOUNT").expect("probe account env not set");
            let store = CredentialStore::new(&service, &account);
            let ok = store.get_password().ok().as_deref() == Some("probe-secret");
            std::process::exit(if ok { 0 } else { 1 });
        }

        let service = "adl-credential-persist-test";
        let account = format!("probe-{}", uuid::Uuid::new_v4());
        let store = CredentialStore::new(service, &account);
        if let Err(e) = store.set_password("probe-secret") {
            let _ = store.delete_password();
            panic!("credential write failed: {e:?}");
        }

        let exe = std::env::current_exe().expect("current test binary");
        let status = std::process::Command::new(exe)
            .arg("--exact")
            .arg("tests::credentials_persist_across_process_restart")
            .env("ADL_CRED_PROBE_READ", "1")
            .env("ADL_CRED_PROBE_SERVICE", service)
            .env("ADL_CRED_PROBE_ACCOUNT", &account)
            .status();
        // Clean up the probe credential on every path (including spawn failure),
        // so a failed test never leaks a credential into the OS keyring.
        let _ = store.delete_password();
        let status = match status {
            Ok(s) => s,
            Err(e) => panic!("spawn test subprocess: {e}"),
        };
        assert!(
            status.success(),
            "credential did not survive a process restart (keyring mock store?)"
        );
    }
}
