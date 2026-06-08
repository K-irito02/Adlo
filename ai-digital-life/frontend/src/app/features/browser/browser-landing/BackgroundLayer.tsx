import type { BackgroundConfig } from '../../../stores/slices/browserSlice';
import './BackgroundLayer.css';

interface BackgroundLayerProps {
  config: BackgroundConfig;
}

export function BackgroundLayer({ config }: BackgroundLayerProps) {
  if (config.mode === 'default') {
    return <div className="adl-browser-landing-bg adl-browser-landing-bg--default" />;
  }

  if (config.mode === 'image' && config.filePath) {
    const fitClass =
      config.fit === 'contain'
        ? 'adl-browser-landing-bg--contain'
        : config.fit === 'repeat'
          ? 'adl-browser-landing-bg--repeat'
          : 'adl-browser-landing-bg--image';
    return (
      <div
        className={`adl-browser-landing-bg ${fitClass}`}
        style={{ backgroundImage: `url(${config.filePath})` }}
      />
    );
  }

  if (config.mode === 'video' && config.filePath) {
    return (
      <video
        className="adl-browser-landing-bg adl-browser-landing-bg--video"
        src={config.filePath}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }

  return <div className="adl-browser-landing-bg adl-browser-landing-bg--default" />;
}
