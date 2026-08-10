/* eslint-disable react-refresh/only-export-components */
import type { ComponentType } from 'react';
import type { MessageRecord, PartData, PartRecord } from '../../../kernel/types-part';

export interface PartRendererProps {
  message: MessageRecord;
  part: PartRecord;
  defaultOpen?: boolean;
}

export type PartComponent = ComponentType<PartRendererProps>;

export const PART_MAPPING: Record<string, PartComponent | undefined> = {};

export function registerPart(type: string, component: PartComponent): void {
  PART_MAPPING[type] = component;
}

const DEFAULT_PART: PartComponent = () => null;

export function PartRenderer({ message, part, defaultOpen }: PartRendererProps) {
  const data = part.data as PartData;
  const Comp = PART_MAPPING[data.type] ?? DEFAULT_PART;
  return <Comp message={message} part={part} defaultOpen={defaultOpen} />;
}
