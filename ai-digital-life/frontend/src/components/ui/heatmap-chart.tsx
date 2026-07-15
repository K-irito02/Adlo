"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HeatmapColumn {
  bin: number;
  bins: { count: number; bin: number; date: Date }[];
}

export interface HeatmapChartProps {
  data: HeatmapColumn[];
  aspectRatio?: string;
  className?: string;
  children: ReactNode;
}

export function HeatmapChart({
  className,
  aspectRatio = "2 / 1",
  children,
}: HeatmapChartProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ aspectRatio, touchAction: "none" }}
    >
      {children}
      <p className="text-muted-foreground text-xs">
        HeatmapChart — install via shadcn CLI when network available
      </p>
    </div>
  );
}

HeatmapChart.displayName = "HeatmapChart";

export default HeatmapChart;
