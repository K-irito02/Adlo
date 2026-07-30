export interface BrushSelection {
  start: Date;
  end: Date;
}

export interface BrushLayoutRenderProps {
  xDomain: [Date, Date] | undefined;
  xDomainSlotCount: number | undefined;
  brushSelection: BrushSelection | null;
  onBrushSelectionChange: (selection: BrushSelection | null) => void;
}
