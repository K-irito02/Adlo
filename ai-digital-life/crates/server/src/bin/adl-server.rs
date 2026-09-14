#![allow(linker_messages)]

use adl_server::engine::{init_server_state, serve};
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
        eprintln!("[adl-server] failed to create data dir {}: {e}", data_dir.display());
        std::process::exit(1);
    }

    let locator = adl_kernel::storage::load_locator();
    let storage = adl_server::engine::storage_from_locator(&locator, &data_dir);

    let state = match init_server_state(&data_dir, storage.clone()).await {
        Ok(state) => state,
        Err(e) => {
            eprintln!("[adl-server] init failed: {e:#}");
            std::process::exit(1);
        },
    };

    let bound = serve(state, port).await;
    println!("AD_SERVER_PORT={bound}");
    std::io::stdout().flush().ok();

    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}
