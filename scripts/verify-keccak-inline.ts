import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const R = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const PI = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];
const MASK = (1n << 64n) - 1n;
const rotl = (x: bigint, n: number) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;

function keccakF(s: bigint[]) {
  for (let round = 0; round < 24; round++) {
    const C = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) C[x] = s[x]! ^ s[x + 5]! ^ s[x + 10]! ^ s[x + 15]! ^ s[x + 20]!;
    const D = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5]! ^ rotl(C[(x + 1) % 5]!, 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y]! ^= D[x]!;
    let last = s[1]!;
    for (let i = 0; i < 24; i++) {
      const j = PI[i]!;
      const tmp = s[j]!;
      s[j] = rotl(last, R[i + 1]!);
      last = tmp;
    }
    for (let y = 0; y < 5; y++) {
      const T = [s[5 * y]!, s[5 * y + 1]!, s[5 * y + 2]!, s[5 * y + 3]!, s[5 * y + 4]!];
      for (let x = 0; x < 5; x++) s[5 * y + x] = T[x]! ^ ((~T[(x + 1) % 5]! & MASK) & T[(x + 2) % 5]!);
    }
    s[0]! ^= RC[round]!;
  }
}

function keccak256(data: Uint8Array): Buffer {
  const rate = 136;
  const s = new Array<bigint>(25).fill(0n);
  const msg = Buffer.from(data);
  const totalLen = Math.ceil((msg.length + 1) / rate) * rate;
  const padded = Buffer.alloc(totalLen, 0);
  msg.copy(padded, 0);
  padded[msg.length] = 0x01;
  padded[totalLen - 1] ^= 0x80;
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 0; j < 8; j++) lane |= BigInt(padded[off + i * 8 + j]!) << BigInt(8 * j);
      s[i]! ^= lane;
    }
    keccakF(s);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) {
    let lane = s[i]!;
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

const programId = new PublicKey("4UZVuN3wBQWVZjwvVAR4mDobFgWJkwotkpXi6gyj6BD2");
const mint = new PublicKey("BjtWiAFKjrdvweA7Cer4MMWPRGNmpGGY9ixJwoZzfkFU");
const epoch = Buffer.alloc(8);
epoch.writeBigUInt64LE(1781469347n);
const recipient = PublicKey.default;
const amount = Buffer.alloc(8);
amount.writeBigUInt64LE(93_000_000n);
const voucher = Buffer.alloc(32, 1);

const preimage = Buffer.concat([
  programId.toBuffer(),
  mint.toBuffer(),
  epoch,
  recipient.toBuffer(),
  amount,
  voucher,
]);

const mine = keccak256(preimage);
const noble = Buffer.from(keccak_256(preimage));
console.log("preimage len", preimage.length);
console.log("mine  ", mine.toString("hex"));
console.log("noble ", noble.toString("hex"));
console.log("match ", mine.equals(noble));
