//! `ad-server` — standalone HTTP engine for the AI Digital Life app.
//!
//! Usage: `ad-server [--port <u16>] [--data-dir <path>]`
//!
//! After binding, the real bound port is printed to stdout as the
//! machine-parseable line `AD_SERVER_PORT=<port>` (then flushed), and the
//! process serves until killed. Tracing is owned by `LogManager` (installed
//! during `init_server_state`); stdout keeps the machine line reachable even
//! though the log layer also writes there.

use ad_server::engine::{init_server_state, serve};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let mut port: u16 = 0;
    let mut data_dir = std::env::temp_dir();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => {
                if let Some(value) = args.next() {
                    if let Ok(p) = value.parse() {
                        port = p;
                    }
                }
            },
            "--data-dir" => {
                if let Some(path) = args.next() {
                    data_dir = PathBuf::from(path);
                }
            },
            _ => {},
        }
    }

    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        eprintln!("[ad-server] failed to create data dir {}: {e}", data_dir.display());
        std::process::exit(1);
    }

    let state = match init_server_state(&data_dir).await {
        Ok(state) => state,
        Err(e) => {
            eprintln!("[ad-server] init failed: {e:#}");
            std::process::exit(1);
        },
    };

    let bound = serve(state, port).await;
    println!("AD_SERVER_PORT={bound}");
    // stdout to a pipe is block-buffered; flush so the parent/probe sees the
    // port line immediately.
    std::io::stdout().flush().ok();

    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}
