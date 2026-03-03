import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchScan, fetchFindings, getExportHtmlUrl, getExportPdfUrl, type Scan, type Finding } from '../api/client';
import { PageHeader, Card, PrimaryButton, SecondaryButton } from '../components/Shared';
import { PROPERTY_NAMES, SEVERITY_CONFIG, type SeverityKey } from '../utils';
import { ScanDetailSkeleton } from '../components/LoadingSkeleton';
import { ErrorState } from '../components/ErrorState';

export function ScanReport() {
  const { scanId } = useParams();
  const [scan, setScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!scanId) return;
    setLoading(true);
    setError(null);
    Promise.all([fetchScan(scanId), fetchFindings(scanId)])
      .then(([s, f]) => { setScan(s); setFindings(f); })
      .catch((err) => setError(err?.message ?? 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [scanId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ScanDetailSkeleton />;
  if (error || !scan) return <ErrorState title="Scan not found" message={error ?? 'This scan could not be loaded.'} onRetry={load} />;

  const downloadCsv = () => {
    const header = ['ID', 'Title', 'Severity', 'Property', 'Property Name', 'Raw Score', 'Ratio', 'Affected Objects', 'Total Objects', 'Description', 'Remediation'];
    const rows = findings.map((f) => [
      f.check_id,
      `"${(f.title ?? '').replace(/"/g, '""')}"`,
      f.severity,
      `P${f.property}`,
      PROPERTY_NAMES[f.property] ?? '',
      f.raw_score.toFixed(4),
      (f.ratio * 100).toFixed(2) + '%',
      f.affected_objects,
      f.total_objects,
      `"${(f.description ?? '').replace(/"/g, '""')}"`,
      `"${(f.remediation ?? '').replace(/"/g, '""')}"`,
    ]);

    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-${scanId}-findings.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!scanId) return;
    setPdfGenerating(true);
    setPdfError(null);

    try {
      if (window.schaaq?.generatePdf) {
        // Electron mode: use built-in Chromium via IPC
        const result = await window.schaaq.generatePdf(scanId);
        if (!result.success && result.reason !== 'cancelled') {
          setPdfError(result.reason ?? 'PDF generation failed');
        }
      } else {
        // Browser mode: use server-side puppeteer-core route
        const response = await fetch(getExportPdfUrl(scanId));
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? body.hint ?? `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schaaq-report-${scanId.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setPdfError(err?.message ?? 'PDF generation failed');
    } finally {
      setPdfGenerating(false);
    }
  };

  const pdfAvailable = !!window.schaaq?.generatePdf || true; // always available (browser falls back to server route)

  const formats = [
    {
      key: 'html',
      icon: '◈',
      iconColor: '#10B981',
      title: 'HTML Report',
      description: 'Self-contained interactive report. Opens in any browser.',
      available: true,
    },
    {
      key: 'pdf',
      icon: '▣',
      iconColor: '#818CF8',
      title: 'PDF Report',
      description: 'Executive summary for board presentations.',
      available: pdfAvailable,
    },
    {
      key: 'csv',
      icon: '▤',
      iconColor: '#3B82F6',
      title: 'CSV Export',
      description: 'Raw findings data for spreadsheets and analysis tools.',
      available: true,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Export Report"
        subtitle={`Scan ${scanId?.slice(0, 8)}… · ${findings.length} findings`}
      />

      {/* Summary strip */}
      <Card style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center' }}>
        <div>
          <div className="label-text" style={{ marginBottom: 4 }}>Findings</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: '#E5E7EB' }}>
            {scan.total_findings}
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', gap: 12 }}>
          {(['critical', 'major', 'minor', 'info'] as SeverityKey[]).map((sev) => {
            const count = sev === 'critical' ? scan.critical_count : sev === 'major' ? scan.major_count : sev === 'minor' ? scan.minor_count : scan.info_count;
            const cfg = SEVERITY_CONFIG[sev];
            return (
              <div key={sev} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: cfg.color }}>{count}</div>
                <div style={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase', fontWeight: 500 }}>{cfg.label}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Format cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {formats.map((fmt) => (
          <Card key={fmt.key} style={{
            padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center', gap: 16, opacity: fmt.available ? 1 : 0.6,
          }}>
            {/* Icon */}
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: `${fmt.iconColor}15`,
              border: `1px solid ${fmt.iconColor}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, color: fmt.iconColor,
            }}>
              {fmt.icon}
            </div>

            <div>
              <div style={{ color: 'white', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{fmt.title}</div>
              <div style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.5 }}>{fmt.description}</div>
            </div>

            <div style={{ marginTop: 'auto', width: '100%' }}>
              {fmt.key === 'html' && (
                <a
                  href={getExportHtmlUrl(scanId!)}
                  download
                  style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    background: 'rgba(16,185,129,0.1)', color: '#10B981',
                    border: '1px solid rgba(16,185,129,0.25)',
                    padding: '10px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    textDecoration: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                >
                  Download HTML
                </a>
              )}
              {fmt.key === 'csv' && (
                <PrimaryButton onClick={downloadCsv} style={{ width: '100%' }}>
                  Download CSV
                </PrimaryButton>
              )}
              {fmt.key === 'pdf' && fmt.available && (
                <div style={{ position: 'relative' }}>
                  <PrimaryButton
                    onClick={pdfGenerating ? undefined : downloadPdf}
                    style={{ width: '100%', opacity: pdfGenerating ? 0.6 : 1, cursor: pdfGenerating ? 'wait' : 'pointer' }}
                  >
                    {pdfGenerating ? 'Generating PDF…' : 'Download PDF'}
                  </PrimaryButton>
                  {pdfError && (
                    <div style={{
                      marginTop: 6, fontSize: 11, color: '#EF4444',
                      lineHeight: 1.4,
                    }}>
                      {pdfError}
                    </div>
                  )}
                </div>
              )}
              {fmt.key === 'pdf' && !fmt.available && (
                <div style={{ position: 'relative' }}>
                  <SecondaryButton style={{ width: '100%', opacity: 0.5, cursor: 'not-allowed' }}>
                    Download PDF
                  </SecondaryButton>
                  <div style={{
                    marginTop: 6, fontSize: 10, color: '#6B7280',
                    fontStyle: 'italic',
                  }}>
                    Coming soon
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Privacy notice */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: 16, borderRadius: 8,
        background: 'rgba(16,185,129,0.04)',
        border: '1px solid rgba(16,185,129,0.1)',
      }}>
        <span style={{ fontSize: 18, opacity: 0.6 }}>🔒</span>
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>
          All reports generated locally. No data transmitted outside this machine.
        </span>
      </div>
    </div>
  );
}
