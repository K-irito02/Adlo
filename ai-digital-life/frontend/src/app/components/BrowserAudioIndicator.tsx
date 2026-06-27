import React from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { IconVolume2, IconVolumeX } from '../icons';
import { TooltipSimple } from './Tooltip';

interface BrowserAudioIndicatorProps {
  isPlaying: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function BrowserAudioIndicator({
  isPlaying,
  isMuted,
  onToggleMute,
}: BrowserAudioIndicatorProps) {
  const { t } = useTCopy();

  if (!isPlaying && !isMuted) {
    return null;
  }

  return (
    <TooltipSimple content={isMuted ? t.browserUnmute : t.browserMute} placement="top">
      <button
        type="button"
        className={`adl-icon-btn adl-icon-btn--xs adl-browser-audio-indicator${isPlaying && !isMuted ? ' is-animating' : ''}${isMuted ? ' is-muted' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute();
        }}
        aria-label={isMuted ? t.browserUnmute : t.browserMute}
      >
        {isMuted ? <IconVolumeX size={12} decorative /> : <IconVolume2 size={12} decorative />}
      </button>
    </TooltipSimple>
  );
}
