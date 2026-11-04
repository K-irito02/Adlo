import type { ChangesTopToolbarProps } from './ChangesTopToolbar';
import { ChangesTopToolbar } from './ChangesTopToolbar';
import type { ChangesNavigatorToolbarProps } from './ChangesNavigatorToolbar';
import { ChangesNavigatorToolbar } from './ChangesNavigatorToolbar';

type ChangesTopVariant = ChangesTopToolbarProps & { placement: 'top' };
type ChangesNavigatorVariant = ChangesNavigatorToolbarProps & { placement: 'navigator' };

type ChangesToolbarProps = ChangesTopVariant | ChangesNavigatorVariant;

export function ChangesToolbar(props: ChangesToolbarProps) {
  if (props.placement === 'top') {
    const { placement: _placement, ...rest } = props;
    return <ChangesTopToolbar {...rest} />;
  }
  const { placement: _placement, ...rest } = props;
  return <ChangesNavigatorToolbar {...rest} />;
}
