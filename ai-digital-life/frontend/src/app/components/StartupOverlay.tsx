import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
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

function getDisplayText(): string {
  if (typeof navigator !== 'undefined' && navigator.language.startsWith('zh')) {
    return '可燃';
  }
  return 'Kora';
}

const THEME_COLORS: Record<
  ResolvedTheme,
  { bg: string; trail: string; particle: string; stroke: string }
> = {
  dark: { bg: 'bg-black', trail: '0, 0, 0', particle: '#818cf8', stroke: '#c7d2fe' },
  light: { bg: 'bg-white', trail: '255, 255, 255', particle: '#4f46e5', stroke: '#3730a3' },
};

export default function StartupOverlay() {
  const [theme, setTheme] = useState<ResolvedTheme>(getThemeFromRoot);
  const displayText = useMemo(getDisplayText, []);

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
    <div className="fixed inset-0 z-9999">
      <FlowFieldBackground
        particleCount={600}
        color={colors.particle}
        trailOpacity={0.15}
        trailColor={colors.trail}
        speed={1}
        containerClass={colors.bg}
      />
      <div className="absolute inset-0 flex items-center justify-center select-none">
        <svg viewBox="0 0 500 120" className="w-80 max-w-[80vw]" aria-hidden="true">
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
