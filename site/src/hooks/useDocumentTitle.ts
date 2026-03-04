import { useEffect } from 'react';

/**
 * Sets `document.title` to `"<title> — Schaaq Scanner"`.
 * Resets to the base title on unmount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
      ? `${title} — Schaaq Scanner`
      : 'Schaaq Scanner — Find the Hidden Cost of Bad Data';
    return () => {
      document.title = 'Schaaq Scanner — Find the Hidden Cost of Bad Data';
    };
  }, [title]);
}
