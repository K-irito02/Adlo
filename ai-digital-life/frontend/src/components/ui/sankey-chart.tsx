"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SankeyNodeDatum {
  name: string;
  category?: string;
  [key: string]: unknown;
}

export interface SankeyLinkDatum {
  source: number;
  target: number;
  value: number;
  [key: string]: unknown;
}

export interface SankeyData {
  nodes: SankeyNodeDatum[];
  links: SankeyLinkDatum[];
}

export interface SankeyChartProps {
  data: SankeyData;
  aspectRatio?: string;
  className?: string;
  children: ReactNode;
}

export function SankeyChart({
  className,
  aspectRatio = "2 / 1",
  children,
}: SankeyChartProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ aspectRatio, touchAction: "none" }}
    >
      {children}
      <p className="text-muted-foreground text-xs">
        SankeyChart — install via shadcn CLI when network available
      </p>
    </div>
  );
}

SankeyChart.displayName = "SankeyChart";

export default SankeyChart;
