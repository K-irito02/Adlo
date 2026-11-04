import { lazy, Suspense } from 'react';
import { AnimatePresence } from 'motion/react';
import StartupOverlay from './StartupOverlay';

// Lazy-load motion.div so the bulk of motion/react (~30-50KB) is deferred
// to a separate chunk. AnimatePresence stays static because it must be
// mounted before the child to track exit animations. Tree-shaking may
// still split `motion` (the larger part) into the lazy chunk.
const MotionDiv = lazy(() => import('motion/react').then((m) => ({ default: m.motion.div })));

interface StartupOverlayWrapperProps {
  visible: boolean;
}

export function StartupOverlayWrapper({ visible }: StartupOverlayWrapperProps) {
  return (
    <AnimatePresence>
      {visible && (
        <Suspense fallback={null}>
          <MotionDiv
            key="startup-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartupOverlay />
          </MotionDiv>
        </Suspense>
      )}
    </AnimatePresence>
  );
}
