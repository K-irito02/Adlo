import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './SearchEnginePopover.css';
import {
  IconArrowLeft,
  IconCheck,
  IconPencil,
  IconTrash,
  IconGlobeSearch,
  IconGlobeSettings,
  IconGlobePlus,
} from '@icons';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { SearchEngine } from '@stores/slices/browserSearchEnginesSlice';
import { computePopoverPosition } from './searchEnginePopoverPosition';

const failedFaviconUrls = new Set<string>();
const loadedFaviconUrls = new Set<string>();
const PRELOAD_TIMEOUT_MS = 3000;

interface SearchEnginePopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}

interface FormData {
  name: string;
  urlTemplate: string;
}

export const SearchEnginePopover = React.memo(function SearchEnginePopover({
  open,
  onClose,
  anchorRef,
}: SearchEnginePopoverProps) {
  const { t } = useTCopy();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'main' | 'manage'>('main');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: '', urlTemplate: '' });
  const [urlError, setUrlError] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [popoverVisible, setPopoverVisible] = useState(false);

  const searchEngines = useAppStore((s) => s.searchEngines);
  const defaultSearchEngineId = useAppStore((s) => s.defaultSearchEngineId);
  const setDefaultSearchEngine = useAppStore((s) => s.setDefaultSearchEngine);
  const addCustomSearchEngine = useAppStore((s) => s.addCustomSearchEngine);
  const updateCustomSearchEngine = useAppStore((s) => s.updateCustomSearchEngine);
  const deleteCustomSearchEngine = useAppStore((s) => s.deleteCustomSearchEngine);

  const builtInEngines = searchEngines.filter((e) => e.isBuiltIn);
  const customEngines = searchEngines.filter((e) => !e.isBuiltIn);

  const resetForm = useCallback(() => {
    setFormData({ name: '', urlTemplate: '' });
    setEditingId(null);
    setUrlError(false);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setDefaultSearchEngine(id);
      onClose();
    },
    [setDefaultSearchEngine, onClose],
  );

  const handleOpenManage = useCallback(() => {
    resetForm();
    setView('manage');
  }, [resetForm]);

  const handleBack = useCallback(() => {
    resetForm();
    setView('main');
  }, [resetForm]);

  const handleStartEdit = useCallback((engine: SearchEngine) => {
    setEditingId(engine.id);
    setFormData({ name: engine.name, urlTemplate: engine.urlTemplate });
    setUrlError(false);
  }, []);

  const handleStartAdd = useCallback(() => {
    resetForm();
    setEditingId('new');
    setFormData({ name: '', urlTemplate: '' });
  }, [resetForm]);

  const handleCancel = useCallback(() => {
    resetForm();
  }, [resetForm]);

  const handleSave = useCallback(() => {
    if (!formData.urlTemplate.includes('%s')) {
      setUrlError(true);
      return;
    }
    if (editingId === 'new') {
      addCustomSearchEngine({ name: formData.name, urlTemplate: formData.urlTemplate });
    } else if (editingId) {
      updateCustomSearchEngine(editingId, {
        name: formData.name,
        urlTemplate: formData.urlTemplate,
      });
    }
    resetForm();
  }, [formData, editingId, addCustomSearchEngine, updateCustomSearchEngine, resetForm]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteCustomSearchEngine(id);
    },
    [deleteCustomSearchEngine],
  );

  useEffect(() => {
    if (!open) {
      setView('main');
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) {
      setMeasuredWidth(0);
      setPopoverVisible(false);
      return;
    }
    const measure = () => {
      const pop = popoverRef.current;
      if (!pop) {
        return;
      }
      setMeasuredWidth(pop.offsetWidth);
      setPopoverVisible(true);
    };
    const raf = requestAnimationFrame(measure);
    // 窗口尺寸变化后重测宽度，避免 popover 依赖过期宽度定位（右对齐/左对齐切换）
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [open, view, editingId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'manage') {
          if (editingId) {
            handleCancel();
          } else {
            handleBack();
          }
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, view, editingId, handleCancel, handleBack]);

  if (!open) {
    return null;
  }

  const anchorRect = anchorRef.current?.getBoundingClientRect();
  const popoverStyle: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        ...computePopoverPosition({
          anchorLeft: anchorRect.left,
          anchorRight: anchorRect.right,
          anchorBottom: anchorRect.bottom,
          popoverWidth: measuredWidth,
          viewportWidth: window.innerWidth,
        }),
        zIndex: 'var(--z-toast-top)',
      }
    : {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 'var(--z-toast-top)',
      };

  return createPortal(
    <div
      ref={popoverRef}
      className="adl-search-engine-popover"
      style={{ ...popoverStyle, visibility: popoverVisible ? 'visible' : 'hidden' }}
    >
      {view === 'main' ? (
        <SearchEngineMainView
          builtInEngines={builtInEngines}
          customEngines={customEngines}
          defaultSearchEngineId={defaultSearchEngineId}
          onSelect={handleSelect}
          onOpenManage={handleOpenManage}
          t={t}
        />
      ) : (
        <SearchEngineManageView
          customEngines={customEngines}
          editingId={editingId}
          formData={formData}
          urlError={urlError}
          onBack={handleBack}
          onStartEdit={handleStartEdit}
          onStartAdd={handleStartAdd}
          onDelete={handleDelete}
          onFormDataChange={setFormData}
          onCancel={handleCancel}
          onSave={handleSave}
          t={t}
        />
      )}
    </div>,
    document.body,
  );
});

function EngineFavicon({ engine, className }: { engine: SearchEngine; className?: string }) {
  const url = engine.faviconUrl;
  const isKnownFailed = !url || failedFaviconUrls.has(url);
  const isKnownLoaded = url && loadedFaviconUrls.has(url);
  const [showFallback, setShowFallback] = useState(isKnownFailed);

  useEffect(() => {
    if (!url) {
      setShowFallback(true);
      return;
    }
    if (url.startsWith('/')) {
      setShowFallback(false);
      return;
    }
    if (isKnownFailed) {
      setShowFallback(true);
      return;
    }
    if (isKnownLoaded) {
      setShowFallback(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        failedFaviconUrls.add(url);
        setShowFallback(true);
        controller.abort();
      }
    }, PRELOAD_TIMEOUT_MS);

    const img = new Image();
    img.onload = () => {
      clearTimeout(timer);
      if (!controller.signal.aborted) {
        loadedFaviconUrls.add(url);
        setShowFallback(false);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      if (!controller.signal.aborted) {
        failedFaviconUrls.add(url);
        setShowFallback(true);
      }
    };
    img.src = url;

    return () => {
      clearTimeout(timer);
      controller.abort();
      img.onload = null;
      img.onerror = null;
    };
  }, [url, isKnownFailed, isKnownLoaded]);

  if (showFallback || isKnownFailed) {
    return <IconGlobeSearch size={14} decorative />;
  }

  return <img src={url} className={className} alt="" loading="lazy" />;
}

interface SearchEngineMainViewProps {
  builtInEngines: SearchEngine[];
  customEngines: SearchEngine[];
  defaultSearchEngineId: string;
  onSelect: (id: string) => void;
  onOpenManage: () => void;
  t: Record<string, string>;
}

function SearchEngineMainView({
  builtInEngines,
  customEngines,
  defaultSearchEngineId,
  onSelect,
  onOpenManage,
  t,
}: SearchEngineMainViewProps) {
  return (
    <>
      <div className="adl-search-engine-popover__group">
        <div className="adl-search-engine-popover__group-label">{t.browserSearchEngineBuiltIn}</div>
        {builtInEngines.map((engine) => (
          <button
            key={engine.id}
            type="button"
            className={`adl-search-engine-popover__item${engine.id === defaultSearchEngineId ? ' is-active' : ''}`}
            onClick={() => onSelect(engine.id)}
          >
            <span className="adl-search-engine-popover__icon">
              <EngineFavicon engine={engine} className="adl-search-engine-popover__favicon" />
            </span>
            <span className="adl-search-engine-popover__name">{engine.name}</span>
            {engine.id === defaultSearchEngineId && (
              <span className="adl-search-engine-popover__check">
                <IconCheck size={14} decorative />
              </span>
            )}
          </button>
        ))}
      </div>
      {customEngines.length > 0 && (
        <div className="adl-search-engine-popover__group">
          <div className="adl-search-engine-popover__group-label">
            {t.browserSearchEngineCustom}
          </div>
          {customEngines.map((engine) => (
            <button
              key={engine.id}
              type="button"
              className={`adl-search-engine-popover__item${engine.id === defaultSearchEngineId ? ' is-active' : ''}`}
              onClick={() => onSelect(engine.id)}
            >
              <span className="adl-search-engine-popover__icon">
                <EngineFavicon engine={engine} className="adl-search-engine-popover__favicon" />
              </span>
              <span className="adl-search-engine-popover__name">{engine.name}</span>
              {engine.id === defaultSearchEngineId && (
                <span className="adl-search-engine-popover__check">
                  <IconCheck size={14} decorative />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="adl-search-engine-popover__sep" />
      <button
        type="button"
        className="adl-search-engine-popover__manage-btn"
        onClick={onOpenManage}
      >
        <IconGlobeSettings size={14} decorative />
        <span>{t.browserSearchEngineManage}</span>
      </button>
    </>
  );
}

interface SearchEngineManageViewProps {
  customEngines: SearchEngine[];
  editingId: string | null;
  formData: FormData;
  urlError: boolean;
  onBack: () => void;
  onStartEdit: (engine: SearchEngine) => void;
  onStartAdd: () => void;
  onDelete: (id: string) => void;
  onFormDataChange: (data: FormData) => void;
  onCancel: () => void;
  onSave: () => void;
  t: Record<string, string>;
}

function SearchEngineManageView({
  customEngines,
  editingId,
  formData,
  urlError,
  onBack,
  onStartEdit,
  onStartAdd,
  onDelete,
  onFormDataChange,
  onCancel,
  onSave,
  t,
}: SearchEngineManageViewProps) {
  return (
    <>
      <div className="adl-search-engine-popover__header">
        <button type="button" className="adl-search-engine-popover__back-btn" onClick={onBack}>
          <IconArrowLeft size={14} decorative />
        </button>
        <span className="adl-search-engine-popover__header-title">
          {t.browserSearchEngineManage}
        </span>
      </div>
      <div className="adl-search-engine-popover__hint">
        {t.browserSearchEngineGetMethod.split('%s').reduce<React.ReactNode[]>((parts, part, i) => {
          if (i === 0) {
            return [part];
          }
          return [
            ...parts,
            <mark key={i} className="adl-search-engine-popover__hint-mark">
              %s
            </mark>,
            part,
          ];
        }, [])}
      </div>
      <div className="adl-search-engine-popover__group">
        {customEngines.map((engine) => (
          <div key={engine.id} className="adl-search-engine-popover__manage-item">
            {editingId === engine.id ? (
              <SearchEngineForm
                formData={formData}
                urlError={urlError}
                onFormDataChange={onFormDataChange}
                onCancel={onCancel}
                onSave={onSave}
                t={t}
              />
            ) : (
              <div className="adl-search-engine-popover__manage-row">
                <span className="adl-search-engine-popover__icon">
                  <EngineFavicon engine={engine} className="adl-search-engine-popover__favicon" />
                </span>
                <span className="adl-search-engine-popover__name">{engine.name}</span>
                <div className="adl-search-engine-popover__manage-actions">
                  <button
                    type="button"
                    className="adl-search-engine-popover__action-btn"
                    onClick={() => onStartEdit(engine)}
                  >
                    <IconPencil size={14} decorative />
                  </button>
                  <button
                    type="button"
                    className="adl-search-engine-popover__action-btn adl-search-engine-popover__action-btn--danger"
                    onClick={() => onDelete(engine.id)}
                  >
                    <IconTrash size={14} decorative />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {editingId === 'new' ? (
        <div className="adl-search-engine-popover__add-form">
          <SearchEngineForm
            formData={formData}
            urlError={urlError}
            onFormDataChange={onFormDataChange}
            onCancel={onCancel}
            onSave={onSave}
            t={t}
          />
        </div>
      ) : (
        <button type="button" className="adl-search-engine-popover__add-btn" onClick={onStartAdd}>
          <IconGlobePlus size={14} decorative />
          <span>{t.browserSearchEngineAdd}</span>
        </button>
      )}
    </>
  );
}

interface SearchEngineFormProps {
  formData: FormData;
  urlError: boolean;
  onFormDataChange: (data: FormData) => void;
  onCancel: () => void;
  onSave: () => void;
  t: Record<string, string>;
}

function SearchEngineForm({
  formData,
  urlError,
  onFormDataChange,
  onCancel,
  onSave,
  t,
}: SearchEngineFormProps) {
  return (
    <div className="adl-search-engine-popover__form">
      <div className="adl-search-engine-popover__field">
        <label className="adl-search-engine-popover__label">{t.browserSearchEngineName}</label>
        <input
          type="text"
          className="adl-search-engine-popover__input"
          placeholder={t.browserSearchEngineName}
          value={formData.name}
          onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="adl-search-engine-popover__field">
        <label className="adl-search-engine-popover__label">{t.browserSearchEngineUrl}</label>
        <input
          type="text"
          className={`adl-search-engine-popover__input${urlError ? ' is-error' : ''}`}
          placeholder={t.browserSearchEngineUrl}
          value={formData.urlTemplate}
          onChange={(e) => {
            onFormDataChange({ ...formData, urlTemplate: e.target.value });
          }}
        />
      </div>
      {urlError && (
        <div className="adl-search-engine-popover__error">{t.browserSearchEngineUrlRequired}</div>
      )}
      <div className="adl-search-engine-popover__form-actions">
        <button type="button" className="adl-search-engine-popover__btn-cancel" onClick={onCancel}>
          {t.browserSearchEngineCancel}
        </button>
        <button type="button" className="adl-search-engine-popover__btn-save" onClick={onSave}>
          {t.browserSearchEngineSave}
        </button>
      </div>
    </div>
  );
}
