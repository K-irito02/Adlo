import { useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '../stores/slicedStore';
import { systemPrefersDark, type ResolvedTheme } from '../../design-system';
import FlowFieldBackground from './flow-field-background';
import LogoSvg from './LogoSvg';

function getThemeFromRoot(): ResolvedTheme {
  if (typeof document !== 'undefined') {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark' || t === 'light') {
      return t;
    }
  }
  return systemPrefersDark() ? 'dark' : 'light';
}

const THEME_COLORS: Record<
  ResolvedTheme,
  { bgHex: string; trail: string; particle: string; stroke: string }
> = {
  dark: { bgHex: '#000', trail: '0, 0, 0', particle: '#818cf8', stroke: '#fff' },
  light: { bgHex: '#fff', trail: '255, 255, 255', particle: '#000', stroke: '#000' },
};

export default function StartupOverlay() {
  const [theme, setTheme] = useState<ResolvedTheme>(getThemeFromRoot);
  const storeLanguage = useAppStore((s) => s.appInfo?.config.language);
  const displayLang = useMemo(
    () => storeLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : 'en'),
    [storeLanguage],
  );

  // 移除 index.html 中的静态预加载覆盖层，让 React 覆盖层接管
  useLayoutEffect(() => {
    const preload = document.getElementById('preload-overlay');
    if (preload) {
      preload.remove();
    }
  }, []);

  // 监听 data-theme 属性变化——ThemeController 是主题真源，
  // 系统主题变化时（themeMode === 'system'）ThemeController 会更新 data-theme，
  // 此处 MutationObserver 会捕获到变化并同步覆盖层主题。
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getThemeFromRoot());
    });
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => {
      observer.disconnect();
    };
  }, []);

  const colors = THEME_COLORS[theme];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-max)',
        backgroundColor: colors.bgHex,
        cursor: 'default',
      }}
    >
      <FlowFieldBackground
        particleCount={520}
        color={colors.particle}
        trailOpacity={0.1}
        trailColor={colors.trail}
        bgColor={colors.bgHex}
        speed={0.1}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <LogoSvg
            language={displayLang}
            color={colors.stroke}
            width={320}
            staggerDelay={0.15}
            drawDuration={3}
          />
        </motion.div>
      </div>
    </div>
  );
}
