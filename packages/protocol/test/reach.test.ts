// D293: choosing a way to the home (race, keeper) with a fake clock and fake probes, and the
// signature check against a pinned fingerprint.
import { expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { challengeText, createKeeper, fpFromLink, kindOfUrl, pairFragment, race, ranked, type ReachWay } from "../src/reach.ts";
import { checkProof, fingerprint } from "../src/reach-verify.ts";

const ways: ReachWay[] = [
  { kind: "tunnel", url: "https://ducter.example.org" },
  { kind: "domain", url: "https://hel.example.com", primary: true },
  { kind: "tailnet", url: "https://hel.tail1234.ts.net" },
];

/** A fake clock: sleep resolves when advance() passes its time. */
function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    sleep: (ms: number) => new Promise<void>((r) => timers.push({ at: now + ms, fn: r })),
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift();
        now = t.at;
        t.fn();
        await new Promise((r) => setTimeout(r, 0));
      }
      now = end;
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

test("ways are tried nearest first: tailnet, then domain, then the tunnel", () => {
  expect(ranked(ways).map((w) => w.kind)).toEqual(["tailnet", "domain", "tunnel"]);
  expect(kindOfUrl("https://hel.tail1234.ts.net")).toBe("tailnet");
  expect(kindOfUrl("http://192.168.1.20:7777")).toBe("lan");
  expect(kindOfUrl("https://hel.example.com")).toBe("domain");
});

test("pairing links carry the fingerprint beside the code, and old parsers still find the code", () => {
  const link = `https://hel.example.com/pair#${pairFragment("K7QM-4XPA", "gm1dLQ73EMvSh8UG9N3FAA")}`;
  expect(link).toBe("https://hel.example.com/pair#c=K7QM-4XPA&k=gm1dLQ73EMvSh8UG9N3FAA");
  expect(fpFromLink(link)).toBe("gm1dLQ73EMvSh8UG9N3FAA");
  expect(/[#&?]c=([A-Za-z0-9-]+)/.exec(link)?.[1]).toBe("K7QM-4XPA"); // the 0.0.60 reading
  expect(fpFromLink("https://hel.example.com/pair#c=K7QM-4XPA")).toBeUndefined();
});

test("race: the best way that answers wins; a worse one waits out the grace for a better one still pending", async () => {
  const c = fakeClock();
  const answer = new Map<string, { at: number; ok: boolean }>([
    ["https://hel.tail1234.ts.net", { at: 900, ok: true }], // slow but best
    ["https://hel.example.com", { at: 300, ok: true }],
    ["https://ducter.example.org", { at: 100, ok: true }],
  ]);
  const probe = (u: string) => c.sleep(answer.get(u)!.at).then(() => answer.get(u)!.ok);
  // The domain answers at 550 (250 stagger + 300); the tailnet is still pending; its grace ends at 850 < 900.
  let got: string | undefined | null = null;
  void race(ways, { probe, sleep: c.sleep }).then((u) => (got = u));
  await c.advance(2000);
  expect(got).toBe("https://hel.example.com");

  // With a longer grace the tailnet wins.
  got = null;
  void race(ways, { probe, sleep: c.sleep, graceMs: 1000 }).then((u) => (got = u));
  await c.advance(3000);
  expect(got).toBe("https://hel.tail1234.ts.net");

  // Nothing answers: undefined.
  got = null;
  void race(ways, { probe: async () => false, sleep: c.sleep }).then((u) => (got = u));
  await c.advance(3000);
  expect(got).toBeUndefined();
});

test("keeper: one miss never moves it; two in a row move it to the best way that answers; a better way must answer twice", async () => {
  const up = new Set(["https://hel.tail1234.ts.net", "https://hel.example.com", "https://ducter.example.org"]);
  let cur = "https://hel.example.com";
  const k = createKeeper({ ways: () => ways, current: () => cur, probe: async (u) => up.has(u) });
  // The tailnet answers twice in a row: move up.
  up.delete("https://hel.tail1234.ts.net");
  expect(await k.tick()).toBeUndefined();
  up.add("https://hel.tail1234.ts.net");
  expect(await k.tick()).toBeUndefined(); // once
  expect(await k.tick()).toBe("https://hel.tail1234.ts.net"); // twice
  cur = "https://hel.tail1234.ts.net";
  // The tailnet misses once (Tailscale turned off for a moment): stay.
  up.delete("https://hel.tail1234.ts.net");
  expect(await k.tick()).toBeUndefined();
  // Twice: leave for the next best that answers.
  expect(await k.tick()).toBe("https://hel.example.com");
  cur = "https://hel.example.com";
  // The domain and the tailnet both gone twice: the tunnel.
  up.delete("https://hel.example.com");
  await k.tick();
  expect(await k.tick()).toBe("https://ducter.example.org");
});

test("a proof counts only with the pinned key: another key, another nonce or a bent signature fails", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  const fp = fingerprint(raw);
  const nonce = "abcdefghijklmnopqrstuv";
  const proof = { v: 1, key: raw.toString("base64url"), fp, sig: sign(null, Buffer.from(challengeText(nonce)), privateKey).toString("base64url") };
  expect(checkProof(proof, nonce, fp)).toBe(true);
  expect(checkProof(proof, "another-nonce-123456", fp)).toBe(false);
  const other = generateKeyPairSync("ed25519");
  const otherRaw = Buffer.from((other.publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  expect(checkProof(proof, nonce, fingerprint(otherRaw))).toBe(false);
  // An impostor signs with its own key but names the pinned fingerprint: the key doesn't match it.
  const forged = { ...proof, key: otherRaw.toString("base64url"), sig: sign(null, Buffer.from(challengeText(nonce)), other.privateKey).toString("base64url") };
  expect(checkProof(forged, nonce, fp)).toBe(false);
  expect(checkProof({ ...proof, sig: proof.sig.slice(0, -4) + "AAAA" }, nonce, fp)).toBe(false);
  expect(checkProof(undefined, nonce, fp)).toBe(false);
});
