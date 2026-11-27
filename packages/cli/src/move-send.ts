// D627: the one-shot network exchange of `ducter move` (D504, design/move.md §5, step 4).
//
// The new home runs `ducter move --receive --listen`: it makes an ephemeral X25519 key, prints one
// one-time code (D83's alphabet, 10 minutes, one use), and waits for exactly one sender. The old
// home runs `ducter move --to <address> --code <code>`: it proves the code to the listener, derives
// a shared key, and sends the same AES-256-GCM bundle the file slice writes, with the bundle's own
// random passphrase inside the encrypted channel. The listener writes the received bundle to a
// 0600 temp file, hands it to the same `readBundle` the file slice uses, then deletes it.
//
// move.md chooses X25519 + the move code for two homes that have never met. The known-worker
// shortcut (a paired computer skips the code over its authenticated worker socket) is not in this
// slice: a worker's socket is a later connection, and the code path works for every computer.
// Resumable chunks are not here either: one request carries the bundle; a drop leaves the old home
// frozen, and `--unfreeze` is the way back.
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  randomInt,
  type KeyObject,
} from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import type { MoveState } from "@ducter/protocol";
import type { BundleReadResult } from "./move-bundle.ts";
import { connect } from "./client.ts";

/** No I, L, O, U, 0, 1: the same alphabet as a pairing code (D83). */
export const MOVE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const MOVE_CODE_TTL_MS = 10 * 60_000;

export const newMoveCode = (): string => {
  let raw = "";
  for (let i = 0; i < 8; i++) raw += MOVE_CODE_ALPHABET[randomInt(MOVE_CODE_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};
export const normalizeMoveCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
const rawPublic = (k: KeyObject): Buffer => (k.export({ type: "spki", format: "der" }) as Buffer).subarray(-32);
const publicFromRaw = (raw: Buffer): KeyObject => createPublicKey({ key: Buffer.concat([X25519_SPKI, raw]), format: "der", type: "spki" });

const codeKey = (code: string) => createHmac("sha256", normalizeMoveCode(code));
const proof = (code: string, data: string) => codeKey(code).update(data).digest();
const sendAad = (clientNonce: string, serverNonce: string) => Buffer.from(`ducter-move-send-v1|${clientNonce}|${serverNonce}`);
const sharedKey = (shared: Buffer, code: string, clientNonce: string, serverNonce: string) =>
  Buffer.from(hkdfSync("sha256", shared, Buffer.from(normalizeMoveCode(code)), Buffer.from(`ducter-move-v1|${clientNonce}|${serverNonce}`), 32));

export interface MoveHost {
  freeze(): Promise<MoveState>;
  status(): Promise<MoveState>;
  unfreeze(): Promise<MoveState>;
  close(): void;
}

/** The running home on this computer, over its own socket (D627: `ducter move --to/--unfreeze`). */
export async function localMoveHost(port: number): Promise<MoveHost | undefined> {
  const conn = await connect(port, { timeoutMs: 3_000 });
  if (!conn) return undefined;
  const call = async (t: "move_freeze" | "move_status" | "move_unfreeze"): Promise<MoveState> => {
    conn.send({ t });
    const r = (await conn.next((f) => f.t === `${t}_result`, 10_000)) as { move?: MoveState; error?: string } | undefined;
    if (!r?.move) throw new Error(r?.error ?? "no answer");
    return r.move;
  };
  return { freeze: () => call("move_freeze"), status: () => call("move_status"), unfreeze: () => call("move_unfreeze"), close: () => conn.close() };
}

export type MoveSendError = "wrong_code" | "connection" | "refused" | "bad_address" | "timeout" | "stopped" | "write";

export type MoveSendResult = { ok: true; files: number; events: number; relocked: number } | { ok: false; error: MoveSendError; detail?: string };

export type MoveListenResult =
  | { ok: true; receive: BundleReadResult }
  | { ok: false; error: "timeout" | "stopped" | "wrong_code" | "bad_request" | "refused" | "write"; detail?: string };

export interface MoveListenHandle {
  address: string;
  port: number;
  code: string;
  done: Promise<MoveListenResult>;
  stop(): void;
}

export interface MoveListenInput {
  code: string;
  host?: string;
  port?: number;
  timeoutMs?: number;
  /** The file slice's own verify-and-import; it must be the same call `--receive <file>` makes. */
  onBundle(file: string, passphrase: string): Promise<BundleReadResult>;
}

/** The first address another computer on the LAN can reach; localhost when there is none. */
function addressFor(host: string, port: number): string {
  if (host !== "0.0.0.0" && host !== "::" && host !== "") return `http://${host}:${port}`;
  try {
    const nets = networkInterfaces() as Record<string, { address: string; family: string | number; internal: boolean }[] | undefined>;
    for (const list of Object.values(nets)) for (const n of list ?? []) if (!n.internal && (n.family === "IPv4" || n.family === 4)) return `http://${n.address}:${port}`;
  } catch {
    /* localhost below */
  }
  return `http://127.0.0.1:${port}`;
}

function normalizeBase(address: string): string | undefined {
  let s = address.trim();
  if (!s) return undefined;
  if (!/^[a-z]+:\/\//i.test(s)) s = (/^(127\.|localhost|\[::1\])/i.test(s) ? "http://" : "https://") + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    u.pathname = u.pathname.replace(/\/+$/, "").replace(/\/(move|pair|ws|worker)$/, "");
    u.search = u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * Wait once for the old computer. The listener answers exactly one handshake and one bundle; after
 * its response it stops, and the code dies with it. A wrong code or a cancel stops it at once.
 */
export function listenOnce(i: MoveListenInput): MoveListenHandle {
  const code = i.code;
  let hello:
    | { clientPub: Buffer; clientNonce: string; serverPriv: KeyObject; serverPub: Buffer; serverNonce: string }
    | undefined;
  let finished = false;
  let settle!: (r: MoveListenResult) => void;
  const done = new Promise<MoveListenResult>((r) => (settle = r));
  let ttl: ReturnType<typeof setTimeout> | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  const finish = (r: MoveListenResult, afterResponse = false) => {
    if (finished) return;
    finished = true;
    if (ttl) clearTimeout(ttl);
    settle(r);
    setTimeout(() => server?.stop(true), afterResponse ? 50 : 0);
  };
  const forget = () => {
    hello = undefined;
  };

  server = Bun.serve({
    hostname: i.host ?? "0.0.0.0",
    port: i.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/move/cancel") {
        forget();
        finish({ ok: false, error: "stopped" });
        return json({ ok: false, error: "stopped" });
      }
      if (url.pathname === "/move/hello") {
        if (finished) return json({ ok: false, error: "used" }, 409);
        let body: { v?: unknown; clientPub?: unknown; nonce?: unknown };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ ok: false, error: "bad_request" }, 400);
        }
        if (body?.v !== 1 || typeof body.clientPub !== "string" || typeof body.nonce !== "string" || body.nonce.length < 8 || body.nonce.length > 80) return json({ ok: false, error: "bad_request" }, 400);
        const clientPub = unb64(body.clientPub);
        if (clientPub.length !== 32) return json({ ok: false, error: "bad_request" }, 400);
        const pair = generateKeyPairSync("x25519");
        const serverPub = rawPublic(pair.publicKey);
        const serverNonce = b64(randomBytes(24));
        hello = { clientPub, clientNonce: body.nonce, serverPriv: pair.privateKey, serverPub, serverNonce };
        const p = proof(code, `server|${clientPub.toString("hex")}|${serverPub.toString("hex")}|${body.nonce}|${serverNonce}`);
        return json({ v: 1, serverPub: b64(serverPub), nonce: serverNonce, proof: b64(p) });
      }
      if (url.pathname === "/move/send") {
        if (finished) return json({ ok: false, error: "used" }, 409);
        if (!hello) return json({ ok: false, error: "bad_request" }, 400);
        const h = hello;
        const got = req.headers.get("x-ducter-code") ?? "";
        const want = proof(code, `client|${h.clientPub.toString("hex")}|${h.serverPub.toString("hex")}|${h.clientNonce}|${h.serverNonce}`);
        let same = false;
        try {
          const b = unb64(got);
          same = b.length === want.length && Buffer.compare(b, want) === 0;
        } catch {
          same = false;
        }
        if (!same) {
          forget();
          finish({ ok: false, error: "wrong_code" }, true);
          return json({ ok: false, error: "wrong_code" }, 403);
        }
        // The code did its job: the sender is the right one. The import gets its own window.
        if (ttl) clearTimeout(ttl);
        ttl = setTimeout(() => finish({ ok: false, error: "timeout" }), 15 * 60_000);
        let raw: Buffer;
        try {
          raw = Buffer.from(await req.arrayBuffer());
        } catch {
          return json({ ok: false, error: "bad_request" }, 400);
        }
        if (raw.length < 12 + 16) {
          forget();
          finish({ ok: false, error: "bad_request" }, true);
          return json({ ok: false, error: "bad_request" }, 400);
        }
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(raw.length - 16);
        const ct = raw.subarray(12, raw.length - 16);
        let plain: Buffer;
        try {
          const shared = diffieHellman({ privateKey: h.serverPriv, publicKey: publicFromRaw(h.clientPub) });
          const key = sharedKey(shared, code, h.clientNonce, h.serverNonce);
          const d = createDecipheriv("aes-256-gcm", key, iv);
          d.setAAD(sendAad(h.clientNonce, h.serverNonce));
          d.setAuthTag(tag);
          plain = Buffer.concat([d.update(ct), d.final()]);
        } catch {
          forget();
          finish({ ok: false, error: "refused" }, true);
          return json({ ok: false, error: "refused" }, 400);
        }
        if (plain.length < 4) {
          forget();
          finish({ ok: false, error: "bad_request" }, true);
          return json({ ok: false, error: "bad_request" }, 400);
        }
        const mlen = plain.readUInt32BE(0);
        if (mlen < 2 || mlen > 64 * 1024 || plain.length < 4 + mlen) {
          forget();
          finish({ ok: false, error: "bad_request" }, true);
          return json({ ok: false, error: "bad_request" }, 400);
        }
        let meta: { v?: unknown; passphrase?: unknown };
        try {
          meta = JSON.parse(plain.subarray(4, 4 + mlen).toString("utf8")) as typeof meta;
        } catch {
          forget();
          finish({ ok: false, error: "bad_request" }, true);
          return json({ ok: false, error: "bad_request" }, 400);
        }
        if (meta?.v !== 1 || typeof meta.passphrase !== "string" || meta.passphrase.length < 8) {
          forget();
          finish({ ok: false, error: "bad_request" }, true);
          return json({ ok: false, error: "bad_request" }, 400);
        }
        const bundle = plain.subarray(4 + mlen);
        const dir = mkdtempSync(join(tmpdir(), "ducter-move-receive-"));
        chmodSync(dir, 0o700);
        const file = join(dir, "move.ducter");
        let received: BundleReadResult;
        try {
          writeFileSync(file, bundle, { mode: 0o600 });
          received = await i.onBundle(file, meta.passphrase);
        } catch (e) {
          forget();
          finish({ ok: false, error: "write", detail: (e as Error).message }, true);
          return json({ ok: false, error: "write" }, 500);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
        forget();
        finish({ ok: true, receive: received }, true);
        return json(received.ok ? { ok: true, files: received.files, events: received.events, relocked: received.relocked } : { ok: false, error: received.error });
      }
      return json({ ok: false, error: "not_found" }, 404);
    },
  });
  const port = server.port!;
  const ttlMs = i.timeoutMs ?? MOVE_CODE_TTL_MS;
  ttl = setTimeout(() => finish({ ok: false, error: "timeout" }), ttlMs);
  return {
    address: addressFor(i.host ?? "0.0.0.0", port),
    port,
    code,
    done,
    stop() {
      forget();
      finish({ ok: false, error: "stopped" });
    },
  };
}

/** Send one bundle to a listening new home. The bundle's passphrase rides only inside the channel. */
export async function sendMove(address: string, code: string, bundleFile: string, passphrase: string, opts: { readFile?: (p: string) => Promise<Uint8Array> } = {}): Promise<MoveSendResult> {
  const base = normalizeBase(address);
  if (!base) return { ok: false, error: "bad_address" };
  if (normalizeMoveCode(code).length !== 8) return { ok: false, error: "wrong_code" };
  try {
    const pair = generateKeyPairSync("x25519");
    const clientPub = rawPublic(pair.publicKey);
    const clientNonce = b64(randomBytes(24));
    const hr = await fetch(`${base}/move/hello`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ v: 1, clientPub: b64(clientPub), nonce: clientNonce }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!hr.ok) return { ok: false, error: "connection", detail: `hello ${hr.status}` };
    const h = (await hr.json()) as { v?: unknown; serverPub?: unknown; nonce?: unknown; proof?: unknown };
    if (h?.v !== 1 || typeof h.serverPub !== "string" || typeof h.nonce !== "string" || typeof h.proof !== "string") return { ok: false, error: "refused" };
    const serverPub = unb64(h.serverPub);
    if (serverPub.length !== 32) return { ok: false, error: "refused" };
    const want = proof(code, `server|${clientPub.toString("hex")}|${serverPub.toString("hex")}|${clientNonce}|${h.nonce}`);
    const got = unb64(h.proof);
    if (got.length !== want.length || Buffer.compare(got, want) !== 0) {
      // The new home didn't prove the code: stop its one listener, so nothing waits on.
      await fetch(`${base}/move/cancel`, { method: "POST", signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
      return { ok: false, error: "wrong_code" };
    }
    const shared = diffieHellman({ privateKey: pair.privateKey, publicKey: publicFromRaw(serverPub) });
    const key = sharedKey(shared, code, clientNonce, h.nonce);
    const bundle = opts.readFile ? Buffer.from(await opts.readFile(bundleFile)) : Buffer.from(await Bun.file(bundleFile).arrayBuffer());
    const meta = Buffer.from(JSON.stringify({ v: 1, passphrase }));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(meta.length, 0);
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(sendAad(clientNonce, h.nonce));
    const body = Buffer.concat([iv, c.update(Buffer.concat([len, meta, bundle])), c.final(), c.getAuthTag()]);
    const p = proof(code, `client|${clientPub.toString("hex")}|${serverPub.toString("hex")}|${clientNonce}|${h.nonce}`);
    const sr = await fetch(`${base}/move/send`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-ducter-code": b64(p) },
      body,
      signal: AbortSignal.timeout(15 * 60_000),
    });
    const answer = (await sr.json().catch(() => ({}))) as { ok?: unknown; files?: unknown; events?: unknown; relocked?: unknown; error?: unknown };
    if (!sr.ok || answer.ok !== true) return { ok: false, error: sr.status === 403 ? "wrong_code" : "refused", detail: typeof answer.error === "string" ? answer.error : `send ${sr.status}` };
    return { ok: true, files: Number(answer.files) || 0, events: Number(answer.events) || 0, relocked: Number(answer.relocked) || 0 };
  } catch (e) {
    return { ok: false, error: "connection", detail: (e as Error).message };
  }
}
