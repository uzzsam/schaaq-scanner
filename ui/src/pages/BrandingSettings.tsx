import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader, Card, PrimaryButton, SecondaryButton } from '../components/Shared';
import { fetchSettings, updateSetting, uploadLogo, deleteLogo } from '../api/client';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: '#E5E7EB',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#9CA3AF',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
  display: 'block',
};

function LogoUpload({
  label,
  type,
  currentValue,
  onUploaded,
  onRemoved,
}: {
  label: string;
  type: 'consultant' | 'client';
  currentValue: string;
  onUploaded: () => void;
  onRemoved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (file.size > 500 * 1024) {
      setError('File exceeds 500 KB limit');
      return;
    }
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setError('Only PNG, JPEG, or SVG files are allowed');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await uploadLogo(type, file);
      onUploaded();
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleRemove = async () => {
    try {
      await deleteLogo(type);
      onRemoved();
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed');
    }
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {currentValue ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: 16, borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <img
            src={currentValue}
            alt={label}
            style={{ maxHeight: 48, maxWidth: 160, objectFit: 'contain' }}
          />
          <div style={{ flex: 1 }} />
          <SecondaryButton onClick={() => fileRef.current?.click()}>
            Replace
          </SecondaryButton>
          <button
            onClick={handleRemove}
            style={{
              background: 'rgba(239,68,68,0.1)', color: '#EF4444',
              border: '1px solid rgba(239,68,68,0.25)',
              padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            padding: 24, borderRadius: 8, textAlign: 'center', cursor: 'pointer',
            border: `2px dashed ${dragging ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
            background: dragging ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ color: '#6B7280', fontSize: 12 }}>
            {uploading ? 'Uploading...' : 'Drop image here or click to browse'}
          </div>
          <div style={{ color: '#4B5563', fontSize: 10, marginTop: 4 }}>
            PNG, JPEG, or SVG. Max 500 KB.
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {error && (
        <div style={{ color: '#EF4444', fontSize: 11, marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}

export function BrandingSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [consultantName, setConsultantName] = useState('');
  const [consultantTagline, setConsultantTagline] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportSubtitle, setReportSubtitle] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setConsultantName(s.consultant_name ?? '');
      setConsultantTagline(s.consultant_tagline ?? '');
      setReportTitle(s.report_title ?? '');
      setReportSubtitle(s.report_subtitle ?? '');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await Promise.all([
        updateSetting('consultant_name', consultantName),
        updateSetting('consultant_tagline', consultantTagline),
        updateSetting('report_title', reportTitle),
        updateSetting('report_subtitle', reportSubtitle),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Branding Settings" subtitle="Loading..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Branding Settings"
        subtitle="Customise reports with your consultant branding"
        action={
          <a
            href="/api/scans"
            onClick={(e) => {
              e.preventDefault();
              // Open the most recent scan's HTML report in a new tab if available
              window.open('/api/settings', '_blank');
            }}
            style={{
              color: '#6B7280', fontSize: 12, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            Preview in HTML Report
          </a>
        }
      />

      <div style={{ display: 'grid', gap: 20, maxWidth: 640 }}>
        {/* Text settings */}
        <Card style={{ padding: 24 }}>
          <div style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
            Consultant Information
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={labelStyle}>Consultant Name</label>
              <input
                type="text"
                value={consultantName}
                onChange={(e) => setConsultantName(e.target.value)}
                placeholder="e.g. Acme Data Consulting"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Consultant Tagline</label>
              <input
                type="text"
                value={consultantTagline}
                onChange={(e) => setConsultantTagline(e.target.value)}
                placeholder="e.g. Experts in Data Architecture"
                style={inputStyle}
              />
            </div>
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
            Report Customisation
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={labelStyle}>Report Title Override</label>
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="Data Architecture Loss Calculator"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Report Subtitle Override</label>
              <input
                type="text"
                value={reportSubtitle}
                onChange={(e) => setReportSubtitle(e.target.value)}
                placeholder="Auto-generated from scan data"
                style={inputStyle}
              />
            </div>
          </div>
        </Card>

        {/* Logo uploads */}
        <Card style={{ padding: 24 }}>
          <div style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
            Logos
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <LogoUpload
              label="Consultant Logo"
              type="consultant"
              currentValue={settings.consultant_logo ?? ''}
              onUploaded={loadSettings}
              onRemoved={loadSettings}
            />

            <LogoUpload
              label="Client Logo"
              type="client"
              currentValue={settings.client_logo ?? ''}
              onUploaded={loadSettings}
              onRemoved={loadSettings}
            />
          </div>
        </Card>

        {/* Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PrimaryButton
            onClick={saving ? undefined : handleSave}
            style={{
              padding: '10px 24px', fontSize: 13,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </PrimaryButton>

          {saved && (
            <span style={{ color: '#10B981', fontSize: 12, fontWeight: 600 }}>
              Settings saved
            </span>
          )}

          {error && (
            <span style={{ color: '#EF4444', fontSize: 12 }}>{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
