/**
 * Friendly error display used across all pages.
 *
 * Shows a warning icon, a human-readable heading, the error message
 * in muted text (never raw stack traces), a "Try Again" button, and
 * a fallback link to the Dashboard.
 */

import { useNavigate } from 'react-router-dom';

const WARNING_ICON = (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M24 4L2 44H46L24 4Z"
      stroke="#F59E0B"
      strokeWidth="2.5"
      strokeLinejoin="round"
      fill="none"
    />
    <line x1="24" y1="18" x2="24" y2="30" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="24" cy="36" r="1.5" fill="#F59E0B" />
  </svg>
);

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
    }}>
      {WARNING_ICON}

      <h2 style={{
        color: '#E5E7EB', fontSize: 18, fontWeight: 700,
        margin: '20px 0 8px', letterSpacing: '-0.01em',
      }}>
        {title}
      </h2>

      {message && (
        <p style={{
          color: '#6B7280', fontSize: 13, maxWidth: 400,
          lineHeight: 1.5, margin: '0 0 24px',
        }}>
          {message}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: message ? 0 : 16 }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: '8px 20px', borderRadius: 6, border: 'none',
              background: '#10B981', color: 'white', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Try Again
          </button>
        )}
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 20px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: '#9CA3AF', fontSize: 13,
            fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
