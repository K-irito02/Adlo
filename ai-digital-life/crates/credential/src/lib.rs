use adl_errors::AppError;
use dirs::config_dir;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::path::PathBuf;

const CREDENTIALS_SUBDIR: &str = "ai-digital-life/credentials";

const DEFAULT_SERVICE: &str = "ai-digital-life";
/// CI access token 在凭证系统中的账号名
pub const CI_CREDENTIAL_ACCOUNT: &str = "ci-access-token";

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
            }
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
            }
            StoreBackend::EncryptedFile { config_dir, machine_key } => {
                let path = encrypted_path(config_dir, &self.service, &self.account);
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        AppError::Storage(format!("Failed to create credentials dir: {}", e))
                    })?;
                }
                let ciphertext = xor_cipher(password.as_bytes(), machine_key);
                let encoded = hex::encode(&ciphertext);
                std::fs::write(&path, &encoded).map_err(|e| {
                    AppError::Storage(format!("Failed to write credential file: {}", e))
                })
            }
        }
    }

    pub fn get_password(&self) -> Result<String, AppError> {
        match &self.store {
            StoreBackend::Keyring(entry) => match entry.get_password() {
                Ok(pw) => Ok(pw),
                Err(keyring::Error::NoEntry) => {
                    Err(AppError::Security("No credential found".into()))
                }
                Err(e) => Err(AppError::Security(e.to_string())),
            },
            StoreBackend::EncryptedFile { config_dir, machine_key } => {
                let path = encrypted_path(config_dir, &self.service, &self.account);
                let encoded = std::fs::read_to_string(&path).map_err(|e| {
                    if e.kind() == std::io::ErrorKind::NotFound {
                        AppError::Security("No credential found".into())
                    } else {
                        AppError::Storage(format!("Failed to read credential file: {}", e))
                    }
                })?;
                let ciphertext = hex::decode(encoded.trim()).map_err(|e| {
                    AppError::Storage(format!("Invalid credential file format: {}", e))
                })?;
                let plaintext = xor_cipher(&ciphertext, machine_key);
                String::from_utf8(plaintext)
                    .map_err(|e| AppError::Storage(format!("Invalid credential data: {}", e)))
            }
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
                    }
                }
            }
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
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

fn resolve_machine_id() -> String {
    if let Ok(id) = try_platform_machine_id() {
        return id;
    }
    match config_dir() {
        Some(base) => {
            let path = base.join("ai-digital-life-machine-id");
            if let Ok(id) = std::fs::read_to_string(&path) {
                let trimmed = id.trim().to_string();
                if !trimmed.is_empty() {
                    return trimmed;
                }
            }
            let id = uuid::Uuid::new_v4().to_string();
            let _ = std::fs::write(&path, &id);
            id
        }
        None => uuid::Uuid::new_v4().to_string(),
    }
}

#[cfg(target_os = "linux")]
fn try_platform_machine_id() -> Result<String, ()> {
    let path = Path::new("/etc/machine-id");
    if path.exists() {
        std::fs::read_to_string(path).map(|s| s.trim().to_string()).map_err(|_| ())
    } else {
        Err(())
    }
}

#[cfg(target_os = "macos")]
fn try_platform_machine_id() -> Result<String, ()> {
    let candidates = &["/var/db/.MachineUuid", "/System/Library/CoreServices/SystemVersion.plist"];
    for candidate in candidates {
        let path = Path::new(candidate);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                let trimmed = content.trim().to_string();
                if !trimmed.is_empty() {
                    return Ok(trimmed);
                }
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
            if let Ok(content) = std::fs::read_to_string(&path) {
                let trimmed = content.trim().to_string();
                if !trimmed.is_empty() {
                    return Ok(trimmed);
                }
            }
        }
        let id = uuid::Uuid::new_v4().to_string();
        if std::fs::write(&path, &id).is_ok() {
            return Ok(id);
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
}
