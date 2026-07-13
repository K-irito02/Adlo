import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '../stores/slicedStore';
import FlowFieldBackground from './flow-field-background';

type ResolvedTheme = 'light' | 'dark';

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function getThemeFromRoot(): ResolvedTheme {
  if (typeof document !== 'undefined') {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark' || t === 'light') {
      return t;
    }
  }
  return getSystemTheme();
}

function getDisplayText(language: string): string {
  if (language.startsWith('zh')) {
    return '可燃';
  }
  return 'Kora';
}

const THEME_COLORS: Record<
  ResolvedTheme,
  { bgHex: string; trail: string; particle: string; stroke: string }
> = {
  dark: { bgHex: '#000', trail: '0, 0, 0', particle: '#818cf8', stroke: '#c7d2fe' },
  light: { bgHex: '#fff', trail: '255, 255, 255', particle: '#4f46e5', stroke: '#3730a3' },
};

export default function StartupOverlay() {
  const [theme, setTheme] = useState<ResolvedTheme>(getThemeFromRoot);
  const storeLanguage = useAppStore((s) => s.appInfo?.config.language);
  const displayLang = useMemo(
    () => storeLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : 'en'),
    [storeLanguage]
  );
  const displayText = useMemo(() => getDisplayText(displayLang), [displayLang]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setTheme(getThemeFromRoot());
    mq.addEventListener('change', handleChange);

    const observer = new MutationObserver(() => {
      setTheme(getThemeFromRoot());
    });
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });

    return () => {
      mq.removeEventListener('change', handleChange);
      observer.disconnect();
    };
  }, []);

  const colors = THEME_COLORS[theme];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: colors.bgHex }}>
      <FlowFieldBackground
        particleCount={600}
        color={colors.particle}
        trailOpacity={0.15}
        trailColor={colors.trail}
        bgColor={colors.bgHex}
        speed={1}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <svg viewBox="0 0 500 120" style={{ width: '320px', maxWidth: '80vw' }} aria-hidden="true">
          <motion.text
            x="250"
            y="60"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="80"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
            fill="none"
            stroke={colors.stroke}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={5000}
            initial={{ strokeDashoffset: 5000 }}
            animate={{ strokeDashoffset: [5000, 0, -5000] }}
            transition={{
              duration: 3,
              ease: [0.42, 0, 0.58, 1],
              repeat: Infinity,
            }}
          >
            {displayText}
          </motion.text>
        </svg>
      </div>
    </div>
  );
}
