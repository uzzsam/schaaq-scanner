import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Release highlights — update this array for each release
// ---------------------------------------------------------------------------

interface ReleaseHighlight {
  icon: string;
  title: string;
  description: string;
}

const HIGHLIGHTS: ReleaseHighlight[] = [
  {
    icon: '\u2B06',
    title: 'Auto-updater',
    description: 'Schaaq Scanner now updates automatically \u2014 you\u2019ll always have the latest features and fixes.',
  },
  {
    icon: '\uD83D\uDEE1\uFE0F',
    title: 'Crash reporting',
    description: 'Errors are reported anonymously to help us improve stability and performance.',
  },
  {
    icon: '\u2728',
    title: 'Welcome wizard',
    description: 'New users get a guided demo scan on first launch so they can explore immediately.',
  },
  {
    icon: '\uD83C\uDFAF',
    title: 'Dynamic version display',
    description: 'The window title and sidebar now show the real version number.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WhatsNewProps {
  version: string;
  onDismiss: () => void;
}

export function WhatsNew({ version, onDismiss }: WhatsNewProps) {
  const [visible, setVisible] = useState(false);

  // Fade-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    // Wait for fade-out before unmounting
    setTimeout(onDismiss, 250);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.25s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: '#0D1117',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '36px 32px',
        transform: visible ? 'scale(1)' : 'scale(0.95)',
        transition: 'transform 0.25s ease',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #10B981, #059669)',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 20 }}>{'\uD83C\uDF89'}</span>
          </div>

          <h2 style={{
            color: '#F9FAFB', fontSize: 20, fontWeight: 700,
            margin: '0 0 6px', letterSpacing: '-0.02em',
          }}>
            What&rsquo;s New in v{version}
          </h2>

          <p style={{ color: '#9CA3AF', fontSize: 12, margin: 0 }}>
            Here&rsquo;s what we&rsquo;ve been working on.
          </p>
        </div>

        {/* Highlights */}
        <div style={{ marginBottom: 28 }}>
          {HIGHLIGHTS.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '12px 0',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{
                  color: '#E5E7EB', fontSize: 13, fontWeight: 600, marginBottom: 2,
                }}>
                  {item.title}
                </div>
                <div style={{
                  color: '#9CA3AF', fontSize: 12, lineHeight: 1.5,
                }}>
                  {item.description}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button onClick={handleDismiss} style={{
          width: '100%', padding: '11px 0',
          background: 'rgba(16,185,129,0.1)',
          color: '#10B981',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16,185,129,0.18)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16,185,129,0.1)'}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
