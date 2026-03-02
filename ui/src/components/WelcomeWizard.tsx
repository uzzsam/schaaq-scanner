import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject, triggerScan, fetchScan } from '../api/client';
import { formatCost } from '../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'welcome' | 'demo';

interface WelcomeWizardProps {
  /** Called after the wizard is dismissed (skip or complete). */
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_PROJECT = {
  name: 'Demo \u2014 Mining Database',
  sector: 'mining' as const,
  revenueAUD: 50_000_000,
  totalFTE: 200,
  dataEngineers: 8,
  avgSalaryAUD: 130_000,
  avgFTESalaryAUD: 95_000,
};

const POLL_INTERVAL = 2_000;

// ---------------------------------------------------------------------------
// Inline SVG logo (matches favicon / splash)
// ---------------------------------------------------------------------------

function SchaaqLogo() {
  return (
    <svg width="56" height="56" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wz-grad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10B981" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill="url(#wz-grad)" />
      <text x="256" y="340" textAnchor="middle" fill="white"
        fontFamily="'JetBrains Mono', 'SF Mono', monospace"
        fontSize="280" fontWeight="800">S</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WelcomeWizard({ onComplete }: WelcomeWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [visible, setVisible] = useState(false);

  // Demo-scan state
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ scanId: string; findings: number; cost: number } | null>(null);

  // Fade-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // ------------------------------------------------------------------
  // Run the demo scan
  // ------------------------------------------------------------------
  const runDemo = useCallback(async () => {
    setRunning(true);
    setError(null);

    try {
      // 1. Create demo project
      setStatus('Creating demo project\u2026');
      const project = await createProject(DEMO_PROJECT);

      // 2. Trigger dry-run scan
      setStatus('Running analysis\u2026');
      const { scanId } = await triggerScan(project.id, true);

      // 3. Poll until complete
      let scan = await fetchScan(scanId);
      while (scan.status !== 'completed' && scan.status !== 'failed') {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        scan = await fetchScan(scanId);

        // Show progress hint
        if (scan.current_step) {
          setStatus(scan.current_step);
        }
      }

      if (scan.status === 'failed') {
        throw new Error(scan.error_message ?? 'Scan failed');
      }

      // 4. Done!
      setStatus('Done!');
      setResult({
        scanId: scan.id,
        findings: scan.total_findings,
        cost: scan.total_cost ?? 0,
      });
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setRunning(false);
    }
  }, []);

  // Auto-start demo when entering step 2
  useEffect(() => {
    if (step === 'demo' && !running && !result && !error) {
      runDemo();
    }
  }, [step, running, result, error, runDemo]);

  // ------------------------------------------------------------------
  // Skip handler
  // ------------------------------------------------------------------
  const handleSkip = () => {
    onComplete();
    navigate('/projects/new');
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.35s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#0D1117',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '40px 36px',
        transform: visible ? 'scale(1)' : 'scale(0.95)',
        transition: 'transform 0.35s ease',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {step === 'welcome' ? (
          <WelcomeStep onGetStarted={() => setStep('demo')} onSkip={handleSkip} />
        ) : (
          <DemoStep
            status={status}
            running={running}
            error={error}
            result={result}
            onViewResults={() => {
              if (result) navigate(`/scans/${result.scanId}/results`);
            }}
            onRetry={() => {
              setError(null);
              setResult(null);
              runDemo();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Welcome
// ---------------------------------------------------------------------------

function WelcomeStep({ onGetStarted, onSkip }: {
  onGetStarted: () => void;
  onSkip: () => void;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      {/* Logo */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
        <SchaaqLogo />
      </div>

      {/* Heading */}
      <h1 style={{
        color: '#F9FAFB', fontSize: 22, fontWeight: 700,
        margin: '0 0 8px', letterSpacing: '-0.02em',
      }}>
        Welcome to Schaaq Scanner
      </h1>

      <p style={{ color: '#9CA3AF', fontSize: 13, margin: '0 0 28px', lineHeight: 1.5 }}>
        Discover the hidden cost of poor data quality
      </p>

      {/* Feature bullets */}
      <div style={{ textAlign: 'left', margin: '0 auto', maxWidth: 400 }}>
        {[
          'Analyse your database schema against 7 DAMA-aligned data quality properties',
          'Calculate the financial impact of data quality issues',
          'Generate professional diagnostic reports for stakeholders',
        ].map((text, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, marginBottom: 14,
            color: '#D1D5DB', fontSize: 13, lineHeight: 1.5,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(16,185,129,0.12)',
              color: '#10B981', fontSize: 11, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              {'\u2713'}
            </span>
            <span>{text}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={onGetStarted} style={{
        width: '100%', marginTop: 24, padding: '12px 0',
        background: 'linear-gradient(135deg, #10B981, #059669)',
        color: 'white', fontSize: 14, fontWeight: 700,
        border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'inherit', letterSpacing: '-0.01em',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
      >
        Get Started
      </button>

      {/* Skip */}
      <button onClick={onSkip} style={{
        marginTop: 14, background: 'none', border: 'none',
        color: '#6B7280', fontSize: 12, cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'color 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.color = '#9CA3AF'}
      onMouseLeave={(e) => e.currentTarget.style.color = '#6B7280'}
      >
        Skip &mdash; I'll set up my own project
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Demo Scan
// ---------------------------------------------------------------------------

function DemoStep({ status, running, error, result, onViewResults, onRetry }: {
  status: string;
  running: boolean;
  error: string | null;
  result: { scanId: string; findings: number; cost: number } | null;
  onViewResults: () => void;
  onRetry: () => void;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2 style={{
        color: '#F9FAFB', fontSize: 18, fontWeight: 700,
        margin: '0 0 8px', letterSpacing: '-0.02em',
      }}>
        {result ? 'Demo Scan Complete' : 'Running Demo Scan'}
      </h2>

      <p style={{ color: '#9CA3AF', fontSize: 13, margin: '0 0 32px', lineHeight: 1.5 }}>
        {result
          ? 'Here\u2019s what we found in the sample mining database.'
          : 'Analysing a sample mining database \u2014 no real data needed.'}
      </p>

      {/* Progress / result area */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '28px 24px',
        marginBottom: 28,
      }}>
        {error ? (
          /* Error state */
          <>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{'\u26A0\uFE0F'}</div>
            <div style={{ color: '#F87171', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Something went wrong
            </div>
            <div style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 16 }}>{error}</div>
            <button onClick={onRetry} style={{
              background: 'rgba(16,185,129,0.1)', color: '#10B981',
              border: '1px solid rgba(16,185,129,0.25)',
              padding: '8px 20px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Try Again
            </button>
          </>
        ) : result ? (
          /* Completed state */
          <>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(16,185,129,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#10B981', fontSize: 22 }}>{'\u2713'}</span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            }}>
              <div>
                <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Findings
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 22, fontWeight: 700, color: '#E5E7EB',
                }}>
                  {result.findings}
                </div>
              </div>
              <div>
                <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Annual Cost
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 22, fontWeight: 700, color: '#F59E0B',
                }}>
                  {formatCost(result.cost)}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Running state */
          <>
            {/* Pulsing dots animation */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#10B981',
                  animation: `wizardPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
            <div style={{ color: '#D1D5DB', fontSize: 13, fontWeight: 500 }}>
              {status || 'Preparing\u2026'}
            </div>
          </>
        )}
      </div>

      {/* Action button */}
      {result && (
        <button onClick={onViewResults} style={{
          width: '100%', padding: '12px 0',
          background: 'linear-gradient(135deg, #10B981, #059669)',
          color: 'white', fontSize: 14, fontWeight: 700,
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'inherit', letterSpacing: '-0.01em',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          View Results &rarr;
        </button>
      )}

      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes wizardPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
