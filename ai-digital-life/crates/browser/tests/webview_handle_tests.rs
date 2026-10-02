use adl_browser::webview_handle::{
    Bounds, DIVIDER_STRIP_WIDTH_MAX, DIVIDER_STRIP_WIDTH_MIN, WebViewHandle, sanitize_strip_bounds,
};

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
    fn set_color_scheme(&self, _scheme: &str) -> Result<(), adl_errors::AppError> {
        Ok(())
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn show(&self) -> Result<(), adl_errors::AppError> {
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
fn mock_handle_color_scheme() {
    let h = MockHandle { id: "color-test".into() };
    assert!(h.set_color_scheme("dark").is_ok());
}

#[test]
fn mock_handle_show_zoom() {
    let h = MockHandle { id: "view-test".into() };
    assert!(h.show().is_ok());
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

#[test]
fn sanitize_strip_bounds_keeps_sane_values() {
    let b = sanitize_strip_bounds(&Bounds { x: 100.0, y: 50.0, width: 6.0, height: 800.0 })
        .expect("sane bounds");
    assert_eq!((b.x, b.y, b.width, b.height), (100.0, 50.0, 6.0, 800.0));
}

#[test]
fn sanitize_strip_bounds_clamps_degenerate_values() {
    let narrow = sanitize_strip_bounds(&Bounds { x: 0.0, y: 0.0, width: 0.0, height: 600.0 })
        .expect("zero width clamps");
    assert_eq!(narrow.width, DIVIDER_STRIP_WIDTH_MIN);
    let wide = sanitize_strip_bounds(&Bounds { x: 0.0, y: 0.0, width: 100.0, height: 600.0 })
        .expect("huge width clamps");
    assert_eq!(wide.width, DIVIDER_STRIP_WIDTH_MAX);
    let flat = sanitize_strip_bounds(&Bounds { x: 0.0, y: 0.0, width: 6.0, height: 0.0 })
        .expect("zero height clamps");
    assert_eq!(flat.height, 1.0);
}

#[test]
fn sanitize_strip_bounds_rejects_non_finite() {
    for bounds in [
        Bounds { x: f64::NAN, y: 0.0, width: 6.0, height: 600.0 },
        Bounds { x: 0.0, y: f64::INFINITY, width: 6.0, height: 600.0 },
        Bounds { x: 0.0, y: 0.0, width: f64::NAN, height: 600.0 },
        Bounds { x: 0.0, y: 0.0, width: 6.0, height: f64::NEG_INFINITY },
    ] {
        assert!(sanitize_strip_bounds(&bounds).is_none());
    }
}
