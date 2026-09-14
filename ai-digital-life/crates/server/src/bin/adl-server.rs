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

    let defaults = adl_kernel::storage::StorageDefaults {
        root: data_dir.clone(),
        credentials_dir: adl_kernel::storage::locator::locator_dir().join("credentials"),
        downloads_dir: data_dir.clone(),
    };

    // A11：迁移必须先于任何 DB/日志句柄打开，且先于 storage 构造——迁移会改写 locator
    // 的根，`build_storage_after_migration` 保证 storage 解析的是迁移后的 locator。
    let storage = adl_server::engine::build_storage_after_migration(&defaults, &data_dir);

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
