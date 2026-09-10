use async_trait::async_trait;

/// PTY 会话状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PtyStatus {
    Running,
    Terminated,
}

/// 退出状态
#[derive(Debug, Clone, Copy)]
pub enum ExitStatus {
    Exited(u32),
    Signaled(i32),
}

impl ExitStatus {
    pub fn success(&self) -> bool {
        matches!(self, ExitStatus::Exited(0))
    }
    
    pub fn exit_code(&self) -> u32 {
        match self {
            ExitStatus::Exited(code) => *code,
            ExitStatus::Signaled(sig) => *sig as u32,
        }
    }
}

/// PTY 会话 trait
#[async_trait]
pub trait PtySession: Send + Sync {
    /// 获取会话 ID
    fn id(&self) -> &str;
    
    /// 获取 shell 名称
    fn shell(&self) -> &str;
    
    /// 获取工作目录
    fn cwd(&self) -> &str;
    
    /// 获取当前状态
    fn status(&self) -> PtyStatus;
    
    /// 获取终端尺寸 (cols, rows)
    fn size(&self) -> (u16, u16);
    
    /// 异步读取输出
    async fn read(&self, buf: &mut [u8]) -> std::result::Result<usize, std::io::Error>;
    
    /// 异步写入输入
    async fn write(&self, data: &[u8]) -> std::result::Result<(), std::io::Error>;
    
    /// 调整终端尺寸
    async fn resize(&self, cols: u16, rows: u16) -> std::result::Result<(), std::io::Error>;
    
    /// 终止会话
    async fn kill(&self) -> std::result::Result<(), std::io::Error>;
    
    /// 等待会话结束
    async fn wait(&self) -> std::result::Result<ExitStatus, std::io::Error>;
    
    /// 非阻塞检查退出状态
    fn try_wait(&self) -> std::result::Result<Option<ExitStatus>, std::io::Error>;
}

/// PTY 系统 trait
#[async_trait]
pub trait PtySystem: Send + Sync {
    /// 会话类型
    type Session: PtySession;
    
    /// 创建新的 PTY 会话
    async fn spawn(
        &self,
        program: &str,
        args: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> std::result::Result<Self::Session, std::io::Error>;
}
