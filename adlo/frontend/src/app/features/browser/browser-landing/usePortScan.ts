import { useCallback, useRef, useState } from 'react';
import { invokeIpc } from '../../../../tauri-bridge/tauri-shared';

interface ScannedPort {
  port: number;
  isOpen: boolean;
  responseTimeMs: number;
}

interface UsePortScanReturn {
  scanPorts: (ports: number[]) => Promise<ScannedPort[]>;
  isScanning: boolean;
  error: string | null;
}

export function usePortScan(): UsePortScanReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const scanPorts = useCallback(async (ports: number[]): Promise<ScannedPort[]> => {
    if (abortRef.current) {
      return [];
    }

    setIsScanning(true);
    setError(null);

    try {
      const result = await invokeIpc<ScannedPort[]>('browser_scan_ports', { ports });

      if (!result.ok) {
        const message = result.error?.message || 'Port scan failed';
        setError(message);
        return [];
      }

      return result.data;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return [];
    } finally {
      setIsScanning(false);
    }
  }, []);

  return { scanPorts, isScanning, error };
}
