"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SunburstNode {
  name: string;
  value?: number;
  color?: string;
  children?: SunburstNode[];
}

export interface SunburstChartProps {
  data: SunburstNode;
  size?: number;
  className?: string;
  children: ReactNode;
}

export function SunburstChart({
  className,
  size = 520,
  children,
}: SunburstChartProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ maxWidth: size, touchAction: "none" }}
    >
      {children}
      <p className="text-muted-foreground text-xs">
        SunburstChart — install via shadcn CLI when network available
      </p>
    </div>
  );
}

SunburstChart.displayName = "SunburstChart";

export default SunburstChart;
