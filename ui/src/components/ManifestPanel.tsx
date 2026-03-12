/**
 * ManifestPanel — Assessment Audit & Reproducibility display.
 *
 * Shows:
 *  - Version traceability (app, DALC engine, ruleset, schema)
 *  - Run metadata (timing, adapter, source, status)
 *  - Coverage summary (findings, properties, DALC cost)
 *  - Component availability matrix (which enrichment layers ran)
 */

import { useState } from 'react';
import type { AssessmentManifest } from '../api/client';
import { formatCost } from '../utils';
import { Card } from './Shared';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: '#27AE60',
    failed: '#E74C3C',
    partial: '#F39C12',
    running: '#3498DB',
  };
  const color = colorMap[status] ?? '#95A5A6';
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700,
      padding: '1px 6px', borderRadius: 3, letterSpacing: '0.04em',
      background: `${color}18`, color,
      textTransform: 'uppercase',
    }}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component availability chip
// ---------------------------------------------------------------------------

function AvailabilityChip({ available, label }: { available: boolean; label: string }) {
  const color = available ? '#27AE60' : '#4B5563';
  const icon = available ? '✓' : '—';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, color, padding: '2px 8px',
      background: available ? 'rgba(39,174,96,0.08)' : 'rgba(75,85,99,0.08)',
      borderRadius: 3, marginRight: 6, marginBottom: 4,
    }}>
      <span style={{ fontWeight: 700, fontSize: 10 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info row helper
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
    }}>
      <span style={{ fontSize: 11, color: '#6B7280' }}>{label}</span>
      <span style={{ fontSize: 11, color: '#D1D5DB', fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ManifestPanel
// ---------------------------------------------------------------------------

interface ManifestPanelProps {
  manifest: AssessmentManifest;
}

export function ManifestPanel({ manifest }: ManifestPanelProps) {
  const [showDetail, setShowDetail] = useState(false);
  const { versions, run, coverage, components } = manifest;

  const componentEntries: Array<{ key: string; label: string; available: boolean }> = [
    { key: 'coreFindings', label: 'Core Findings', available: components.coreFindings },
    { key: 'criticalityAssessment', label: 'Criticality', available: components.criticalityAssessment },
    { key: 'methodologySummary', label: 'Methodology', available: components.methodologySummary },
    { key: 'trendDataAvailable', label: 'Trend Data', available: components.trendDataAvailable },
    { key: 'benchmarkAvailable', label: 'Benchmark', available: components.benchmarkAvailable },
    { key: 'blastRadiusAvailable', label: 'Blast Radius', available: components.blastRadiusAvailable },
    { key: 'remediationAvailable', label: 'Remediation', available: components.remediationAvailable },
  ];

  const availableCount = componentEntries.filter(c => c.available).length;

  return (
    <div style={{ marginBottom: 16 }} data-testid="manifest-panel">
      <Card style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>📋</span>
          <span className="label-text">Assessment Manifest</span>
          <StatusBadge status={run.status} />
          <span style={{
            marginLeft: 'auto', fontSize: 10, color: '#6B7280',
          }}>
            v{versions.appVersion} · {versions.dalcVersion}
          </span>
        </div>

        {/* Version row */}
        <div style={{
          padding: '6px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, color: '#6B7280' }}>
            App <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{versions.appVersion}</span>
          </span>
          <span style={{ fontSize: 10, color: '#6B7280' }}>
            Engine <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{versions.dalcVersion}</span>
          </span>
          <span style={{ fontSize: 10, color: '#6B7280' }}>
            Ruleset <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{versions.rulesetVersion}</span>
          </span>
          <span style={{ fontSize: 10, color: '#6B7280' }}>
            Schema <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>v{versions.schemaVersion}</span>
          </span>
        </div>

        {/* Coverage summary */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
            <span style={{ color: '#D1D5DB' }}>
              <span style={{ color: '#9CA3AF' }}>DALC:</span>{' '}
              <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCost(coverage.dalcTotalUsd)}
              </span>
            </span>
            <span style={{ color: '#D1D5DB' }}>
              <span style={{ color: '#9CA3AF' }}>Findings:</span>{' '}
              <span style={{ fontWeight: 600 }}>{coverage.totalFindings}</span>
            </span>
            <span style={{ color: '#D1D5DB' }}>
              <span style={{ color: '#9CA3AF' }}>Properties:</span>{' '}
              <span style={{ fontWeight: 600 }}>{coverage.propertiesCovered}/{coverage.totalProperties}</span>
            </span>
            <span style={{ color: '#D1D5DB' }}>
              <span style={{ color: '#9CA3AF' }}>Components:</span>{' '}
              <span style={{ fontWeight: 600 }}>{availableCount}/{componentEntries.length}</span>
            </span>
          </div>
        </div>

        {/* Component availability chips */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {componentEntries.map(c => (
              <AvailabilityChip key={c.key} available={c.available} label={c.label} />
            ))}
          </div>
        </div>

        {/* Collapsible detail section */}
        <div
          style={{
            padding: '6px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onClick={() => setShowDetail(!showDetail)}
          data-testid="manifest-detail-toggle"
        >
          <span style={{
            fontSize: 10, color: '#6B7280',
            transition: 'transform 0.15s',
            transform: showDetail ? 'rotate(90deg)' : 'none',
          }}>
            ▶
          </span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>Run Details</span>
          {run.durationLabel && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4B5563' }}>
              {run.durationLabel}
            </span>
          )}
        </div>

        {showDetail && (
          <div style={{ padding: '4px 16px 12px' }}>
            <InfoRow label="Result Set ID" value={run.resultSetId} />
            {run.scanId && <InfoRow label="Scan ID" value={run.scanId} />}
            <InfoRow label="Run Label" value={run.runLabel} />
            <InfoRow label="Adapter" value={run.adapterType} />
            {run.sourceName && <InfoRow label="Source" value={run.sourceName} />}
            {run.sourceFingerprint && <InfoRow label="Fingerprint" value={run.sourceFingerprint} />}
            <InfoRow label="Started" value={run.startedAt} />
            {run.completedAt && <InfoRow label="Completed" value={run.completedAt} />}
            {run.durationLabel && <InfoRow label="Duration" value={run.durationLabel} />}
            <InfoRow label="Amplification" value={`${coverage.amplificationRatio.toFixed(2)}×`} />
            {coverage.derivedApproach && <InfoRow label="Approach" value={coverage.derivedApproach} />}

            {/* Severity breakdown */}
            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Critical', count: coverage.criticalCount, color: '#E74C3C' },
                { label: 'Major', count: coverage.majorCount, color: '#F39C12' },
                { label: 'Minor', count: coverage.minorCount, color: '#3498DB' },
                { label: 'Info', count: coverage.infoCount, color: '#95A5A6' },
              ].map(s => (
                <span key={s.label} style={{
                  fontSize: 10, color: s.count > 0 ? s.color : '#4B5563',
                }}>
                  {s.label}: <span style={{ fontWeight: 600 }}>{s.count}</span>
                </span>
              ))}
            </div>

            {/* Manifest metadata */}
            <div style={{ marginTop: 8, fontSize: 9, color: '#4B5563' }}>
              Manifest v{manifest.manifestVersion} · Generated {new Date(manifest.generatedAt).toLocaleString()}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
