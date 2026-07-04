/**
 * One-off probe: does GET /api/scores/stat-validation work on our TxLINE tier?
 * Run: npx tsx scripts/probe-proof.ts
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

import {
  FIXTURES,
  fixtureDateTime,
  getFixtureById,
} from "../app/data/fixtures";
import { getSupabaseAdminClient } from "../app/lib/supabase";
import { PINNED_FIXTURE_IDS } from "../lib/pinnedBoardFixtures";
import {
  fetchFixturesSnapshot,
  fetchScoreProof,
  fetchScoresSnapshot,
  getTxoddsOrigin,
  getTxoddsToken,
  isTxoddsConfigured,
  resolveTxFixture,
  terminalScoreEventSeq,
  type FetchScoreProofResult,
  type TxScoreProofPayload,
} from "../lib/txodds";

type Candidate = {
  txFixtureId: number;
  source: string;
};

function jwtExpiryMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    );
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

let guestJwt: { token: string; expiresAtMs: number } | null = null;

async function getGuestJwt(): Promise<string> {
  const now = Date.now();
  if (guestJwt && guestJwt.expiresAtMs - 60_000 > now) return guestJwt.token;

  const res = await fetch(`${getTxoddsOrigin()}/auth/guest/start`, { method: "POST" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Guest auth failed: ${res.status} ${text.slice(0, 200)}`);
  }

  let token = text.trim().replace(/^"|"$/g, "");
  try {
    const parsed = JSON.parse(text);
    token = parsed.token || parsed.jwt || parsed.accessToken || token;
  } catch {
    // plain-text token
  }

  const exp = jwtExpiryMs(token);
  guestJwt = { token, expiresAtMs: exp || now + 30 * 60_000 };
  return token;
}

async function rawStatValidationHttp(
  txFixtureId: number,
  seq: number,
): Promise<{ status: number; body: string }> {
  const apiToken = getTxoddsToken();
  if (!apiToken) throw new Error("TXODDS_API_TOKEN is not configured");

  const jwt = await getGuestJwt();
  const url = new URL(`${getTxoddsOrigin()}/api/scores/stat-validation`);
  url.searchParams.set("fixtureId", String(txFixtureId));
  url.searchParams.set("seq", String(seq));
  url.searchParams.set("statKeys", "1,2");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
    },
    cache: "no-store",
  });

  return { status: res.status, body: await res.text() };
}

function statsFromProof(proof: TxScoreProofPayload): string {
  const v2 = proof as { statsToProve?: Array<{ key: number; value: number; period: number }> };
  if (Array.isArray(v2.statsToProve) && v2.statsToProve.length > 0) {
    return v2.statsToProve
      .map((s) => `key ${s.key}=${s.value} period ${s.period}`)
      .join(", ");
  }
  const legacy = proof as {
    statToProve?: { key: number; value: number };
    statToProve2?: { key: number; value: number };
  };
  const parts: string[] = [];
  if (legacy.statToProve) {
    parts.push(`key ${legacy.statToProve.key}=${legacy.statToProve.value}`);
  }
  if (legacy.statToProve2) {
    parts.push(`key ${legacy.statToProve2.key}=${legacy.statToProve2.value}`);
  }
  return parts.join(", ") || "(none listed)";
}

function printResult(input: {
  txFixtureId: number;
  source: string;
  seq: number | null;
  httpStatus: number | null;
  httpBody: string | null;
  fetchResult: FetchScoreProofResult;
}): void {
  console.log(`\n--- txFixtureId=${input.txFixtureId} (${input.source}) ---`);
  console.log(`seq: ${input.seq ?? "n/a"}`);

  if (input.httpStatus != null) {
    console.log(`HTTP status: ${input.httpStatus}`);
  } else {
    console.log("HTTP status: (not called — no terminal seq in scores snapshot)");
  }

  const { fetchResult } = input;
  if (fetchResult.status === "ok") {
    console.log("outcome: PROOF_RECEIVED");
    console.log(`  proofMode: ${fetchResult.proofMode}`);
    console.log(`  statKeys: ${fetchResult.statKeys.join(",")}`);
    console.log(`  ts: ${fetchResult.proof.ts}`);
    console.log(`  eventStatRoot: ${fetchResult.proof.eventStatRoot}`);
    console.log(`  stats proved: ${statsFromProof(fetchResult.proof)}`);
    return;
  }

  if (fetchResult.status === "not_yet_available") {
    console.log("outcome: NOT_YET_AVAILABLE");
    console.log(`  reason: ${fetchResult.reason}`);
    if (input.httpBody) {
      console.log(`  body: ${input.httpBody.slice(0, 2400)}`);
    }
    return;
  }

  console.log("outcome: ERROR");
  console.log(`  message: ${fetchResult.message}`);
  if (input.httpBody) {
    console.log(`  body: ${input.httpBody.slice(0, 400)}`);
  }
}

async function discoverCandidates(): Promise<Candidate[]> {
  const seen = new Set<number>();
  const out: Candidate[] = [];

  const add = (txFixtureId: number, source: string) => {
    if (!Number.isFinite(txFixtureId) || txFixtureId <= 0 || seen.has(txFixtureId)) {
      return;
    }
    seen.add(txFixtureId);
    out.push({ txFixtureId, source });
  };

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdminClient();

      const { data: proofs } = await supabase
        .from("match_proofs")
        .select("tx_fixture_id, fixture_id")
        .limit(5);
      for (const row of proofs ?? []) {
        add(Number(row.tx_fixture_id), `match_proofs(mundial=${row.fixture_id})`);
      }

      const { data: scored } = await supabase
        .from("match_state")
        .select("match_id, final_home_score, final_away_score")
        .not("scored_at", "is", null)
        .order("scored_at", { ascending: false })
        .limit(8);

      for (const row of scored ?? []) {
        const fixture = getFixtureById(Number(row.match_id));
        if (!fixture) continue;
        const kickoffMs = fixtureDateTime(fixture).getTime();
        const tx = await resolveTxFixture(fixture.home, fixture.away, kickoffMs);
        if (tx) {
          add(
            tx.FixtureId,
            `match_state scored match_id=${row.match_id} (${fixture.home} vs ${fixture.away}, ${row.final_home_score}-${row.final_away_score})`,
          );
        }
      }
    } catch (error) {
      console.warn(
        "Supabase discovery skipped:",
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.warn("Supabase env missing — skipping match_state / match_proofs discovery");
  }

  for (const id of PINNED_FIXTURE_IDS) {
    add(id, "pinnedBoardFixtures");
  }

  try {
    const snapshot = await fetchFixturesSnapshot({ fresh: true });
    const finished = snapshot.filter(
      (fx) => fx.GameState === 5 || fx.GameState === 10 || fx.GameState === 13,
    );
    for (const fx of finished.slice(0, 5)) {
      const home = fx.Participant1IsHome ? fx.Participant1 : fx.Participant2;
      const away = fx.Participant1IsHome ? fx.Participant2 : fx.Participant1;
      add(
        fx.FixtureId,
        `fixtures/snapshot GameState=${fx.GameState} (${home} vs ${away})`,
      );
    }

    // Historical replay: any snapshot fixture whose scores feed has a terminal event.
    for (const fx of snapshot.slice(0, 40)) {
      if (seen.has(fx.FixtureId)) continue;
      const events = await fetchScoresSnapshot(fx.FixtureId);
      const seq = terminalScoreEventSeq(events);
      if (seq == null) continue;
      const home = fx.Participant1IsHome ? fx.Participant1 : fx.Participant2;
      const away = fx.Participant1IsHome ? fx.Participant2 : fx.Participant1;
      add(
        fx.FixtureId,
        `scores/snapshot terminal seq=${seq} (${home} vs ${away})`,
      );
      if (out.length >= 5) break;
    }
  } catch (error) {
    console.warn(
      "Fixtures snapshot discovery failed:",
      error instanceof Error ? error.message : error,
    );
  }

  if (out.length === 0) {
    console.warn(`No candidates discovered; FIXTURES count=${FIXTURES.length}`);
  }

  return out.slice(0, 3);
}

async function probeCandidate(candidate: Candidate): Promise<void> {
  const events = await fetchScoresSnapshot(candidate.txFixtureId);
  const seq = terminalScoreEventSeq(events);

  let httpStatus: number | null = null;
  let httpBody: string | null = null;

  if (seq != null) {
    ({ status: httpStatus, body: httpBody } = await rawStatValidationHttp(
      candidate.txFixtureId,
      seq,
    ));
  }

  const fetchResult = await fetchScoreProof(candidate.txFixtureId);

  printResult({
    txFixtureId: candidate.txFixtureId,
    source: candidate.source,
    seq,
    httpStatus,
    httpBody,
    fetchResult,
  });
}

async function main(): Promise<void> {
  console.log("TxLINE score-proof tier probe");
  console.log(`origin: ${getTxoddsOrigin()}`);
  console.log(`token configured: ${isTxoddsConfigured()}`);

  if (!isTxoddsConfigured()) {
    console.error("TXODDS_API_TOKEN missing — set in .env.local or txodds/api-token.txt");
    process.exit(1);
  }

  const candidates = await discoverCandidates();
  console.log(`\nCandidates (${candidates.length}):`);
  for (const c of candidates) {
    console.log(`  ${c.txFixtureId} ← ${c.source}`);
  }

  if (candidates.length === 0) {
    process.exit(1);
  }

  for (const candidate of candidates) {
    await probeCandidate(candidate);
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
