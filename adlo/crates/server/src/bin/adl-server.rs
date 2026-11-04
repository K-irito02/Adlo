#![allow(linker_messages)]

use adl_server::engine::{init_server_state, serve};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();

    // CLI 日志覆盖（session-only）：ad-server 由 shell 派生时继承 shell 的环境变量，
    // 独立启动（`dev:preview`）时则由本入口解析自身 flag 并写回环境，供 engine 读取。
    adl_logging::LogOverrides::from_cli_args(&argv).export_to_env();

    let mut port: u16 = 0;
    let mut data_dir = std::env::temp_dir();
    let mut print_env = false;
    let mut args = argv.iter();
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
            // 诊断用：初始化（含启动期 PATH 刷新）后打印进程 PATH 与注入目录，立即退出。
            // 供 `env_path_cli` 集成测试与 Agent 排查“安装成功但不可用”使用。
            "--print-env" => print_env = true,
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

    if print_env {
        let root = state.storage.paths().root.clone();
        let dirs = adl_env::path_env::path_dirs(&root).unwrap_or_default();
        let payload = serde_json::json!({
            "path": std::env::var_os("PATH").unwrap_or_default().to_string_lossy().to_string(),
            "pathDirs": dirs.iter().map(|dir| dir.to_string_lossy().to_string()).collect::<Vec<_>>(),
        });
        println!("ADL_ENV_JSON={payload}");
        std::io::stdout().flush().ok();
        std::process::exit(0);
    }

    let bound = serve(state, port).await;
    println!("AD_SERVER_PORT={bound}");
    std::io::stdout().flush().ok();

    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}
