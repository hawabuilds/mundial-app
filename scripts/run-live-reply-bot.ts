import { config } from "dotenv";
config({ path: ".env.local" });

import { runLivePredictionReplyBot } from "@/lib/runLivePredictionReplyBot";

async function main() {
  const result = await runLivePredictionReplyBot();
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
