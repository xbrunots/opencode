import { cn } from "cn";
import type { CSSProperties } from "react";

import type { ShimmerProps } from "../types/shimmer";

export const Shimmer = ({
  className,
  duration = 1.7,
  paused = false,
  spread = 4,
  style,
  ...props
}: ShimmerProps) => (
  <span
    className={cn(
      "animate-status-pulse inline-block motion-reduce:animate-none",
      paused && "animate-none",
      className
    )}
    data-slot="shimmer"
    style={
      {
        "--status-pulse-duration": `${duration}s`,
        "--shimmer-spread": `${spread}ch`,
        ...style,
      } as CSSProperties
    }
    {...props}
  />
);
