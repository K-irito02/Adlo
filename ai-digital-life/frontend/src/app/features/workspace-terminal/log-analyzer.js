// 日志分析器 - 在浏览器控制台中运行此脚本

function getTestLogs() {
  try {
    const stored = localStorage.getItem('terminal-test-logs');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading logs:', e);
  }
  return [];
}

function analyzeLogs() {
  const logs = getTestLogs();
  
  console.log('%c=== Terminal Workspace Default Profile Test Logs ===', 'font-weight: bold; color: #22c55e');
  console.log(`Total log entries: ${logs.length}`);
  console.log('');
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    console.log(`${i + 1}. [${log.timestamp}] ${log.message}`);
    if (log.data) {
      console.log('   Data:', log.data);
    }
    console.log('');
  }
  
  // 分析日志
  const setProfileCalls = logs.filter(log => 
    log.message === "Setting workspace default profile" || 
    log.message === "Setting global default profile"
  );
  
  console.log('%c=== Analysis ===', 'font-weight: bold; color: #22c55e');
  console.log(`Total profile set calls: ${setProfileCalls.length}`);
  
  if (setProfileCalls.length > 0) {
    console.log('\nProfile set history:');
    for (const call of setProfileCalls) {
      const { profile, workspaceId } = call.data;
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
    console.log('%c\nWARNING: handleSelectDefaultProfile was never called!', 'color: #ef4444; font-weight: bold');
    console.log('This means the click handler is not being triggered.');
    console.log('Possible issues:');
    console.log('1. The onClick handler is not properly attached');
    console.log('2. The menu item is not clickable');
    console.log('3. There is a preventDefault or stopPropagation preventing the click');
  } else {
    console.log('%c\nSUCCESS: handleSelectDefaultProfile was called!', 'color: #22c55e; font-weight: bold');
    
    // 检查状态是否正确更新
    const workspaceProfiles = localStorage.getItem('adl-ui:terminal-workspace-default-profiles');
    if (workspaceProfiles) {
      console.log('\nCurrent workspace profiles from localStorage:');
      console.log(JSON.parse(workspaceProfiles));
    }
    
    const defaultProfile = localStorage.getItem('adl-ui:terminal-default-profile');
    if (defaultProfile) {
      console.log(`\nCurrent global default profile: ${defaultProfile}`);
    }
  }
}

function clearTestLogs() {
  localStorage.removeItem('terminal-test-logs');
  console.log('Test logs cleared!');
}

// 暴露到全局对象
window.analyzeTerminalLogs = analyzeLogs;
window.clearTerminalLogs = clearTestLogs;

console.log('%cLog analyzer loaded!', 'color: #3b82f6; font-weight: bold');
console.log('Run analyzeTerminalLogs() to see test results');
console.log('Run clearTerminalLogs() to clear logs');