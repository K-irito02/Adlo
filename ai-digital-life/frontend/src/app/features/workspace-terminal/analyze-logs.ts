import { getTestLogs, clearTestLogs } from "./test-log";

export function analyzeLogs(): void {
  const logs = getTestLogs();
  
  console.log("=== Terminal Workspace Default Profile Test Logs ===");
  console.log(`Total log entries: ${logs.length}`);
  console.log("");
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    console.log(`${i + 1}. [${log.timestamp}] ${log.message}`);
    if (log.data) {
      console.log("   Data:", JSON.stringify(log.data, null, 2));
    }
    console.log("");
  }
  
  // 分析日志
  const setProfileCalls = logs.filter(log => 
    log.message === "Setting workspace default profile" || 
    log.message === "Setting global default profile"
  );
  
  console.log("=== Analysis ===");
  console.log(`Total profile set calls: ${setProfileCalls.length}`);
  
  if (setProfileCalls.length > 0) {
    console.log("\nProfile set history:");
    for (const call of setProfileCalls) {
      const { profile, workspaceId } = call.data as Record<string, string>;
      if (workspaceId) {
        console.log(`- Workspace '${workspaceId}' -> ${profile}`);
      } else {
        console.log(`- Global -> ${profile}`);
      }
    }
  }
  
  // 检查是否有调用 handleSelectDefaultProfile
  const handleCalls = logs.filter(log => log.message === "handleSelectDefaultProfile called");
  console.log(`\nTotal handleSelectDefaultProfile calls: ${handleCalls.length}`);
  
  if (handleCalls.length === 0) {
    console.log("\nWARNING: handleSelectDefaultProfile was never called!");
    console.log("This means the click handler is not being triggered.");
  }
}

export function reportLogs(): string {
  const logs = getTestLogs();
  
  let report = "=== Terminal Workspace Default Profile Test Logs ===\n";
  report += `Total log entries: ${logs.length}\n\n`;
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    report += `${i + 1}. [${log.timestamp}] ${log.message}\n`;
    if (log.data) {
      report += `   Data: ${JSON.stringify(log.data)}\n`;
    }
    report += "\n";
  }
  
  const setProfileCalls = logs.filter(log => 
    log.message === "Setting workspace default profile" || 
    log.message === "Setting global default profile"
  );
  
  report += "=== Analysis ===\n";
  report += `Total profile set calls: ${setProfileCalls.length}\n`;
  
  if (setProfileCalls.length > 0) {
    report += "\nProfile set history:\n";
    for (const call of setProfileCalls) {
      const { profile, workspaceId } = call.data as Record<string, string>;
      if (workspaceId) {
        report += `- Workspace '${workspaceId}' -> ${profile}\n`;
      } else {
        report += `- Global -> ${profile}\n`;
      }
    }
  }
  
  const handleCalls = logs.filter(log => log.message === "handleSelectDefaultProfile called");
  report += `\nTotal handleSelectDefaultProfile calls: ${handleCalls.length}\n`;
  
  if (handleCalls.length === 0) {
    report += "\nWARNING: handleSelectDefaultProfile was never called!\n";
    report += "This means the click handler is not being triggered.\n";
  }
  
  return report;
}

// 自动运行分析
analyzeLogs();

export { clearTestLogs } from "./test-log";