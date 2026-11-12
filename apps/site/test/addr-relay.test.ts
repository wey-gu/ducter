// The address relay (D228): a home leaves a sealed note under a random id; only that home may
// write it again; a paired device reads it back (from a page: CORS open) and opens it itself.
import { expect, test } from "bun:test";
import { lookupAddress, newFollowSecrets, sealAddress } from "../../../packages/protocol/src/follow.ts";
import { ADDR_LIMITS, createAddrRelay, memoryAddrStore } from "../api/addr/[op].ts";

const R = "https://ducter.test/api/addr";
const mk = () => createAddrRelay({ env: { ADDR_HASH_KEY: "k" }, store: memoryAddrStore() });
const put = (relay: ReturnType<typeof mk>, b: unknown, ip = "198.51.100.1") => relay(new Request(`${R}/put`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(b) }));

test("a home's note goes in and comes back as it was; a device opens it with its key", async () => {
  const relay = mk();
  const s = newFollowSecrets();
  const d = await sealAddress(s.key, s.id, { url: "https://a.trycloudflare.com", at: 1 });
  expect((await put(relay, { id: s.id, w: s.write, d })).status).toBe(200);
  const fetcher = ((u: string) => relay(new Request(u))) as unknown as typeof fetch;
  expect(await lookupAddress({ relay: R, id: s.id, key: s.key }, fetcher)).toEqual({ url: "https://a.trycloudflare.com", at: 1 });
  const r = await relay(new Request(`${R}/get?id=${s.id}`));
  expect(r.headers.get("access-control-allow-origin")).toBe("*");
  expect(JSON.stringify(await r.json())).not.toContain(s.write);
});

test("only the home that wrote a note may write it again", async () => {
  const relay = mk();
  const s = newFollowSecrets();
  const d = await sealAddress(s.key, s.id, { url: "https://a.trycloudflare.com", at: 1 });
  await put(relay, { id: s.id, w: s.write, d });
  const other = newFollowSecrets();
  expect((await put(relay, { id: s.id, w: other.write, d: await sealAddress(other.key, s.id, { url: "https://evil.example", at: 9 }) })).status).toBe(403);
  const d2 = await sealAddress(s.key, s.id, { url: "https://b.trycloudflare.com", at: 2 });
  expect((await put(relay, { id: s.id, w: s.write, d: d2 })).status).toBe(200);
  const fetcher = ((u: string) => relay(new Request(u))) as unknown as typeof fetch;
  expect((await lookupAddress({ relay: R, id: s.id, key: s.key }, fetcher))?.url).toBe("https://b.trycloudflare.com");
});

test("bad shapes, unknown ids and too many writes are refused", async () => {
  const relay = mk();
  expect((await put(relay, { id: "short", w: "x", d: "y" })).status).toBe(400);
  expect((await relay(new Request(`${R}/get?id=${newFollowSecrets().id}`))).status).toBe(404);
  expect((await relay(new Request(`${R}/get?id=nope`))).status).toBe(400);
  const s = newFollowSecrets();
  const d = await sealAddress(s.key, s.id, { url: "https://a.trycloudflare.com", at: 1 });
  let last = 0;
  for (let i = 0; i <= ADDR_LIMITS.putHour; i++) last = (await put(relay, { id: s.id, w: s.write, d }, `198.51.100.${i}`)).status;
  expect(last).toBe(429);
  expect((await relay(new Request(`${R}/put`, { method: "OPTIONS" }))).status).toBe(204);
});
