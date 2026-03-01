// =============================================================================
// Safe JSON Parsing — M-5
//
// Wraps JSON.parse so malformed or corrupt data never crashes the process.
// Use `safeJsonParse` for semi-trusted data (e.g. DB columns) where a
// graceful fallback is acceptable.  For user-uploaded files where failure
// should be surfaced, prefer a local try-catch with a descriptive error.
// =============================================================================

/**
 * Parse a JSON string and return the result, falling back to `fallback`
 * on any parse error.  Logs a warning with `context` so operators can
 * identify the corrupt data source.
 *
 * @param input    The raw JSON string to parse
 * @param fallback Value returned when parsing fails
 * @param context  Human-readable label logged alongside the warning
 */
export function safeJsonParse<T>(input: string, fallback: T, context?: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    const label = context ? ` (${context})` : '';
    console.error(`[safe-json] Failed to parse JSON${label}`);
    return fallback;
  }
}
