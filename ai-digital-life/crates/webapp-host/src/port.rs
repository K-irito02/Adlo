use std::net::TcpListener;

use adl_errors::AppError;

/// 绑定一个临时端口以探测空闲端口号，随后关闭监听返回端口。
pub fn pick_free_port() -> Result<u16, AppError> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::Io(format!("bind ephemeral port failed: {e}")))?;
    let port =
        listener.local_addr().map_err(|e| AppError::Io(format!("local_addr failed: {e}")))?.port();
    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_a_port_in_valid_range() {
        let port = pick_free_port().expect("port should be picked");
        assert!(port > 0, "port must be > 0");
    }
}
