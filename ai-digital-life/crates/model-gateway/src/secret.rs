//! Credential management — store, retrieve, and clear API keys for
//! model providers via the credential crate (keyring + encrypted file
//! fallback).

use adl_errors::AppError;
const KEYRING_SERVICE: &str = "ai-digital-life";

pub fn set_provider_secret(provider: &str, secret: &str) -> Result<(), AppError> {
    let store = adl_credential::CredentialStore::new(KEYRING_SERVICE, provider);
    store.set_password(secret)
}

pub fn clear_provider_secret(provider: &str) -> Result<(), AppError> {
    let store = adl_credential::CredentialStore::new(KEYRING_SERVICE, provider);
    store.delete_password()
}

pub fn get_provider_secret(provider: &str) -> Result<String, AppError> {
    let store = adl_credential::CredentialStore::new(KEYRING_SERVICE, provider);
    store.get_password()
}
