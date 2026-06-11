import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  attachments?: Array<{ name: string; size: number; type: string }>;
  onRemoveAttachment?: (index: number) => void;
}

const MIN_HEIGHT = 48;
const MAX_HEIGHT = 200;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = '向 AI 助手提问...',
  disabled = false,
  attachments = [],
  onRemoveAttachment,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !disabled) {
          onSubmit();
        }
      }
    },
    [value, disabled, onSubmit]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const charCount = value.length;

  return (
    <div
      ref={containerRef}
      className={`prompt-input${isDragOver ? ' prompt-input--dragover' : ''}${disabled ? ' prompt-input--disabled' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="prompt-input__attachments">
          {attachments.map((attachment, index) => (
            <span key={`${attachment.name}-${index}`} className="prompt-input__attachment-chip">
              <Icon name="file-text" size="xs" />
              <span className="prompt-input__attachment-name">{attachment.name}</span>
              <span className="prompt-input__attachment-size">
                {formatFileSize(attachment.size)}
              </span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  className="prompt-input__attachment-remove"
                  onClick={() => onRemoveAttachment(index)}
                  aria-label={`移除 ${attachment.name}`}
                >
                  <Icon name="close" size="xs" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="prompt-input__textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
        aria-label="消息输入框"
        data-testid="prompt-input"
      />

      {isDragOver && (
        <div className="prompt-input__drop-overlay">
          <Icon name="upload" size="lg" />
          <span>释放以添加附件</span>
        </div>
      )}

      {charCount > 0 && (
        <span className="prompt-input__char-count" aria-label={`${charCount} 个字符`}>
          {charCount}
        </span>
      )}
    </div>
  );
}

export default PromptInput;
export type { PromptInputProps };
