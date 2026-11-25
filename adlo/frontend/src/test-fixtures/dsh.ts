import type { DshOpenResult, DshPortOccupiedInfo } from '../shared/ipc/dsh';

/**
 * `/dsh/open` 就绪夹具：与 `DshOpenResult` 同步，避免已删除字段
 * （如 freedPort / authenticated）在测试夹具里回潮；字段变化会在此处编译失败。
 */
export function dshOpened(url: string | null): DshOpenResult {
  return { status: 'opened', url };
}

/** `/dsh/open` 端口占用夹具。 */
export function dshPortOccupied(occupant: DshPortOccupiedInfo): DshOpenResult {
  return { status: 'port_occupied', url: null, occupant };
}
