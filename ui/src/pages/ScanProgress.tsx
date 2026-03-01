import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchScan, subscribeScanProgress, type ScanProgressEvent } from '../api/client';
import { PrimaryButton } from '../components/Shared';

export function ScanProgress() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null);
  const [logs, setLogs] = useState<ScanProgressEvent[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!scanId) return;

    // Polling fallback — catches fast scans (e.g. dry-run) that finish
    // before the SSE connection opens.
    const poll = () => {
      fetchScan(scanId).then((scan) => {
        if (scan.status === 'completed' || scan.status === 'failed') {
          // Synthesise a progress event from the scan row
          const evt: ScanProgressEvent = {
            scanId: scan.id,
            status: scan.status as 'completed' | 'failed',
            progress: scan.status === 'completed' ? 1 : scan.progress ?? 0,
            currentStep: scan.current_step ?? (scan.status === 'completed' ? 'Done' : 'Failed'),
            message: scan.error_message ?? undefined,
          };
          setProgress(evt);
          setLogs((prev) => prev.length === 0 ? [evt] : prev);
          // Stop polling + SSE once terminal
          if (pollRef.current) clearInterval(pollRef.current);
          cleanupRef.current?.();
        }
      }).catch(() => { /* ignore transient fetch errors */ });
    };

    // Immediate check, then every 2 s
    poll();
    pollRef.current = setInterval(poll, 2000);

    // SSE for live progress on longer-running scans
    cleanupRef.current = subscribeScanProgress(
      scanId,
      (event) => {
        setProgress(event);
        setLogs((prev) => [...prev, event]);
        if (event.status === 'completed' || event.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      },
      (err) => console.error('SSE error:', err),
    );

    return () => {
      cleanupRef.current?.();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scanId]);

  const isComplete = progress?.status === 'completed';
  const isFailed = progress?.status === 'failed';
  const pct = Math.max(0, Math.min(100, (progress?.progress ?? 0) * 100));

  return (
    <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 48, opacity: 0.4, marginBottom: 16 }}>
          {isComplete ? '✓' : isFailed ? '✗' : '◎'}
        </div>
        <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          {isComplete ? 'Scan Complete' : isFailed ? 'Scan Failed' : 'Scanning...'}
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13 }}>
          {progress?.currentStep ?? 'Initialising...'}
        </p>
      </div>

      {/* Progress Bar */}
      <div style={{
        width: '100%', height: 12, background: 'rgba(255,255,255,0.06)',
        borderRadius: 6, overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: isFailed ? '#EF4444' : '#10B981',
          borderRadius: 6, transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700,
        color: isFailed ? '#EF4444' : '#10B981', marginBottom: 24,
      }}>
        {Math.round(pct)}%
      </div>

      {/* Message */}
      {progress?.message && (
        <div style={{
          background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, padding: 16, marginBottom: 24, textAlign: 'left',
          color: '#D1D5DB', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
        }}>
          {progress.message}
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div style={{
          background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, padding: 12, textAlign: 'left', maxHeight: 200, overflow: 'auto',
        }}>
          {logs.map((log, i) => (
            <div key={i} style={{ color: '#6B7280', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '2px 0' }}>
              [{Math.round(log.progress * 100)}%] {log.currentStep}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 24 }}>
        {isComplete && (
          <PrimaryButton onClick={() => navigate(`/scans/${scanId}/results`)}>
            View Results →
          </PrimaryButton>
        )}
        {isFailed && (
          <PrimaryButton onClick={() => navigate('/projects')}>
            Back to Projects
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}
