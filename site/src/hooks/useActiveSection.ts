import { useEffect, useState } from 'react';

/**
 * Scroll-spy hook — returns the id of the section currently in view.
 * Watches elements matching the given selector (default: `[data-section]`).
 */
export function useActiveSection(selector = '[data-section]') {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the first entry that is intersecting (topmost visible section)
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [selector]);

  return activeId;
}
