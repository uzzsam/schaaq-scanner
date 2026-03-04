import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFound() {
  useDocumentTitle('Page Not Found');

  return (
    <section className="mx-auto max-w-xl px-6 py-32 text-center">
      <p className="font-mono text-7xl font-bold text-schaaq-500/30 mb-4">404</p>
      <h1 className="font-display text-2xl font-bold text-white mb-3">
        Page not found
      </h1>
      <p className="text-gray-400 mb-8">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-schaaq-500 text-white text-sm font-semibold hover:bg-schaaq-400 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Home
      </Link>
    </section>
  );
}
