use adl_browser::webview_handle::{Bounds, WebViewHandle};

struct MockHandle {
    id: String,
}

impl WebViewHandle for MockHandle {
    fn navigate(&self, _url: &str) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn close(&self) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn set_bounds(&self, _bounds: Bounds) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn eval_js(&self, _js: &str) -> Result<String, adl_errors::AppError> {
        Ok("".into())
    }
    fn get_favicon_data(&self) -> Result<Vec<u8>, adl_errors::AppError> {
        Ok(Vec::new())
    }
    fn set_color_scheme(&self, _scheme: &str) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn show(&self) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn hide(&self) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn set_zoom(&self, _factor: f64) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn mute(&self, _muted: bool) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn clear_cookies(&self) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn clear_cache(&self) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn go_back(&self) -> Result<bool, adl_errors::AppError> {
        Ok(true)
    }
    fn go_forward(&self) -> Result<bool, adl_errors::AppError> {
        Ok(true)
    }
    fn can_go_back(&self) -> Result<bool, adl_errors::AppError> {
        Ok(true)
    }
    fn can_go_forward(&self) -> Result<bool, adl_errors::AppError> {
        Ok(true)
    }
}

#[test]
fn mock_handle_implements_trait() {
    let h = MockHandle { id: "test".into() };
    assert!(h.navigate("https://example.com").is_ok());
    assert_eq!(h.id(), "test");
}

#[test]
fn mock_handle_bounds_roundtrip() {
    let bounds = Bounds { x: 10.0, y: 20.0, width: 800.0, height: 600.0 };
    let h = MockHandle { id: "bounds-test".into() };
    assert!(h.set_bounds(bounds.clone()).is_ok());
    assert_eq!(h.id(), "bounds-test");
}

#[test]
fn mock_handle_eval_js_returns_string() {
    let h = MockHandle { id: "eval-test".into() };
    let result = h.eval_js("1+1").unwrap();
    assert_eq!(result, "");
}

#[test]
fn mock_handle_get_favicon_data_returns_empty() {
    let h = MockHandle { id: "favicon-test".into() };
    assert!(h.get_favicon_data().unwrap().is_empty());
}

#[test]
fn mock_handle_color_scheme() {
    let h = MockHandle { id: "color-test".into() };
    assert!(h.set_color_scheme("dark").is_ok());
}

#[test]
fn mock_handle_show_hide_zoom() {
    let h = MockHandle { id: "view-test".into() };
    assert!(h.show().is_ok());
    assert!(h.hide().is_ok());
    assert!(h.set_zoom(1.5).is_ok());
}

#[test]
fn mock_handle_mute_clear() {
    let h = MockHandle { id: "clean-test".into() };
    assert!(h.mute(true).is_ok());
    assert!(h.clear_cookies().is_ok());
    assert!(h.clear_cache().is_ok());
}

#[test]
fn mock_handle_back_forward() {
    let h = MockHandle { id: "nav-test".into() };
    assert!(h.go_back().unwrap());
    assert!(h.go_forward().unwrap());
}
