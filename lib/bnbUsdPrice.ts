const BINANCE_TICKER_URL =
  "https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT";
const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const FETCH_TIMEOUT_MS = 8_000;

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`BNB price request failed (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseUsdPrice(raw: unknown): number {
  const price =
    typeof raw === "object" &&
    raw !== null &&
    "price" in raw &&
    typeof (raw as { price: unknown }).price === "string"
      ? Number((raw as { price: string }).price)
      : NaN;

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid BNB/USD price from Binance");
  }

  return price;
}

/** Spot BNB/USD at request time (Binance BNBUSDT). */
export async function fetchBnbUsdPrice(): Promise<number> {
  const data = await fetchJsonWithTimeout(BINANCE_TICKER_URL);
  return parseUsdPrice(data);
}

/** BNB/USD close for the 1m candle that contains `at` (for backfill). */
export async function fetchBnbUsdPriceAtTime(at: Date): Promise<number> {
  const startTime = at.getTime();
  const url = `${BINANCE_KLINES_URL}?symbol=BNBUSDT&interval=1m&startTime=${startTime}&limit=1`;
  const data = await fetchJsonWithTimeout(url);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No BNB/USD kline for snapshot time");
  }

  const candle = data[0];
  if (!Array.isArray(candle) || typeof candle[4] !== "string") {
    throw new Error("Unexpected Binance kline shape");
  }

  const price = Number(candle[4]);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid BNB/USD kline close price");
  }

  return price;
}
