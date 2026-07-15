"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ComposedChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  aspectRatio?: string;
  className?: string;
  children: ReactNode;
}

export function ComposedChart({
  className,
  aspectRatio = "2 / 1",
  children,
}: ComposedChartProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ aspectRatio, touchAction: "none" }}
    >
      {children}
      <p className="text-muted-foreground text-xs">
        ComposedChart — install via shadcn CLI when network available
      </p>
    </div>
  );
}

ComposedChart.displayName = "ComposedChart";

export default ComposedChart;
