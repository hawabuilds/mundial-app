/**
 * Capture 16:9 verified-badge X post PNG from /proof-preview-x.
 *
 *   npx tsx scripts/capture-verified-badge-x.ts
 *   npx tsx scripts/capture-verified-badge-x.ts --url http://127.0.0.1:3000/proof-preview-x
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const OUTPUT = join(process.cwd(), "docs/screenshots/verified-badge-arg-egy-x.png");
const WIDTH = 1600;
const HEIGHT = 900;
const SCALE = 2;

function parseUrlArg(): string {
  const idx = process.argv.indexOf("--url");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  return `http://127.0.0.1:${process.env.PORT ?? 3000}/mundial/proof-preview-x`;
}

const skipDev = process.argv.includes("--no-dev");

async function waitForServer(url: string, timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const targetUrl = parseUrlArg();
  const port = new URL(targetUrl).port || "3000";
  const local = targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost");
  let devProc: ReturnType<typeof spawn> | null = null;

  if (local && !skipDev) {
    devProc = spawn("npm", ["run", "dev", "--", "-p", port], {
      cwd: process.cwd(),
      shell: true,
      stdio: "pipe",
    });
    await waitForServer(targetUrl);
  }

  try {
    const { chromium } = await import("playwright");
    await mkdir(join(process.cwd(), "docs/screenshots"), { recursive: true });

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SCALE,
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("#proof-x-export", { timeout: 30_000 });
    await page.waitForTimeout(800);

    const root = page.locator("#proof-x-export");
    await root.screenshot({
      path: OUTPUT,
      type: "png",
      animations: "disabled",
    });

    await browser.close();
    console.log(JSON.stringify({ ok: true, output: OUTPUT, url: targetUrl, width: WIDTH, height: HEIGHT, scale: SCALE }));
  } finally {
    if (devProc?.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(devProc.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
      } else {
        process.kill(-devProc.pid!, "SIGTERM");
      }
    }
  }
}

void main();
