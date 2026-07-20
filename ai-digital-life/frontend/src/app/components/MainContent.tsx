import { useCallback } from 'react';
import { WelcomeState, type WelcomeStateProps } from './WelcomeState';
import { MessageStream, type MessageStreamProps } from './MessageStream';
import { Composer, type ComposerProps } from './Composer';
import { useTCopy } from '../i18n/useTCopy';

interface MainContentProps {
  hasWorkspace: boolean;
  hasActiveSession: boolean;
  messages: MessageStreamProps['messages'];
  streamingText?: string;
  isStreaming: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  actionState: ComposerProps['actionState'];
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  recentWorkspaces?: WelcomeStateProps['recentWorkspaces'];
  onOpenWorkspace: () => void;
  onSelectRecentWorkspace: WelcomeStateProps['onSelectRecentWorkspace'];
  onSuggestion?: WelcomeStateProps['onSuggestion'];
  activeContexts?: ComposerProps['activeContexts'];
  onAddContext?: ComposerProps['onAddContext'];
  attachments?: ComposerProps['attachments'];
  onRemoveAttachment?: ComposerProps['onRemoveAttachment'];
}

export function MainContent({
  hasWorkspace,
  hasActiveSession,
  messages,
  streamingText = '',
  isStreaming,
  input,
  onInputChange,
  onSubmit,
  actionState,
  onSend,
  onStop,
  onRetry,
  recentWorkspaces = [],
  onOpenWorkspace,
  onSelectRecentWorkspace,
  onSuggestion,
  activeContexts = [],
  onAddContext,
  attachments,
  onRemoveAttachment,
}: MainContentProps) {
  const { t } = useTCopy();
  const handleSuggestionClick = useCallback(
    (text: string) => {
      onSuggestion?.(text);
    },
    [onSuggestion],
  );

  const handleSend = useCallback(() => {
    if (input.trim()) {
      onSend();
    }
  }, [input, onSend]);

  const hasContent = input.trim().length > 0;

  if (!hasWorkspace) {
    return (
      <main className="main-content" role="main" aria-label={t.mainContentAria}>
        <WelcomeState
          variant="no-workspace"
          recentWorkspaces={recentWorkspaces}
          onOpenWorkspace={onOpenWorkspace}
          onSelectRecentWorkspace={onSelectRecentWorkspace}
        />
      </main>
    );
  }

  if (!hasActiveSession) {
    return (
      <main className="main-content" role="main" aria-label={t.mainContentAria}>
        <div className="main-content__body">
          <WelcomeState
            variant="no-session"
            onSuggestion={handleSuggestionClick}
            onOpenWorkspace={onOpenWorkspace}
            onSelectRecentWorkspace={onSelectRecentWorkspace}
            recentWorkspaces={recentWorkspaces}
          />
        </div>
        <Composer
          input={input}
          onInputChange={onInputChange}
          onSubmit={onSubmit}
          actionState={actionState}
          hasContent={hasContent}
          onSend={handleSend}
          onStop={onStop}
          onRetry={onRetry}
          placeholder={t.mainInputPlaceholder}
          activeContexts={activeContexts}
          onAddContext={onAddContext}
          attachments={attachments}
          onRemoveAttachment={onRemoveAttachment}
        />
      </main>
    );
  }

  return (
    <main className="main-content" role="main" aria-label={t.mainContentAria}>
      <div className="main-content__body">
        <MessageStream
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
      </div>

      <Composer
        input={input}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        actionState={actionState}
        hasContent={hasContent}
        onSend={handleSend}
        onStop={onStop}
        onRetry={onRetry}
        placeholder={t.mainInputPlaceholderWithFile}
        activeContexts={activeContexts}
        onAddContext={onAddContext}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />
    </main>
  );
}

export default MainContent;
export type { MainContentProps };
