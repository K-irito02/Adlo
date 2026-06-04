export async function copyToClipboard(
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to copy: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function copyMultiple(
  items: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const item of items) {
    const result = await copyToClipboard(item);
    if (!result.ok) return result;
  }
  return { ok: true };
}
