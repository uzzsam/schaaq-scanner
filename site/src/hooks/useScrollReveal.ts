import { useEffect, useRef } from 'react';

/**
 * Lightweight scroll-reveal using IntersectionObserver.
 * Adds the `revealed` class when elements with `[data-reveal]` enter the viewport.
 * Supports staggered children via `[data-reveal-stagger]` on the container.
 */
export function useScrollReveal() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const elements = root.querySelectorAll('[data-reveal]');
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const el = entry.target as HTMLElement;

          // If this element is a stagger container, reveal children sequentially
          if (el.hasAttribute('data-reveal-stagger')) {
            const children = el.querySelectorAll('[data-reveal-child]');
            children.forEach((child, i) => {
              (child as HTMLElement).style.transitionDelay = `${i * 80}ms`;
              child.classList.add('revealed');
            });
          }

          el.classList.add('revealed');
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return containerRef;
}
