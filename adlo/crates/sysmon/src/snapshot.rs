use adl_types::types::system_monitor::{DiskStat, NetStat, ProcessStat, SystemSnapshot};
use sysinfo::{ProcessesToUpdate, System};

/// 系统快照中最多保留的进程条数。
pub const TOP_N_PROCESSES: usize = 25;

/// 基于 sysinfo 的系统快照收集器。持有可复用的 `System`/`Disks`/`Networks`
/// 实例，多次调用 `snapshot()` 可得到稳定的 CPU/网络速率差分采样。
pub struct SystemMonitor {
    sys: System,
    disks: sysinfo::Disks,
    networks: sysinfo::Networks,
    /// 网络接口名 -> (累计接收字节, 累计发送字节)，用于两次采样间差分求速率。
    last_net: std::collections::HashMap<String, (u64, u64)>,
    /// 上次采样时间戳（毫秒），用于计算网络速率时间差。
    last_ts_ms: u64,
}

impl Default for SystemMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemMonitor {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        Self {
            sys,
            disks: sysinfo::Disks::new_with_refreshed_list(),
            networks: sysinfo::Networks::new_with_refreshed_list(),
            last_net: Default::default(),
            last_ts_ms: 0,
        }
    }

    pub fn snapshot(&mut self) -> SystemSnapshot {
        // CPU：需前后两次采样才能得到有效使用率，"new()" 内已做首次采样以完成 warm-up。
        self.sys.refresh_cpu_usage();
        let per_core: Vec<f32> = self.sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let cpu_total = per_core.iter().sum::<f32>() / (per_core.len().max(1) as f32);

        // 内存 / swap：sysinfo 0.39 直接返回字节数（非 KB），无需额外换算。
        self.sys.refresh_memory();
        let memory_used = self.sys.used_memory();
        let memory_total = self.sys.total_memory();
        let swap_used = self.sys.used_swap();
        let swap_total = self.sys.total_swap();

        // 磁盘
        self.disks.refresh(false);
        let disks: Vec<DiskStat> = self
            .disks
            .list()
            .iter()
            .map(|d| DiskStat {
                mount: d.mount_point().to_string_lossy().to_string(),
                total: d.total_space(),
                available: d.available_space(),
            })
            .collect();

        // 网络速率：自上次采样的字节差 / 时间差。首次采样由于无基线，速率为 0 可接受。
        self.networks.refresh(false);
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let mut networks = Vec::new();
        let dt_ms = (now_ms.saturating_sub(self.last_ts_ms)).max(1) as f64;
        if self.last_ts_ms != 0 {
            for (name, data) in &self.networks {
                let rx = data.total_received();
                let tx = data.total_transmitted();
                if let Some((prx, ptx)) = self.last_net.get(name) {
                    networks.push(NetStat {
                        name: name.clone(),
                        rx_bps: ((rx.saturating_sub(*prx)) as f64 / dt_ms * 1000.0) as u64,
                        tx_bps: ((tx.saturating_sub(*ptx)) as f64 / dt_ms * 1000.0) as u64,
                    });
                }
                self.last_net.insert(name.clone(), (rx, tx));
            }
        }
        self.last_ts_ms = now_ms;

        // 进程 Top-N：只刷新所需维度（CPU + 内存），按 CPU 降序、内存次级排序。
        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            sysinfo::ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        let mut procs: Vec<ProcessStat> = self
            .sys
            .processes()
            .iter()
            .map(|(pid, p)| ProcessStat {
                pid: pid.as_u32(),
                name: p.name().to_string_lossy().to_string(),
                cpu_usage: p.cpu_usage(),
                memory: p.memory(),
            })
            .collect();
        procs.sort_by(|a, b| {
            b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal)
        });
        procs.truncate(TOP_N_PROCESSES);

        SystemSnapshot {
            cpu_total,
            cpu_per_core: per_core,
            memory_used,
            memory_total,
            swap_used,
            swap_total,
            disks,
            networks,
            processes: procs,
            uptime_secs: System::uptime(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_is_well_formed() {
        let mut m = SystemMonitor::new();
        m.snapshot(); // warm-up（CPU 需要两次采样）
        let s = m.snapshot();
        assert!(s.memory_total >= s.memory_used);
        assert!(!s.cpu_per_core.is_empty());
        assert!(s.cpu_total.is_finite());
        assert!(!s.processes.is_empty());
    }

    #[test]
    fn process_list_respects_top_n() {
        let mut m = SystemMonitor::new();
        let mut s = m.snapshot();
        assert!(s.processes.len() <= TOP_N_PROCESSES);
        // 第二次快照后（last_ts 非 0）进程数仍应受 TOP_N 约束。
        let _ = m.snapshot();
        s = m.snapshot();
        assert!(s.processes.len() <= TOP_N_PROCESSES);
    }
}
