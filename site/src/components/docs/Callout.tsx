interface CalloutProps {
  type?: 'tip' | 'warning' | 'note';
  title?: string;
  children: React.ReactNode;
}

const config = {
  tip: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    icon: (
      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5.002 5.002 0 017.072 0l.147.146a.5.5 0 01-.353.854H9.828a.5.5 0 01-.353-.854l.147-.146z" />
      </svg>
    ),
    defaultTitle: 'Tip',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    icon: (
      <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    defaultTitle: 'Warning',
  },
  note: {
    border: 'border-schaaq-500/30',
    bg: 'bg-schaaq-500/5',
    icon: (
      <svg className="w-4 h-4 text-schaaq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    defaultTitle: 'Note',
  },
};

export function Callout({ type = 'note', title, children }: CalloutProps) {
  const c = config[type];

  return (
    <div className={`my-5 rounded-lg border-l-4 ${c.border} ${c.bg} p-4`}>
      <div className="flex items-center gap-2 mb-1.5">
        {c.icon}
        <span className="text-sm font-semibold text-white">{title ?? c.defaultTitle}</span>
      </div>
      <div className="text-sm text-gray-400 leading-relaxed pl-6">
        {children}
      </div>
    </div>
  );
}
