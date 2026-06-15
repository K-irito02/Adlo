mod ci_cache;
mod ci_client;
mod ci_parser;

pub use ci_client::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_client_is_created() {
        let _client = CiStatusClient::new();
    }

    #[test]
    fn build_auth_header_without_token_is_none() {
        let client = CiStatusClient::new();
        let header = client.build_auth_header(&None);
        assert!(header.is_none());
    }

    #[test]
    fn build_auth_header_with_empty_token_is_none() {
        let client = CiStatusClient::new();
        let header = client.build_auth_header(&Some(String::new()));
        assert!(header.is_none());
    }

    #[test]
    fn build_auth_header_with_token_present() {
        let client = CiStatusClient::new();
        let header = client.build_auth_header(&Some("ghp_abc".to_string()));
        assert!(header.is_some());
    }
}
