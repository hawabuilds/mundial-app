const USDC_DECIMALS = 6;
const USDC_BASE = 10n ** BigInt(USDC_DECIMALS);

export function parseUsdcToBaseUnits(amount: string | number): bigint {
  const raw = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  const [whole, fraction = ""] = raw.split(".");
  const frac = `${fraction}000000`.slice(0, USDC_DECIMALS);
  return BigInt(whole) * USDC_BASE + BigInt(frac);
}

/** USDC has 6 decimals; 1 cent = 10_000 base units. */
export function potUsdCentsFromUsdcBaseUnits(baseUnits: bigint): number {
  if (baseUnits <= 0n) {
    throw new Error("Cannot compute pot USD from non-positive USDC amount");
  }
  return Math.round(Number(baseUnits) / 10_000);
}

export function formatUsdcFromBaseUnits(
  baseUnits: bigint,
  options?: { maxFractionDigits?: number },
): string {
  const maxFractionDigits = options?.maxFractionDigits ?? USDC_DECIMALS;
  const negative = baseUnits < 0n;
  const abs = negative ? -baseUnits : baseUnits;
  const whole = abs / USDC_BASE;
  const fraction = abs % USDC_BASE;
  let fracStr = fraction.toString().padStart(USDC_DECIMALS, "0");
  if (maxFractionDigits < USDC_DECIMALS) {
    fracStr = fracStr.slice(0, maxFractionDigits);
  } else {
    fracStr = fracStr.replace(/0+$/, "");
  }
  const formatted = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}
