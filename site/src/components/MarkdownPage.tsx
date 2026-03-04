import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface MarkdownPageProps {
  url: string;
  title: string;
}

type Status = 'loading' | 'ready' | 'error';

// Configure marked for clean output
marked.setOptions({
  gfm: true,
  breaks: false,
});

export function MarkdownPage({ url, title }: MarkdownPageProps) {
  const [html, setHtml] = useState('');
  const [status, setStatus] = useState<Status>('loading');

  useDocumentTitle(title);

  useEffect(() => {
    setStatus('loading');
    setHtml('');

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((md) => {
        const rendered = marked.parse(md);
        // marked.parse can return string | Promise<string>
        if (typeof rendered === 'string') {
          setHtml(rendered);
          setStatus('ready');
        } else {
          rendered.then((h) => {
            setHtml(h);
            setStatus('ready');
          });
        }
      })
      .catch(() => {
        setStatus('error');
      });
  }, [url]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      {/* Page header */}
      <div className="mb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-2">
          {title}
        </p>
        <h1 className="font-display text-4xl font-bold text-white">{title}</h1>
      </div>

      {/* Loading skeleton */}
      {status === 'loading' && (
        <div className="space-y-4 animate-pulse">
          <div className="h-4 bg-white/5 rounded w-3/4" />
          <div className="h-4 bg-white/5 rounded w-full" />
          <div className="h-4 bg-white/5 rounded w-5/6" />
          <div className="h-8 bg-white/5 rounded w-1/2 mt-6" />
          <div className="h-4 bg-white/5 rounded w-full" />
          <div className="h-4 bg-white/5 rounded w-2/3" />
          <div className="h-4 bg-white/5 rounded w-4/5" />
          <div className="h-4 bg-white/5 rounded w-full" />
          <div className="h-8 bg-white/5 rounded w-1/3 mt-6" />
          <div className="h-4 bg-white/5 rounded w-full" />
          <div className="h-4 bg-white/5 rounded w-3/4" />
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <p className="text-gray-400 mb-2">Content unavailable</p>
          <p className="text-sm text-gray-500">
            Couldn&rsquo;t load this page. Try viewing it directly on{' '}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-schaaq-400 hover:underline"
            >
              GitHub
            </a>
            .
          </p>
        </div>
      )}

      {/* Rendered markdown */}
      {status === 'ready' && (
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
