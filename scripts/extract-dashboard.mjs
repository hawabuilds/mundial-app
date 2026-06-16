import fs from "fs";

const html = fs.readFileSync("guess-the-score-v2.html", "utf8");
const start = html.indexOf('<div class="screen" id="s-dash">');
const end = html.indexOf('<div class="screen" id="s-lb">', start);
const section = html.slice(start, end);

const preview = section.replace(/data:image[^"']+/g, "[B64]");
console.log(preview);

const navLogo = section.match(/class="nav-logo-img" src="([^"]+)"/);
const trophy = section.match(/class="cb-trophy-img" src="([^"]+)"/);

fs.mkdirSync("app/components/dashboard-assets", { recursive: true });
if (navLogo) {
  fs.writeFileSync(
    "app/components/dashboard-assets/nav-logo.ts",
    `export const NAV_LOGO_SRC = ${JSON.stringify(navLogo[1])};\n`,
  );
}
if (trophy) {
  fs.writeFileSync(
    "app/components/dashboard-assets/trophy.ts",
    `export const TROPHY_SRC = ${JSON.stringify(trophy[1])};\n`,
  );
}
console.log("\nWrote assets. nav:", navLogo?.[1]?.length, "trophy:", trophy?.[1]?.length);
