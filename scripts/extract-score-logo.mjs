import fs from "fs";

const src = fs.readFileSync("app/components/landing-assets/logo.ts", "utf8");
const match = src.match(/export const LAND_LOGO_SRC = "([^"]+)"/);
if (!match) throw new Error("LAND_LOGO_SRC not found");

const dataUrl = match[1];
const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/score-logo.png", Buffer.from(b64, "base64"));
console.log("wrote public/score-logo.png", fs.statSync("public/score-logo.png").size, "bytes");
