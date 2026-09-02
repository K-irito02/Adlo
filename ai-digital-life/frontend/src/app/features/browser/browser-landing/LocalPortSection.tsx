import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { createUiId } from '@stores/shared';
import type { LocalPort } from '@stores/slices/browserSlice';
import './LocalPortSection.css';
import { RefreshButton } from '../../git-visualization/RefreshButton';

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
    browserSetLocalPorts,
    browserReorderLocalPorts,
    browserSetPortScanning,
  } = useAppStore(
    useShallow((state) => ({
      browserLocalPorts: state.browserLocalPorts,
      browserSetLocalPorts: state.browserSetLocalPorts,
      browserReorderLocalPorts: state.browserReorderLocalPorts,
      browserSetPortScanning: state.browserSetPortScanning,
    })),
  );

  const [dragOverPortId, setDragOverPortId] = useState<string | null>(null);
  const scanningRef = useRef(false);

  const sortedPorts = useMemo(() => {
    const sorted = [...browserLocalPorts].sort((a, b) => a.sortOrder - b.sortOrder);
    console.log(
      '[ADL-DEBUG] LocalPortSection: sorted ports:',
      sorted.map((p) => ({ port: p.port, healthy: p.healthy, lastAliveAt: p.lastAliveAt })),
    );
    return sorted;
  }, [browserLocalPorts]);

  const scanPorts = useCallback(async () => {
    if (scanningRef.current) {
      return;
    }
    scanningRef.current = true;

    try {
      const store = useAppStore.getState();

      if (store.isTauri) {
        await store.browserScanPorts(store.browserConfiguredPorts);
      } else {
        console.log('[ADL-DEBUG] scanPorts (browser mode): starting scan');
        browserSetPortScanning(true);
        const response = await fetch(SCAN_API);
        if (response.ok) {
          const result = await response.json();
          if (result.ok && Array.isArray(result.data)) {
            const discovered: { host: string; port: number }[] = result.data;
            console.log('[ADL-DEBUG] scanPorts (browser mode): discovered ports:', discovered);
            const existingKeys = new Set(browserLocalPorts.map((p) => `${p.host}:${p.port}`));
            const maxSortOrder =
              browserLocalPorts.length > 0
                ? Math.max(...browserLocalPorts.map((p) => p.sortOrder))
                : 0;

            // Update health status for existing ports
            const discoveredPortSet = new Set(discovered.map((p) => p.port));
            const updatedCurrent = browserLocalPorts.map((p) => {
              const isHealthy = discoveredPortSet.has(p.port);
              console.log(
                `[ADL-DEBUG] scanPorts (browser mode): port ${p.port} health check: isHealthy=${isHealthy}, previous healthy=${p.healthy}`,
              );
              return {
                ...p,
                healthy: isHealthy,
                lastAliveAt: isHealthy ? Date.now() : p.lastAliveAt,
              };
            });

            // Add new ports
            const newPorts = discovered
              .filter((p) => !existingKeys.has(`${p.host}:${p.port}`))
              .map((p, idx) => ({
                id: createUiId('localport'),
                host: p.host,
                port: p.port,
                isAutoDiscovered: true,
                healthy: true,
                lastAliveAt: Date.now(),
                sortOrder: maxSortOrder + idx + 1,
              }));

            const next = [...updatedCurrent, ...newPorts];
            console.log(
              '[ADL-DEBUG] scanPorts (browser mode): final ports state:',
              next.map((p) => ({ port: p.port, healthy: p.healthy })),
            );
            browserSetLocalPorts(next);
          }
        }
      }
    } catch (e) {
      console.warn('[ADL-DEBUG] scanPorts: failed:', e);
    } finally {
      scanningRef.current = false;
      browserSetPortScanning(false);
    }
  }, [browserLocalPorts, browserSetLocalPorts, browserSetPortScanning]);

  useEffect(() => {
    if (browserLocalPorts.length === 0) {
      scanPorts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: initial port scan; scanPorts is stable via useCallback and reads latest state from stores
  }, []);

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
    [sortedPorts, browserReorderLocalPorts],
  );

  const handlePortClick = useCallback(
    (port: { id: string; host: string; port: number; label?: string }) => {
      onOpenUrl(`http://${port.host}:${port.port}`);
    },
    [onOpenUrl],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, port: LocalPort) => {
      e.preventDefault();
      onContextMenu(e, port);
    },
    [onContextMenu],
  );

  return (
    <div className="adl-local-port-section">
      <div className="adl-local-port-section__header">
        <span className="adl-local-port-section__title">{t.browserLocalPorts}</span>
        <RefreshButton
          onRefresh={scanPorts}
          label={t.browserRefreshPorts}
          className="adl-local-port-section__refresh"
        />
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
            <span
              className={`adl-local-port-card__dot${port.healthy === false ? ' adl-local-port-card__dot--unhealthy' : ''}`}
            />
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
