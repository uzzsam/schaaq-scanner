import { useState, useEffect, useCallback } from 'react';
import {
  fetchProjectScans,
  fetchScan,
  fetchFindings,
  fetchEngineResult,
  triggerScan as apiTrigger,
  type Scan,
  type Finding,
  type EngineResult,
} from '../api/client';

export function useProjectScans(projectId: string | undefined) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjectScans(projectId);
      setScans(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const trigger = useCallback(async (dryRun: boolean = false) => {
    if (!projectId) throw new Error('No project ID');
    const result = await apiTrigger(projectId, dryRun);
    return result;
  }, [projectId]);

  return { scans, loading, error, refresh: load, trigger };
}

export function useScan(scanId: string | undefined) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!scanId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchScan(scanId);
      setScan(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => { load(); }, [load]);

  return { scan, loading, error, refresh: load };
}

export function useScanFindings(scanId: string | undefined, property?: number) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!scanId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFindings(scanId, property);
      setFindings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scanId, property]);

  useEffect(() => { load(); }, [load]);

  return { findings, loading, error, refresh: load };
}

export function useEngineResult(scanId: string | undefined) {
  const [result, setResult] = useState<EngineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!scanId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEngineResult(scanId);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => { load(); }, [load]);

  return { result, loading, error, refresh: load };
}
