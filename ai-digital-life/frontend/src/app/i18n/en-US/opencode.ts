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
    'Decides which OpenCode CLI build takes effect. Automatic prefers the app-managed build, then your system install.\n· This always shows your preference (Automatic / System install / Host-managed), never the resolved result; the "Current version" row shows what actually takes effect.\n· Whether the "Check for updates, Stable, Prerelease" rows appear tells you if versions are managed here: visible means install/switch/uninstall is available; hidden means the system install is in effect and maintained by you (always hidden for "System install"; also hidden under "Automatic" when no host-managed version is available).',
  opencodeSourceAuto: 'Automatic',
  opencodeSourceSystem: 'System install',
  opencodeSourceHost: 'Host-managed',
  opencodeSystemManagedNote:
    'The version in use is your own system install; the app never modifies it.\n· To install, switch or uninstall here, change "Version source" from "System install" to "Host-managed".',
  opencodeNoSourceHostNote:
    'No usable version under "Host-managed"; new terminal sessions will not have the opencode command. Install a version below or switch "Version source" back to a source that has one.',
  opencodeNoSourceAutoNote:
    'No host-managed version and no system install detected; new terminal sessions will not have the opencode command. Switch to "Host-managed" to install one.',
  opencodeCurrentVersion: 'Current version',
  opencodeCurrentVersionDesc: 'The OpenCode CLI version currently in use',
  opencodeCurrentVersionHint:
    'Shows the OpenCode CLI version actually in use and where it comes from.\n· App-managed versions are installed and managed by the app; install, switch or uninstall them here.\n· System install: a version you installed yourself; the app only uses it and never modifies it.\n· Only one version takes effect at a time, resolved from the "Version source" preference.\nNew terminal sessions pick up installs, switches or uninstalls immediately; no app restart needed.',
  opencodeUpdate: 'Check for updates',
  opencodeUpdateDesc: 'See whether a newer version exists',
  opencodeUpdateHint:
    'Queries the official source once. A newer version is flagged on the current-version row, including prereleases. Failures (e.g. offline) are reported as a failed check.',
  opencodeCheckUpdateFailed: 'Update check failed',
  opencodeCheckUpdateNoStable: 'No stable release upstream',
  opencodeCheckUpdateFound: 'New stable release {version}',
  opencodeCheckUpdatePrerelease: 'New prerelease {version} available',
  opencodeStable: 'Stable',
  opencodeStableDesc: 'Officially released stable versions',
  opencodeStableHint:
    'Stable releases are recommended for most people.\n· The dropdown lists every stable release in this channel (defaulting to the current version or the channel latest); picking one only changes the dropdown, it does not install or switch.\n· Buttons on the right follow the selected version: "Install" when missing; "Uninstall / Reinstall" when installed; plus "Switch" when installed but not current.\n· Installing really downloads the release into the app data directory and selects it; new terminal sessions use it right away.',
  opencodePrerelease: 'Prerelease',
  opencodePrereleaseDesc: 'Try new features early; prereleases may be unstable',
  opencodePrereleaseHint:
    'Prereleases ship new features before they are final, but may contain undiscovered issues.\n· The dropdown and buttons work exactly like the stable channel; only the versions themselves may be unstable.',
  opencodeManualVersion: 'Specific version',
  opencodeManualVersionDesc: 'Install an exact officially released version number',
  opencodeManualVersionHint:
    'Use this when you know the exact version; unknown versions fail with an error.',
  opencodeOfficialLinksLabel: 'Official release info',
  opencodeOfficialLinksDesc: 'Full version list, publish dates and details live upstream:',
  opencodeNpmPage: 'npm package page',
  opencodeGithubReleases: 'GitHub Releases',
  opencodeSourceSummaryTitle: 'Current download source',
  opencodeSourceSummaryHint:
    'The download address actually in use.\n· Read-only; change it in the Network group\n· Automatic picks the faster reachable registry',
  opencodeSourceSummaryGoModify: 'Change',
  opencodeSystemPathDesc: 'Where your self-installed OpenCode CLI lives',
  opencodeSystemPathHint:
    'The app only detects the system install and never modifies it; the version is probed at startup and shows “unknown” when undetectable.',
  opencodeTerminalNote:
    'Available in new terminal sessions after install; already-open terminals must be reopened.',
  opencodeTerminalInjection: 'Auto-enable in new terminal windows',
  opencodeTerminalInjectionHint:
    'When on, new terminal sessions prepend the host-managed directory to PATH so opencode works directly; when off, new sessions are left alone. Only new sessions are affected; open terminals keep their old PATH.',
  opencodeTerminalInjectionSaved: 'Terminal availability saved',
  harnessWizardTitle: 'Install harnesses',
  harnessWizardDesc:
    'The app can manage DSH and OpenCode CLI versions. Install now, or later from their settings groups.',
  harnessWizardDsh: 'DSH (web app)',
  harnessWizardOpencode: 'OpenCode CLI',
  harnessWizardInstalled: 'Installed',
  harnessWizardMissing: 'Not installed',
  harnessWizardInstall: 'Install',
  harnessWizardInstalling: 'Installing…',
  harnessWizardSkip: 'Later',
  harnessWizardFailed: 'Install failed; you can retry later',
  harnessWizardNodeHint: 'DSH needs Node.js first (install it in the Environment settings group).',
  harnessWizardNonBlocking:
    'A failed install never blocks the app; retry anytime from the settings group.',
  harnessWizardDetecting: 'Detecting installed harnesses…',
};
