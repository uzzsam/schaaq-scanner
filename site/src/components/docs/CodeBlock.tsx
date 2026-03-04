import { useCallback, useState } from 'react';

interface CodeBlockProps {
  children: string;
  lang?: string;
}

export function CodeBlock({ children, lang }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(children.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="group relative my-4 rounded-lg bg-[#0D1117] border border-white/5 overflow-hidden">
      {/* Language label + copy button */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 text-xs text-gray-500">
        <span className="font-mono">{lang ?? 'shell'}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre className="px-4 py-3 overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono text-gray-300">{children.trim()}</code>
      </pre>
    </div>
  );
}
