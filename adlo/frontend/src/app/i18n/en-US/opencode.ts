export const opencodeEn = {
  settingsOpencode: 'OpenCode CLI',
  // Shared version-card copy lives in the harnessVersion domain; keep only OpenCode slot copy here.
  // (The settings-search opencode block references these row keys for locate text;
  // row key values must match the generic copy rendered by the card verbatim.)
  opencodeVersionTitle: 'OpenCode CLI version management',
  opencodeVersionHint:
    'App-managed OpenCode CLI versions. After installing, new terminal sessions can run opencode directly.',
  opencodeSourceTitle: 'Version source',
  opencodeSourceDesc: 'Choose which OpenCode CLI build to use',
  opencodeSourceHint:
    'Decides which OpenCode CLI build takes effect. Automatic resolves in this order: a version this app installed (host-managed) → a version installed on your computer (system install).\n· The dropdown always shows your choice (Automatic / System install / Host-managed); the blue line under it tells you which source automatic actually resolved to.\n· Whether the "Check for updates", "Stable" and "Prerelease" rows appear tells you whether this app can manage versions: visible means you can install, switch or uninstall here; hidden when the system install is actually in effect or the source is pinned to "System install". The "Current version" and "Auto-enable in new terminal windows" rows are hidden only when the system install is actually in effect.\n· First-run setup uses a system install when present; otherwise it installs the host-managed build, preferring the latest stable release and falling back to the latest prerelease.',
  opencodeSourceAuto: 'Automatic',
  opencodeSourceSystem: 'System install',
  opencodeSourceHost: 'Host-managed',
  opencodeSystemManagedNote:
    'The "Version source" is "System install"; this app never modifies your system copy. Switch to "Host-managed" to install or uninstall versions here.',
  opencodeNoSourceHostNote:
    'No usable version under "Host-managed"; new terminal sessions will not have the opencode command. Install a version below or switch "Version source" back to a source that has one.',
  opencodeNoSourceAutoNote:
    'No usable version exists; new terminal sessions will not have the opencode command. Install one below.',
  opencodeCurrentVersion: 'Current version',
  opencodeCurrentVersionDesc: 'The OpenCode CLI version currently in use',
  opencodeCurrentVersionHint:
    'Shows only the OpenCode CLI version actually in use; see "Version source" above for where it comes from.\n· App-managed versions are installed and managed by the app; install, switch or uninstall them here.\n· System install: a version you installed yourself; the app only uses it and never modifies it.\n· Only one version takes effect at a time, resolved from the "Version source" preference.\nNew terminal sessions pick up installs, switches or uninstalls immediately; no app restart needed.',
  opencodeUpdate: 'Check for updates',
  opencodeUpdateDesc: 'See whether a newer version exists',
  opencodeUpdateHint:
    'Queries the official source once. A newer version is flagged on the Check for updates row, including prereleases. Failures (e.g. offline) are reported as a failed check.',
  opencodeCheckUpdateFailed: 'Update check failed',
  opencodeCheckUpdateNoStable: 'No stable release upstream',
  opencodeCheckUpdateFound: 'New stable release {version}',
  opencodeCheckUpdatePrerelease: 'New prerelease {version} available',
  opencodeStable: 'Stable',
  opencodeStableDesc: 'Officially released stable versions',
  opencodeStableHint:
    'Stable releases are recommended for most people.\n· The dropdown lists the available stable releases in this channel (defaulting to the current version or the channel latest); picking one only changes the dropdown, it does not install or switch.\n· Buttons on the right follow the selected version: "Install" when missing; "Uninstall / Reinstall" when installed; plus "Switch" when installed but not current.\n· Installing really downloads the release into the app data directory and selects it; new terminal sessions use it right away.',
  opencodePrerelease: 'Prerelease',
  opencodePrereleaseDesc: 'Try new features early; prereleases may be unstable',
  opencodePrereleaseHint:
    'Prereleases ship new features before they are final, but may contain undiscovered issues.\n· The dropdown and buttons work exactly like the stable channel; only the versions themselves may be unstable.',
  opencodeOfficialLinksLabel: 'Official release info',
  opencodeOfficialLinksDesc:
    'Full version list, publish dates and details on the official channels:',
  opencodeOfficialSite: 'Official site',
  opencodeNpmPage: 'npm package page',
  opencodeGithubReleases: 'GitHub Releases',
  opencodeSourceSummaryTitle: 'Current download source',
  opencodeSourceSummaryHint:
    'The download address actually in use.\n· Read-only; change it in the Network group\n· Automatic picks the faster reachable registry',
  opencodeSourceSummaryGoModify: 'Change',
  opencodeTerminalNote:
    'Available in new terminal sessions after install; the managed build uses its own session database (it does not read your local OpenCode database), and already-open terminals must be reopened.',
  opencodeTerminalInjection: 'Auto-enable in new terminal windows',
  opencodeTerminalInjectionHint:
    'When on, new terminal sessions prepend the host-managed directory to PATH and point it at an isolated session database (so it cannot conflict with your own OpenCode install or a newer version); when off, new sessions are left alone. Only new sessions are affected; open terminals keep their old PATH. You may need to run opencode auth login once.',
  opencodeTerminalInjectionSaved: 'Terminal availability saved',
  harnessWizardDsh: 'DSH "Web app"',
  harnessWizardOpencode: 'OpenCode CLI',
};
