import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject, type CreateProjectInput, type Sector } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DbType = 'postgresql' | 'mysql' | 'mssql';
type WizardStep = 1 | 2 | 3;

interface ConnectionWizardProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_OPTIONS: { type: DbType; label: string; icon: string; description: string; defaultPort: number }[] = [
  { type: 'postgresql', label: 'PostgreSQL', icon: '\u25C8', description: 'Open-source relational database', defaultPort: 5432 },
  { type: 'mysql', label: 'MySQL', icon: '\u2736', description: 'Popular open-source SQL database', defaultPort: 3306 },
  { type: 'mssql', label: 'SQL Server', icon: '\u2B23', description: 'Microsoft enterprise database', defaultPort: 1433 },
];

const BASE = '/api';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectionWizard({ onClose }: ConnectionWizardProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [dbType, setDbType] = useState<DbType | null>(null);

  // Step 2 state
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(5432);
  const [dbName, setDbName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ssl, setSsl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Step 3 state
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set());
  const [schemasFetched, setSchemasFetched] = useState(false);
  const [schemaError, setSchemaError] = useState(false);
  const [manualSchemas, setManualSchemas] = useState('public');
  const [saving, setSaving] = useState(false);

  // Fade-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Reset test result when connection fields change
  useEffect(() => {
    setTestResult(null);
  }, [host, port, dbName, username, password, ssl]);

  // When db type changes, update port
  useEffect(() => {
    if (dbType) {
      const opt = DB_OPTIONS.find((o) => o.type === dbType);
      if (opt) setPort(opt.defaultPort);
    }
  }, [dbType]);

  // ------------------------------------------------------------------
  // Test connection
  // ------------------------------------------------------------------
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${BASE}/projects/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: dbType, host, port, database: dbName,
          username, password, ssl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message ?? 'Connection successful' });
      } else {
        setTestResult({ ok: false, message: data.error ?? 'Connection failed' });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message ?? 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  // ------------------------------------------------------------------
  // Fetch schemas on entering step 3
  // ------------------------------------------------------------------
  const fetchSchemas = async () => {
    setSchemasFetched(false);
    setSchemaError(false);
    try {
      const res = await fetch(`${BASE}/projects/schemas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: dbType, host, port, database: dbName,
          username, password, ssl,
        }),
      });
      if (!res.ok) throw new Error('Failed to fetch schemas');
      const data = await res.json();
      const list: string[] = data.schemas ?? [];
      setSchemas(list);
      setSelectedSchemas(new Set(list));
      setSchemasFetched(true);
    } catch {
      setSchemaError(true);
      setSchemasFetched(true);
    }
  };

  const goToStep3 = () => {
    setStep(3);
    fetchSchemas();
  };

  // ------------------------------------------------------------------
  // Finish — create project and navigate
  // ------------------------------------------------------------------
  const handleFinish = async () => {
    setSaving(true);
    try {
      const schemaList = schemaError
        ? manualSchemas.split(',').map((s) => s.trim()).filter(Boolean)
        : Array.from(selectedSchemas);

      const input: CreateProjectInput = {
        name: `${dbType === 'postgresql' ? 'PostgreSQL' : dbType === 'mysql' ? 'MySQL' : 'SQL Server'} \u2014 ${dbName || host}`,
        sector: 'mining' as Sector,
        revenueAUD: 500_000_000,
        totalFTE: 2500,
        dataEngineers: 12,
        avgSalaryAUD: 185_000,
        avgFTESalaryAUD: 125_000,
        database: {
          type: dbType!,
          host, port,
          database: dbName || undefined,
          username: username || undefined,
          password: password || undefined,
          ssl,
          schemas: schemaList.length > 0 ? schemaList : ['public'],
        },
      };

      const project = await createProject(input);
      navigate(`/projects/${project.id}/edit`);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message ?? 'Failed to create project' });
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Toggle schema selection
  // ------------------------------------------------------------------
  const toggleSchema = (s: string) => {
    setSelectedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // ------------------------------------------------------------------
  // Shared styles
  // ------------------------------------------------------------------
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#1A1F2E',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
    padding: '8px 12px', color: '#E5E7EB', fontSize: 13,
    fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  const inputFocusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = '#10B981';
      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(16,185,129,0.15)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
      e.currentTarget.style.boxShadow = 'none';
    },
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', color: '#9CA3AF', fontSize: 11, fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
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
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: '32px 36px',
        transform: visible ? 'scale(1)' : 'scale(0.95)',
        transition: 'transform 0.35s ease',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header with step indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ color: '#F9FAFB', fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            {step === 1 ? 'Select Database Type'
              : step === 2 ? 'Enter Connection Details'
              : 'Select Schemas to Scan'}
          </h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[1, 2, 3].map((s) => (
              <div key={s} style={{
                width: s === step ? 24 : 8, height: 8,
                borderRadius: 4,
                background: s === step ? '#10B981' : s < step ? '#10B981' : 'rgba(255,255,255,0.1)',
                opacity: s < step ? 0.5 : 1,
                transition: 'all 0.2s',
              }} />
            ))}
            <span style={{ color: '#6B7280', fontSize: 11, marginLeft: 6 }}>
              {step} / 3
            </span>
          </div>
        </div>

        {/* ============= Step 1: Database Type ============= */}
        {step === 1 && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {DB_OPTIONS.map((opt) => (
                <div
                  key={opt.type}
                  onClick={() => setDbType(opt.type)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '16px 18px', borderRadius: 8, cursor: 'pointer',
                    background: dbType === opt.type ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                    border: dbType === opt.type
                      ? '1px solid rgba(16,185,129,0.3)'
                      : '1px solid rgba(255,255,255,0.06)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                    background: dbType === opt.type ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                    color: dbType === opt.type ? '#10B981' : '#6B7280',
                  }}>
                    {opt.icon}
                  </div>
                  <div>
                    <div style={{
                      color: dbType === opt.type ? '#10B981' : '#E5E7EB',
                      fontSize: 14, fontWeight: 600,
                    }}>
                      {opt.label}
                    </div>
                    <div style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                      {opt.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{
                background: 'rgba(255,255,255,0.06)', color: '#D1D5DB',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '10px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Cancel
              </button>
              <button
                onClick={() => { if (dbType) setStep(2); }}
                disabled={!dbType}
                style={{
                  background: dbType ? 'linear-gradient(135deg, #10B981, #059669)' : 'rgba(255,255,255,0.06)',
                  color: dbType ? 'white' : '#6B7280',
                  border: 'none', padding: '10px 24px', borderRadius: 6,
                  fontSize: 13, fontWeight: 700, cursor: dbType ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { if (dbType) e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Next {'\u2192'}
              </button>
            </div>
          </div>
        )}

        {/* ============= Step 2: Connection Details ============= */}
        {step === 2 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Host</label>
                <input style={inputStyle} value={host} onChange={(e) => setHost(e.target.value)} {...inputFocusHandlers} />
              </div>
              <div>
                <label style={labelStyle}>Port</label>
                <input style={inputStyle} type="number" value={port} onChange={(e) => setPort(+e.target.value)} {...inputFocusHandlers} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Database Name</label>
              <input style={inputStyle} value={dbName} onChange={(e) => setDbName(e.target.value)} placeholder="mydb" {...inputFocusHandlers} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Username</label>
                <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} {...inputFocusHandlers} />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} {...inputFocusHandlers} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#D1D5DB', fontSize: 13, marginBottom: 20 }}>
              <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
              SSL connection
            </label>

            {/* Test Connection */}
            <button
              onClick={handleTestConnection}
              disabled={testing}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 6,
                background: 'rgba(16,185,129,0.1)', color: '#10B981',
                border: '1px solid rgba(16,185,129,0.25)',
                fontSize: 13, fontWeight: 600, cursor: testing ? 'wait' : 'pointer',
                fontFamily: 'inherit', marginBottom: 12,
              }}
            >
              {testing ? 'Testing\u2026' : '\u26A1 Test Connection'}
            </button>

            {testResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 12,
                background: testResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: testResult.ok ? '#34D399' : '#FCA5A5',
              }}>
                {testResult.ok ? '\u2713 ' : '\u2717 '}{testResult.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(1)} style={{
                background: 'rgba(255,255,255,0.06)', color: '#D1D5DB',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '10px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {'\u2190'} Back
              </button>
              <button
                onClick={goToStep3}
                disabled={!testResult?.ok}
                style={{
                  background: testResult?.ok ? 'linear-gradient(135deg, #10B981, #059669)' : 'rgba(255,255,255,0.06)',
                  color: testResult?.ok ? 'white' : '#6B7280',
                  border: 'none', padding: '10px 24px', borderRadius: 6,
                  fontSize: 13, fontWeight: 700, cursor: testResult?.ok ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { if (testResult?.ok) e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Next {'\u2192'}
              </button>
            </div>
          </div>
        )}

        {/* ============= Step 3: Schema Selection ============= */}
        {step === 3 && (
          <div>
            {!schemasFetched ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#10B981',
                      animation: `wizardPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
                <div style={{ color: '#D1D5DB', fontSize: 13 }}>
                  Discovering schemas{'\u2026'}
                </div>
              </div>
            ) : schemaError ? (
              /* Manual entry fallback */
              <div>
                <div style={{
                  padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 12,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                  color: '#FCD34D',
                }}>
                  Could not auto-discover schemas. Enter schema names manually below.
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Schemas (comma-separated)</label>
                  <input
                    style={inputStyle}
                    value={manualSchemas}
                    onChange={(e) => setManualSchemas(e.target.value)}
                    placeholder="public, staging, analytics"
                    {...inputFocusHandlers}
                  />
                </div>
              </div>
            ) : (
              /* Schema checklist */
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 12 }}>
                  {schemas.length} schema{schemas.length !== 1 ? 's' : ''} found. Deselect any you want to exclude.
                </div>
                <div style={{
                  maxHeight: 240, overflowY: 'auto', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {schemas.map((s) => (
                    <label key={s} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: selectedSchemas.has(s) ? 'rgba(16,185,129,0.04)' : 'transparent',
                      transition: 'background 0.1s',
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedSchemas.has(s)}
                        onChange={() => toggleSchema(s)}
                      />
                      <span style={{
                        color: selectedSchemas.has(s) ? '#E5E7EB' : '#6B7280',
                        fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {s}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(2)} style={{
                background: 'rgba(255,255,255,0.06)', color: '#D1D5DB',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '10px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {'\u2190'} Back
              </button>
              <button
                onClick={handleFinish}
                disabled={saving || (!schemaError && selectedSchemas.size === 0)}
                style={{
                  background: (saving || (!schemaError && selectedSchemas.size === 0))
                    ? 'rgba(255,255,255,0.06)'
                    : 'linear-gradient(135deg, #10B981, #059669)',
                  color: (saving || (!schemaError && selectedSchemas.size === 0)) ? '#6B7280' : 'white',
                  border: 'none', padding: '10px 24px', borderRadius: 6,
                  fontSize: 13, fontWeight: 700,
                  cursor: (saving || (!schemaError && selectedSchemas.size === 0)) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!saving && (schemaError || selectedSchemas.size > 0)) e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                {saving ? 'Creating\u2026' : 'Start Scan \u2192'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes wizardPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
