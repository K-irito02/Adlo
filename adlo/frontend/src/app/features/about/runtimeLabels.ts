/**
 * 运行时标识的展示映射。
 *
 * 只做「同一事实的更好读写法」：已知值给出常见写法，未知/空值返回 undefined，
 * 由调用方回退到 i18n 的「未知」文案（不猜测、不显示占位破折号）。
 */

export function formatOs(os: string | undefined): string | undefined {
  if (!os) {
    return undefined;
  }
  switch (os) {
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return os;
  }
}

export function formatArch(arch: string | undefined): string | undefined {
  if (!arch) {
    return undefined;
  }
  switch (arch) {
    case 'x86_64':
      return 'x64';
    case 'aarch64':
      return 'ARM64';
    case 'x86':
      return 'x86';
    default:
      return arch;
  }
}
