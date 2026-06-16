"use client";

import * as FlagIcons from "country-flag-icons/react/3x2";
import type { ComponentType, SVGProps } from "react";
import styles from "./Flag.module.css";

type SvgFlagProps = SVGProps<SVGSVGElement>;
const FLAGS = FlagIcons as Record<string, ComponentType<SvgFlagProps>>;

type FlagProps = {
  code: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
};

const SIZES = {
  sm: { w: 22, h: 15 },
  md: { w: 28, h: 19 },
  lg: { w: 36, h: 24 },
  xl: { w: 52, h: 35 },
};

export default function Flag({ code, className, size = "md" }: FlagProps) {
  const FlagSvg = FLAGS[code];
  if (!FlagSvg) {
    return (
      <span className={`${styles.fallback} ${className ?? ""}`} aria-hidden>
        {code.slice(0, 2)}
      </span>
    );
  }

  const { w, h } = SIZES[size];
  return (
    <FlagSvg
      className={`${styles.flag} ${className ?? ""}`}
      width={w}
      height={h}
    />
  );
}
