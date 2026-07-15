"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AreaChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  aspectRatio?: string;
  className?: string;
  children: ReactNode;
}

export function AreaChart({
  className,
  aspectRatio = "2 / 1",
  children,
}: AreaChartProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ aspectRatio, touchAction: "none" }}
    >
      {children}
      <p className="text-muted-foreground text-xs">
        AreaChart — install via shadcn CLI when network available
      </p>
    </div>
  );
}

AreaChart.displayName = "AreaChart";

export default AreaChart;
