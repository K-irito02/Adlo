/// Windows: report memory pressure when available physical RAM is < 1 GiB,
/// or the installed-memory load is > 90%. Non-Windows always returns false.
#[cfg(windows)]
pub fn system_memory_pressured() -> bool {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut mem = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // Safety: `mem` is a fully-initialized struct passed by mut pointer.
    // (windows 0.61 `GlobalMemoryStatusEx` returns `Result<()>`, checked via `is_err`.)
    if unsafe { GlobalMemoryStatusEx(&mut mem) }.is_err() {
        return false;
    }
    mem.ullAvailPhys < 1_074_741_824 || mem.dwMemoryLoad > 90
}

#[cfg(not(windows))]
pub fn system_memory_pressured() -> bool {
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn threshold_logic_short_circuits_on_low_avail() {
        let pressure = |avail: u64, load: u32| avail < 1_074_741_824 || load > 90;
        assert!(pressure(500_000_000, 10));
        assert!(!pressure(8_589_934_592, 10));
        assert!(pressure(8_589_934_592, 95));
    }
}
