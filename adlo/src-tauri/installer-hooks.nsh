; Adlo 安装钩子：安装/卸载前结束 sidecar 进程。
;
; 为什么必须在这里做：应用内更新时 Tauri 会先退出主进程，但 `adl-server.exe`
; 是独立子进程；只要它还在跑，NSIS 覆盖这个文件就会弹
; 「Error opening file for writing」并把进度卡在 0%。
; 应用侧已经在安装前主动结束 sidecar，这里是兜底——手动双击安装包、
; 或从没有该修复的旧版本升级时，仍然靠它。
;
; 宏名固定为 Tauri v2 的 NSIS 钩子：NSIS_HOOK_PREINSTALL / NSIS_HOOK_PREUNINSTALL。

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping Adlo engine (adl-server.exe)..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM adl-server.exe /T'
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping Adlo engine (adl-server.exe)..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM adl-server.exe /T'
  Pop $0
!macroend
