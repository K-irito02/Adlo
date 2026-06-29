import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { createUiId } from '@stores/shared';
import { isTauriShell } from '@tauri-bridge';
import type { LocalPort } from '@stores/slices/browserSlice';
import './LocalPortSection.css';

interface LocalPortSectionProps {
  t: Record<string, string>;
  onOpenUrl: (url: string) => void;
  onAddManualPort: () => void;
  onContextMenu: (e: React.MouseEvent, port: LocalPort) => void;
}

const SCAN_API = '/__adl_preview_api__/browser/scan-ports';

export function LocalPortSection({
  t,
  onOpenUrl,
  onAddManualPort,
  onContextMenu,
}: LocalPortSectionProps) {
  const {
    browserLocalPorts,
    browserPortScanning,
    browserSetLocalPorts,
    browserReorderLocalPorts,
    browserSetPortScanning,
  } = useAppStore(
    useShallow((state) => ({
      browserLocalPorts: state.browserLocalPorts,
      browserPortScanning: state.browserPortScanning,
      browserSetLocalPorts: state.browserSetLocalPorts,
      browserReorderLocalPorts: state.browserReorderLocalPorts,
      browserSetPortScanning: state.browserSetPortScanning,
    }))
  );

  const [dragOverPortId, setDragOverPortId] = useState<string | null>(null);
  const scanningRef = useRef(false);

  const sortedPorts = useMemo(
    () => [...browserLocalPorts].sort((a, b) => a.sortOrder - b.sortOrder),
    [browserLocalPorts]
  );

  const scanPorts = useCallback(async () => {
    if (scanningRef.current) {
      return;
    }
    scanningRef.current = true;
    browserSetPortScanning(true);

    try {
      let discovered: Array<{ host: string; port: number }> = [];

      if (isTauriShell()) {
        // Tauri 模式：暂不支持服务端扫描，保持端口列表不变
      } else {
        const response = await fetch(SCAN_API);
        if (response.ok) {
          const result = await response.json();
          if (result.ok && Array.isArray(result.data)) {
            discovered = result.data;
          }
        }
      }

      const existingKeys = new Set(browserLocalPorts.map((p) => `${p.host}:${p.port}`));
      const maxSortOrder =
        browserLocalPorts.length > 0 ? Math.max(...browserLocalPorts.map((p) => p.sortOrder)) : 0;

      const newPorts = discovered
        .filter((p) => !existingKeys.has(`${p.host}:${p.port}`))
        .map((p, idx) => ({
          id: createUiId('localport'),
          host: p.host,
          port: p.port,
          isAutoDiscovered: true,
          lastAliveAt: Date.now(),
          sortOrder: maxSortOrder + idx + 1,
        }));

      if (newPorts.length > 0) {
        browserSetLocalPorts([...browserLocalPorts, ...newPorts]);
      }
    } catch {
    } finally {
      scanningRef.current = false;
      browserSetPortScanning(false);
    }
  }, [browserLocalPorts, browserSetLocalPorts, browserSetPortScanning]);

  useEffect(() => {
    if (browserLocalPorts.length === 0) {
      scanPorts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(() => {
    scanPorts();
  }, [scanPorts]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: string) => {
    setDragOverPortId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragOverPortId(null);
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, targetId: string) => {
      setDragOverPortId(null);
      const draggedId = _e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === targetId) {
        return;
      }

      const ids = sortedPorts.map((p) => p.id);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) {
        return;
      }

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, draggedId);
      browserReorderLocalPorts(ids);
    },
    [sortedPorts, browserReorderLocalPorts]
  );

  const handlePortClick = useCallback(
    (port: { id: string; host: string; port: number; label?: string }) => {
      onOpenUrl(`http://${port.host}:${port.port}`);
    },
    [onOpenUrl]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, port: LocalPort) => {
      e.preventDefault();
      onContextMenu(e, port);
    },
    [onContextMenu]
  );

  return (
    <div className="adl-local-port-section">
      <div className="adl-local-port-section__header">
        <span className="adl-local-port-section__title">{t.browserLocalPorts}</span>
        <button
          type="button"
          className="adl-local-port-section__refresh"
          onClick={handleRefresh}
          disabled={browserPortScanning}
          aria-label={t.browserRefreshPorts}
          title={t.browserRefreshPorts}
        >
          ↻
        </button>
      </div>
      <div className="adl-local-port-section__items">
        {sortedPorts.map((port) => (
          <div
            key={port.id}
            className={`adl-local-port-card${dragOverPortId === port.id ? ' adl-local-port-card--drag-over' : ''}`}
            title={`${port.host}:${port.port}${port.label ? ` (${port.label})` : ''}`}
            draggable
            onDragStart={(e) => {
              handleDragStart(e, port.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              handleDragOver(e, port.id);
            }}
            onDragEnd={handleDragEnd}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(e, port.id);
            }}
            onClick={() => handlePortClick(port)}
            onContextMenu={(e) => handleContextMenu(e, port)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handlePortClick(port);
              }
            }}
          >
            <span className="adl-local-port-card__dot" />
            <span className="adl-local-port-card__address" title={`${port.host}:${port.port}`}>
              {port.host}:{port.port}
            </span>
            {port.label && (
              <span className="adl-local-port-card__label" title={port.label}>
                {port.label}
              </span>
            )}
          </div>
        ))}
        <div
          className="adl-local-port-card__add-placeholder"
          onClick={onAddManualPort}
          role="button"
          tabIndex={0}
          title={t.browserAddManualPort}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onAddManualPort();
            }
          }}
        >
          <span className="adl-local-port-card__add-icon">+</span>
          <span className="adl-local-port-card__add-text">{t.browserAddManualPort}</span>
        </div>
      </div>
    </div>
  );
}
