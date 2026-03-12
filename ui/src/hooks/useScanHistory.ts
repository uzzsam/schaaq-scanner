import { useState, useEffect, useCallback } from 'react';
import {
  fetchScanHistory,
  fetchScanComparison,
  fetchResultSetByScanId,
  fetchResultFindings,
  type ScanHistoryListItem,
  type ScanSummaryComparison,
  type ScanResultSet,
  type ResultFinding,
} from '../api/client';

export interface ScanHistoryState {
  /** All history items for the project (newest first) */
  history: ScanHistoryListItem[];
  /** The currently selected/active result set */
  activeResultSet: ScanResultSet | null;
  /** Findings for the active result set */
  activeFindings: ResultFinding[];
  /** Comparison between latest and previous (only when 2+ runs) */
  comparison: ScanSummaryComparison | null;
  /** Currently selected result set ID */
  selectedResultSetId: string | null;
  /** Loading states */
  historyLoading: boolean;
  resultLoading: boolean;
  /** Error message */
  error: string | null;
  /** Select a different result set from history */
  selectResultSet: (resultSetId: string) => void;
  /** Refresh all data */
  refresh: () => void;
}

/**
 * Hook to manage scan history state for a project.
 *
 * On mount, loads the history list and resolves the latest result set
 * from the current scanId. Allows switching between historical runs.
 */
export function useScanHistory(
  projectId: string | undefined,
  scanId: string | undefined,
): ScanHistoryState {
  const [history, setHistory] = useState<ScanHistoryListItem[]>([]);
  const [activeResultSet, setActiveResultSet] = useState<ScanResultSet | null>(null);
  const [activeFindings, setActiveFindings] = useState<ResultFinding[]>([]);
  const [comparison, setComparison] = useState<ScanSummaryComparison | null>(null);
  const [selectedResultSetId, setSelectedResultSetId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [resultLoading, setResultLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load history list and comparison on mount
  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    setError(null);
    try {
      const [historyData, comparisonData] = await Promise.all([
        fetchScanHistory(projectId),
        fetchScanComparison(projectId).catch(() => null),
      ]);
      setHistory(historyData.items);
      setComparison(comparisonData);

      // Auto-select the latest result set based on current scanId
      if (scanId && historyData.items.length > 0) {
        try {
          const resultSet = await fetchResultSetByScanId(scanId);
          setActiveResultSet(resultSet);
          setSelectedResultSetId(resultSet.id);
          // Load findings for this result set
          const findingsData = await fetchResultFindings(resultSet.id);
          setActiveFindings(findingsData.findings);
        } catch {
          // Result set not yet persisted — that's fine, clear state
          setActiveResultSet(null);
          setSelectedResultSetId(null);
          setActiveFindings([]);
        }
      } else if (historyData.items.length > 0) {
        // No scanId — select the latest result set
        const latest = historyData.items[0];
        setSelectedResultSetId(latest.resultSetId);
        await loadResultSet(latest.resultSetId);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load scan history');
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId, scanId]);

  // Load a specific result set and its findings
  const loadResultSet = useCallback(async (resultSetId: string) => {
    setResultLoading(true);
    setError(null);
    try {
      const [resultSet, findingsData] = await Promise.all([
        // We import fetchResultSetById inline to avoid circular deps
        import('../api/client').then((m) => m.fetchResultSetById(resultSetId)),
        fetchResultFindings(resultSetId),
      ]);
      setActiveResultSet(resultSet);
      setActiveFindings(findingsData.findings);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load result set');
      setActiveResultSet(null);
      setActiveFindings([]);
    } finally {
      setResultLoading(false);
    }
  }, []);

  // Select a different result set
  const selectResultSet = useCallback((resultSetId: string) => {
    setSelectedResultSetId(resultSetId);
    loadResultSet(resultSetId);
  }, [loadResultSet]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return {
    history,
    activeResultSet,
    activeFindings,
    comparison,
    selectedResultSetId,
    historyLoading,
    resultLoading,
    error,
    selectResultSet,
    refresh: loadHistory,
  };
}
