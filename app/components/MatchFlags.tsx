"use client";

import * as FlagIcons from "country-flag-icons/react/3x2";
import type { ComponentType, SVGProps } from "react";
import { getTeamCountryCode, type CountryCode } from "../data/fixtures";

type FlagProps = {
  className?: string;
  width?: number;
  height?: number;
};

type SvgFlagProps = SVGProps<SVGSVGElement>;

const FLAGS = FlagIcons as Record<string, ComponentType<SvgFlagProps>>;

export function CountryFlag({
  code,
  className,
  width = 24,
  height = 16,
}: FlagProps & { code: CountryCode }) {
  const Flag = FLAGS[code];
  if (!Flag) return null;

  return <Flag className={className} width={width} height={height} />;
}

export function TeamFlag({
  team,
  ...props
}: FlagProps & { team: string }) {
  const code = getTeamCountryCode(team);
  if (!code) return null;

  return <CountryFlag code={code} {...props} />;
}
