use adl_errors::AppError;
use adl_kernel::ModelProviderId;

const KEYRING_SERVICE: &str = "ai-digital-life";

pub fn set_provider_secret(provider: ModelProviderId, secret: &str) -> Result<(), AppError> {
    let store = adl_credential::CredentialStore::new(KEYRING_SERVICE, provider.as_str());
    store.set_password(secret)
}

pub fn clear_provider_secret(provider: ModelProviderId) -> Result<(), AppError> {
    let store = adl_credential::CredentialStore::new(KEYRING_SERVICE, provider.as_str());
    store.delete_password()
}

pub fn get_provider_secret(provider: ModelProviderId) -> Result<String, AppError> {
    let store = adl_credential::CredentialStore::new(KEYRING_SERVICE, provider.as_str());
    store.get_password()
}
