/**
 * Safe error response helper.
 *
 * Logs the full error server-side for debugging, but returns a generic
 * message to the client to avoid leaking internal details (stack traces,
 * SQL errors, file paths, etc.).
 */
export function safeError(err: unknown, context: string): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${context}]`, message);
  return 'Internal server error';
}
