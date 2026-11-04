use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const TEST_SERVICE: &str = "adl-integration-test";
const TEST_ACCOUNT: &str = "test-provider";

// 本 binary 内多测试并行共用 test_dir：pid + nanos 同 tick 会共名，结尾
// remove_dir_all 误删他人目录 → flake；单调计数保证每次调用唯一。
static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn test_dir() -> PathBuf {
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let pid = std::process::id();
    let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    std::env::temp_dir().join(format!("adl_cred_int_{}_{}_{}", pid, ts, n))
}

#[test]
fn round_trip_file_fallback() {
    let dir = test_dir();
    std::fs::create_dir_all(&dir).unwrap();

    let store = adl_credential::CredentialStore::new_with_config_dir(
        TEST_SERVICE,
        TEST_ACCOUNT,
        dir.clone(),
    );
    store.set_password("my-secret-api-key").unwrap();
    let retrieved = store.get_password().unwrap();
    assert_eq!(retrieved, "my-secret-api-key");
    store.delete_password().unwrap();
    let result = store.get_password();
    assert!(result.is_err(), "expected error after deletion");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn multiple_accounts_independent() {
    let dir = test_dir();
    std::fs::create_dir_all(&dir).unwrap();

    let s1 =
        adl_credential::CredentialStore::new_with_config_dir(TEST_SERVICE, "acct1", dir.clone());
    let s2 =
        adl_credential::CredentialStore::new_with_config_dir(TEST_SERVICE, "acct2", dir.clone());

    s1.set_password("secret1").unwrap();
    s2.set_password("secret2").unwrap();

    assert_eq!(s1.get_password().unwrap(), "secret1");
    assert_eq!(s2.get_password().unwrap(), "secret2");

    s1.delete_password().unwrap();
    assert!(s1.get_password().is_err());
    assert_eq!(s2.get_password().unwrap(), "secret2");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn overwrite_existing_credential() {
    let dir = test_dir();
    std::fs::create_dir_all(&dir).unwrap();

    let store = adl_credential::CredentialStore::new_with_config_dir(
        TEST_SERVICE,
        "overwrite-test",
        dir.clone(),
    );
    store.set_password("first-value").unwrap();
    assert_eq!(store.get_password().unwrap(), "first-value");
    store.set_password("second-value").unwrap();
    assert_eq!(store.get_password().unwrap(), "second-value");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn delete_nonexistent_is_idempotent() {
    let dir = test_dir();
    std::fs::create_dir_all(&dir).unwrap();

    let store =
        adl_credential::CredentialStore::new_with_config_dir(TEST_SERVICE, "ghost", dir.clone());
    assert!(store.delete_password().is_ok());
    assert!(store.delete_password().is_ok());

    std::fs::remove_dir_all(&dir).ok();
}
