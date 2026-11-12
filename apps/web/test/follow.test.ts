// D228: the page follows its home to a new address: it keeps how (relay, id, key), asks the relay
// when the home stops answering, checks a Ducter answers at the new address, and carries this
// device's pairing over in the fragment, which the page there takes and drops at once.
import { beforeEach, expect, test } from "bun:test";
import { newFollowSecrets, sealAddress, type Follow } from "@ducter/protocol";
import { answers, findHome, loadFollow, moveLink, saveFollow, takeMove } from "../src/follow-client.ts";
import type { DeviceRecord } from "../src/conn.ts";

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
beforeEach(() => mem.clear());

const rec: DeviceRecord = { token: "dvc.phone", deviceId: "d1", name: "iPhone · Safari", personaName: "小鸭", pairedAt: "2026-11-12T00:00:00.000Z" };
const secrets = newFollowSecrets();
const follow: Follow = { relay: "https://relay.test/api/addr", id: secrets.id, key: secrets.key };

function net(note: string | undefined, live: Set<string>) {
  return (async (u: string | URL | Request) => {
    const s = String(u);
    if (s.startsWith(follow.relay)) return note ? Response.json({ d: note }) : new Response("", { status: 404 });
    const origin = new URL(s).origin;
    if (s.endsWith("/.well-known/ducter-anywhere")) return live.has(origin) ? new Response("0123456789abcdef") : new Response("error 1033", { status: 530 });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

test("the page keeps its home's follow and forgets it when the address stops moving", () => {
  saveFollow(follow, rec);
  expect(loadFollow()).toEqual({ follow, at: 0 });
  saveFollow(follow, rec, 7);
  expect(loadFollow()?.at).toBe(7);
  saveFollow(follow, rec); // the same id again keeps what it knew
  expect(loadFollow()?.at).toBe(7);
  saveFollow(undefined, rec);
  expect(loadFollow()).toBeUndefined();
});

test("the home moved: the relay's note leads to a Ducter that answers, so the page goes there", async () => {
  const d = await sealAddress(follow.key, follow.id, { url: "https://new-name.trycloudflare.com", at: 20 });
  const kept = { follow, at: 10 };
  const here = new URL("https://old-name.trycloudflare.com/app");
  expect(await findHome(here, kept, net(d, new Set(["https://new-name.trycloudflare.com"])))).toEqual({ url: "https://new-name.trycloudflare.com", at: 20 });
  // Nothing answers there yet (or the note is old, or it is where we are): stay.
  expect(await findHome(here, kept, net(d, new Set()))).toBeUndefined();
  expect(await findHome(here, { follow, at: 20 }, net(d, new Set(["https://new-name.trycloudflare.com"])))).toBeUndefined();
  expect(await findHome(new URL("https://new-name.trycloudflare.com/app"), kept, net(d, new Set(["https://new-name.trycloudflare.com"])))).toBeUndefined();
  expect(await findHome(here, kept, net(undefined, new Set()))).toBeUndefined();
  expect(await findHome(here, undefined, net(d, new Set()))).toBeUndefined();
  expect(await answers("https://x.example", (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBe(false);
});

test("at the new address the fragment's pairing becomes this page's, and the fragment is gone", () => {
  const link = moveLink("https://new-name.trycloudflare.com", rec, follow, 20);
  expect(link.startsWith("https://new-name.trycloudflare.com/app#move=")).toBe(true);
  expect(link).not.toContain("?"); // nothing in the part a server sees
  const u = new URL(link);
  const stored: DeviceRecord[] = [];
  let replaced = "";
  const got = takeMove({ set: (d) => stored.push(d) }, { hash: u.hash, pathname: u.pathname } as Location, { replaceState: (_a: unknown, _b: string, url: string) => void (replaced = url) } as unknown as History);
  expect(got).toEqual(rec);
  expect(stored).toEqual([rec]);
  expect(replaced).toBe("/app");
  expect(loadFollow()).toEqual({ follow, at: 20 });
  // No fragment: nothing happens.
  expect(takeMove({ set: () => stored.push(rec) }, { hash: "", pathname: "/app" } as Location, { replaceState: () => {} } as unknown as History)).toBeUndefined();
  expect(stored.length).toBe(1);
});
