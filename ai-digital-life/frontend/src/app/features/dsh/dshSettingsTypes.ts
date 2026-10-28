import type { useAppActions } from '@hooks/useAppActions';

/** DSH 设置组使用的 action 面（与 `useAppActions()` 同源，避免两处手抄）。 */
export type DshSettingsActions = ReturnType<typeof useAppActions>;
