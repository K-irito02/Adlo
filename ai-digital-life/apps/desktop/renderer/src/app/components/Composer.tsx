import React, { useCallback } from "react";
import { ContextBuilder, type ContextBuilderProps } from "./ContextBuilder";
import { PromptInput, type PromptInputProps } from "./PromptInput";
import { ActionButton, type ActionButtonProps } from "./ActionButton";

interface ComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  actionState: ActionButtonProps["state"];
  hasContent: boolean;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  placeholder?: string;
  disabled?: boolean;
  activeContexts?: ContextBuilderProps["activeContexts"];
  onAddContext?: ContextBuilderProps["onAddContext"];
  attachments?: PromptInputProps["attachments"];
  onRemoveAttachment?: PromptInputProps["onRemoveAttachment"];
}

export function Composer({
  input,
  onInputChange,
  onSubmit,
  actionState,
  hasContent,
  onSend,
  onStop,
  onRetry,
  placeholder,
  disabled = false,
  activeContexts = [],
  onAddContext,
  attachments,
  onRemoveAttachment
}: ComposerProps) {
  const handleContextAdd = useCallback(
    (type: string) => {
      onAddContext?.(type);
    },
    [onAddContext]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      onInputChange(value);
    },
    [onInputChange]
  );

  return (
    <div className="composer">
      <div className="composer__inner">
        <div className="composer__left">
          <ContextBuilder
            onAddContext={handleContextAdd}
            activeContexts={activeContexts}
          />
        </div>

        <div className="composer__center">
          <PromptInput
            value={input}
            onChange={handleInputChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            disabled={disabled}
            attachments={attachments}
            onRemoveAttachment={onRemoveAttachment}
          />
        </div>

        <div className="composer__right">
          <ActionButton
            state={actionState}
            hasContent={hasContent}
            onSend={onSend}
            onStop={onStop}
            onRetry={onRetry}
          />
        </div>
      </div>
    </div>
  );
}

export default Composer;
export type { ComposerProps };
