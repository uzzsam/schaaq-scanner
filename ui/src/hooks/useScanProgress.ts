import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeScanProgress, type ScanProgressEvent } from '../api/client';

export function useScanProgress(scanId: string | undefined) {
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (!scanId) return;
    // Clean up existing connection
    unsubRef.current?.();

    setConnected(true);
    unsubRef.current = subscribeScanProgress(
      scanId,
      (event) => {
        setProgress(event);
        if (event.status === 'completed' || event.status === 'failed') {
          setConnected(false);
        }
      },
      () => {
        setConnected(false);
      },
    );
  }, [scanId]);

  useEffect(() => {
    connect();
    return () => {
      unsubRef.current?.();
      setConnected(false);
    };
  }, [connect]);

  return { progress, connected };
}
