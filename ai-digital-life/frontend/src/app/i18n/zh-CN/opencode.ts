export const opencodeZh = {
  settingsOpencode: 'OpenCode CLI',
  // 版本卡片通用文案见 harnessVersion 域；这里只保留 OpenCode 组专属插槽文案。
  // （搜索索引 `settingsSearchIndex` 的 opencode 块引用本域行键做定位文案，
  // 行键取值须与卡片渲染的通用文案逐字相同。）
  opencodeVersionTitle: 'OpenCode CLI 版本管理',
  opencodeVersionHint:
    '应用内托管的 OpenCode CLI 版本：安装后新开的终端会话可直接输入 opencode 使用。',
  opencodeSourceTitle: '版本来源',
  opencodeSourceDesc: '选择 OpenCode CLI 版本的来源',
  opencodeSourceHint:
    '决定优先使用哪一个 OpenCode CLI 版本。自动检测的优先级：本应用装好的版本（宿主托管）→ 你电脑上安装的版本（系统安装）。\n· 下拉框始终显示你的选择（自动检测／系统安装／宿主托管）；它下方那行蓝色小字是自动检测实际解析到的来源，方便你确认。\n· 下方的“检查更新、正式版本、预发布版本”是否显示，代表本应用当前是否能管理版本：显示即可在这里安装、切换或卸载；只有“系统安装”实际生效时才隐藏（此时版本由你自己维护）。',
  opencodeSourceAuto: '自动检测',
  opencodeSourceSystem: '系统安装',
  opencodeSourceHost: '宿主托管',
  opencodeSystemManagedNote:
    '当前使用的是你自己安装的版本（系统安装），本应用不会修改它。\n· 想在这里安装、切换或卸载版本，请把“版本来源”改为“宿主托管”。',
  opencodeNoSourceHostNote:
    '“宿主托管”下没有可用的版本，新终端会话将无法使用 opencode 命令。请在下面安装一个版本，或把“版本来源”切换回有版本的来源。',
  opencodeNoSourceAutoNote:
    '没有任何可用的版本，新终端会话将无法使用 opencode 命令。请在下方安装一个版本。',
  opencodeCurrentVersion: '当前版本',
  opencodeCurrentVersionDesc: '现在正在用的 OpenCode CLI 版本',
  opencodeCurrentVersionHint:
    '这里只显示当前实际在用的 OpenCode CLI 版本号；来源见上方的“版本来源”。\n· 应用内版本：由本应用安装和管理，可以随时安装、切换或卸载。\n· 系统安装：你自己在电脑上安装的版本，本应用只使用，不会修改它。\n· 同一时间只会有一个生效版本：以“版本来源”的偏好解析为准。\n安装、切换或卸载完成后，新开的终端会话即按新版本生效，不需要你手动重启应用。',
  opencodeUpdate: '检查更新',
  opencodeUpdateDesc: '看看有没有更新的版本',
  opencodeUpdateHint:
    '点一下就去官方源查一遍，有新版本会在「检查更新」这一行标出来，预发布的新版本也会提示。如果查不到（比如没联网），会告诉你检查失败。',
  opencodeCheckUpdateFailed: '检查更新失败',
  opencodeCheckUpdateNoStable: '官方暂无正式版本',
  opencodeCheckUpdateFound: '发现正式版本 {version}',
  opencodeCheckUpdatePrerelease: '发现预发布版本 {version}',
  opencodeStable: '正式版本',
  opencodeStableDesc: '官方发布的正式版本',
  opencodeStableHint:
    '正式版本是推荐给大多数人用的版本，平时用它们就好。\n· 版本选择下拉框：点一下展开本通道可用的正式版本（默认选中当前版本或本通道最新）；点某个版本只切换下拉框展示，不会立即安装或切换。\n· 右侧按钮随选中版本动态变化：没装过的显示“安装”；已安装的显示“卸载/重装”；已安装但非当前的再加“切换”。\n· 安装是真下载：从下载源把该版本装到应用数据目录并选中它，成功后新开的终端会话即生效。',
  opencodePrerelease: '预发布版本',
  opencodePrereleaseDesc: '可提前体验新功能，预发布版本可能不稳定',
  opencodePrereleaseHint:
    '预发布版本是还没正式发布的新版本，能提前体验新功能，但也可能有没发现的问题。\n· 版本选择下拉框与右侧按钮的用法和正式版本完全一致，区别只在于版本本身可能不稳定。',
  opencodeOfficialLinksLabel: '官方版本信息',
  opencodeOfficialLinksDesc: '完整版本列表、发布时间和更新详情都在官方这里：',
  opencodeNpmPage: 'npm 包页面',
  opencodeGithubReleases: 'GitHub Releases',
  opencodeSourceSummaryTitle: '当前下载源',
  opencodeSourceSummaryHint:
    '当前实际在用的下载地址。\n· 只读显示，去网络那一组修改\n· 自动检测会在官方和镜像之间选更快能连通的一个',
  opencodeSourceSummaryGoModify: '前往修改',
  opencodeTerminalNote: '安装后新开终端会话即可直接使用；已打开的终端需要重开。',
  opencodeTerminalInjection: '新终端窗口自动启用',
  opencodeTerminalInjectionHint:
    '打开后，新建的终端会话会自动把宿主托管的目录放到 PATH 最前面，可直接输入 opencode 使用；关闭后新会话不再注入。只影响新会话，已打开的终端保持不变。',
  opencodeTerminalInjectionSaved: '终端可用性已保存',
  harnessWizardTitle: '安装 harness',
  harnessWizardDesc:
    '应用可以托管 DSH 与 OpenCode CLI 的版本；现在安装，或稍后在对应设置组里安装。',
  harnessWizardDsh: 'DSH（Web 形态）',
  harnessWizardOpencode: 'OpenCode CLI',
  harnessWizardInstalled: '已安装',
  harnessWizardMissing: '未安装',
  harnessWizardInstall: '安装',
  harnessWizardInstalling: '安装中…',
  harnessWizardSkip: '稍后再说',
  harnessWizardFailed: '安装失败，可稍后重试',
  harnessWizardNodeHint: 'DSH 需要先安装 Node.js（在「环境」设置组中安装）。',
  harnessWizardNonBlocking: '安装失败不会影响应用使用；随时可以在设置组里重试。',
  harnessWizardDetecting: '正在检测已安装的 harness…',
};
