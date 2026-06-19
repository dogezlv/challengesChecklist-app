import { createHash, randomBytes } from "crypto";

export type RaffleEntry = {
  userId: string;
  login?: string | null;
  displayName?: string | null;
  points: number;
};

/** Seeded PRNG (mulberry32) for reproducible weighted picks. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed: string): number {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return parseInt(hex, 16);
}

export function weightedPick(entries: RaffleEntry[], seed: string): RaffleEntry | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e.points, 0);
  if (total <= 0) {
    const rng = mulberry32(seedToInt(seed));
    return entries[Math.floor(rng() * entries.length)] ?? null;
  }
  const rng = mulberry32(seedToInt(seed));
  let r = rng() * total;
  for (const e of entries) {
    r -= e.points;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1] ?? null;
}

export function newRaffleSeed(): string {
  return randomBytes(16).toString("hex");
}
