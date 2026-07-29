/** Pure JS MD5 implementation (no external deps) */
export function md5(str: string): string {
  const rotateLeft = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  const addUnsigned = (x: number, y: number) => (x + y) >>> 0;
  const hex = (v: number) => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s +=
        '0123456789abcdef'.charAt((v >> (i * 8 + 4)) & 0x0f) +
        '0123456789abcdef'.charAt((v >> (i * 8)) & 0x0f);
    }
    return s;
  };

  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
    14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const bits: number[] = Array.from(new TextEncoder().encode(str));
  const len = bits.length;
  bits.push(0x80);
  while (bits.length % 64 !== 56) {
    bits.push(0);
  }
  const bitLenLow = (len * 8) >>> 0;
  const bitLenHigh = Math.floor((len * 8) / 0x100000000);
  for (let i = 0; i < 4; i++) {
    bits.push((bitLenLow >>> (i * 8)) & 0xff);
  }
  for (let i = 0; i < 4; i++) {
    bits.push((bitLenHigh >>> (i * 8)) & 0xff);
  }

  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476;

  for (let chunkStart = 0; chunkStart < bits.length; chunkStart += 64) {
    const X: number[] = [];
    for (let i = 0; i < 16; i++) {
      X[i] =
        bits[chunkStart + i * 4] |
        (bits[chunkStart + i * 4 + 1] << 8) |
        (bits[chunkStart + i * 4 + 2] << 16) |
        (bits[chunkStart + i * 4 + 3] << 24);
    }

    let A = h0,
      B = h1,
      C = h2,
      D = h3;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + X[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotateLeft(F, S[i])) >>> 0;
    }
    h0 = addUnsigned(h0, A);
    h1 = addUnsigned(h1, B);
    h2 = addUnsigned(h2, C);
    h3 = addUnsigned(h3, D);
  }

  return hex(h0) + hex(h1) + hex(h2) + hex(h3);
}

/**
 * Avatar resolver interface.
 * Implement this and register via `registerAvatarResolver` to add a platform-specific resolver.
 * Resolvers are tried in priority order (lower runs first). Return null to skip to next.
 */
export interface AvatarResolver {
  name: string;
  priority: number;
  resolve: (email: string, size: number) => string | null;
}

const resolvers: AvatarResolver[] = [];

/** Register a platform-specific avatar resolver (dedup by name for HMR safety) */
export function registerAvatarResolver(resolver: AvatarResolver): void {
  if (resolvers.some((r) => r.name === resolver.name)) {
    return;
  }
  resolvers.push(resolver);
  resolvers.sort((a, b) => a.priority - b.priority);
}

// ── Built-in resolvers ──

/** A2: GitHub noreply → https://github.com/{username}.png */
registerAvatarResolver({
  name: 'github-noreply',
  priority: 10,
  resolve(email: string, _size: number): string | null {
    const match = email.match(/^(.+?)@users\.noreply\.github\.com$/);
    if (!match) {
      return null;
    }
    const localPart = match[1];
    const username = localPart.includes('+') ? localPart.split('+').pop()! : localPart;
    return `https://github.com/${username}.png`;
  },
});

/** A1: Gravatar with retro fallback (always returns a URL) */
registerAvatarResolver({
  name: 'gravatar',
  priority: 100,
  resolve(email: string, size: number): string | null {
    const hash = md5(email.trim().toLowerCase());
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=retro`;
  },
});

/**
 * Resolve an avatar URL by trying registered resolvers in priority order.
 * The last resolver (gravatar) always returns a value, so in practice this
 * never returns an empty string. The trailing `return ''` is a defensive
 * fallback that is unreachable as long as the gravatar resolver is registered.
 * On load failure, the caller keeps the pixel avatar that was set as the
 * initial <img src> before the async fetch.
 */
export function resolveAvatarUrl(email: string, size = 80): string {
  const trimmed = email.trim().toLowerCase();
  for (const r of resolvers) {
    const url = r.resolve(trimmed, size);
    if (url) {
      return url;
    }
  }
  return '';
}

/**
 * Generate a local pixel-art avatar as an SVG data URI.
 *
 * Uses a 5x5 symmetric grid identicon derived from the email MD5 hash:
 * - 15 independent cells (left 3 columns, mirrored to the right 2)
 * - Each cell is filled or empty based on a hash bit
 * - Color (HSL) is derived from the hash for visual variety
 * - Rounded cell corners for a softer, modern appearance
 * - Semi-transparent background tinted by the same hue for visual cohesion
 * - Adapts to dark themes via low-opacity background fill (the underlying
 *   page color shows through)
 *
 * This is purely local — no network request — so it can be shown instantly
 * while the real avatar (GitHub / Gravatar) loads asynchronously. When the
 * real avatar loads successfully the caller swaps the <img src>; on failure
 * the pixel avatar remains, so a broken image is never displayed.
 *
 * For empty/whitespace emails a deterministic fallback is still produced.
 */
export function generatePixelAvatar(email: string, size: number = 20): string {
  const hash = md5((email ?? '').trim().toLowerCase());
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(parseInt(hash.charAt(i), 16) % 2 === 0);
  }
  const hue = parseInt(hash.substring(15, 18), 16) % 360;
  const sat = 60 + (parseInt(hash.charAt(18), 16) % 30); // 60-75%
  const light = 45 + (parseInt(hash.charAt(19), 16) % 15); // 45-59%
  const color = `hsl(${hue}, ${sat}%, ${light}%)`;
  // Tinted background: same hue, low opacity — works on both light/dark themes
  const bg = `hsla(${hue}, 45%, 50%, 0.12)`;

  const cellSize = size / 5;
  const radius = (cellSize * 0.18).toFixed(3); // subtle rounded corners
  let rects = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const mirrorCol = col < 3 ? col : 4 - col;
      const idx = row * 3 + mirrorCol;
      if (cells[idx]) {
        const x = (col * cellSize).toFixed(3);
        const y = (row * cellSize).toFixed(3);
        const cs = cellSize.toFixed(3);
        rects += `<rect x="${x}" y="${y}" width="${cs}" height="${cs}" rx="${radius}" ry="${radius}" fill="${color}"/>`;
      }
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"` +
    ` viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Format a date string for display */
export function formatDate(dateStr: string, locale: string, mode: 'table' | 'tooltip'): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return '--';
  }

  if (mode === 'table') {
    const parts = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    const time = `${get('hour')}:${get('minute')}`;
    const day = get('day');
    const month = get('month');
    const year = get('year');

    return `${time} ${day}-${month}-${year}`;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(d);
}
