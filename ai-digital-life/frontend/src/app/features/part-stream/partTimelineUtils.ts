/**
 * Normalize a wire `question.asked` payload (`questions: unknown[]`) into the
 * `{ text?: string; [key: string]: unknown }[]` shape `AskCard` renders.
 * Each entry may be a plain string or a structured object; anything else is
 * stringified. Kept broader than `{ text?: string }[]` because AskCard reads
 * `q.text` but may also surface extra fields.
 */
export function normalizeQuestions(
  questions: unknown[],
): { text?: string; [key: string]: unknown }[] {
  return (questions ?? []).map((q) => {
    if (typeof q === 'string') {
      return { text: q };
    }
    if (q && typeof q === 'object') {
      return { ...(q as Record<string, unknown>) };
    }
    return { text: String(q) };
  });
}
