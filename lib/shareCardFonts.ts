import path from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";

let fontsRegistered = false;

/** Registers bundled Inter / Syne / Outfit faces for server-side canvas renders. */
export function registerShareCardFonts(): void {
  if (fontsRegistered) return;
  const dir = path.join(process.cwd(), "assets", "share-card-fonts");
  const reg = (file: string, family: string) => {
    try {
      GlobalFonts.registerFromPath(path.join(dir, file), family);
    } catch {
      /* fall back to default sans if a face is missing */
    }
  };
  reg("inter-latin-600-normal.woff2", "Inter");
  reg("inter-latin-700-normal.woff2", "Inter");
  reg("inter-latin-800-normal.woff2", "Inter");
  reg("syne-latin-800-normal.woff2", "Syne");
  reg("outfit-latin-600-normal.woff2", "Outfit");
  fontsRegistered = true;
}
