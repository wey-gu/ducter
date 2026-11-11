// Text adb can't type (中文, 日本語, emoji…) goes onto Ducter's phone through the emulator's own
// clipboard and a paste (D214, research/59 §3). The emulator serves gRPC on 127.0.0.1 with a
// token it writes into its discovery file (`running/pid_<n>.ini`, outside Ducter's folder, removed
// when it quits); `setClipboard` is one unary call, so a few lines of HTTP/2 replace a gRPC
// library. The headless emulator doesn't copy its clipboard to the Mac's (checked), and the
// clipboard is emptied again right after the paste.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import http2 from "node:http2";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Where the emulator writes its discovery files on this platform. */
export function runningDir(platform: string = process.platform, env: Record<string, string | undefined> = process.env): string {
  if (platform === "darwin") return join(homedir(), "Library", "Caches", "TemporaryItems", "avd", "running");
  return join(env.XDG_RUNTIME_DIR || join(homedir(), ".android"), "avd", "running");
}

/** The running emulator of this AVD: its gRPC port and token, from its discovery file. */
export function findGrpc(avdDir: string, dir: string = runningDir()): { port: number; token: string } | undefined {
  if (!existsSync(dir)) return undefined;
  const want = resolve(avdDir);
  for (const f of readdirSync(dir)) {
    if (!/^pid_\d+\.ini$/.test(f)) continue;
    let s: string;
    try {
      s = readFileSync(join(dir, f), "utf8");
    } catch {
      continue;
    }
    const get = (k: string) => s.match(new RegExp(`^${k.replace(".", "\\.")}=(.*)$`, "m"))?.[1]?.trim();
    const at = get("avd.dir");
    if (!at || resolve(at) !== want) continue;
    const port = Number(get("grpc.port"));
    const token = get("grpc.token");
    if (port && token) return { port, token };
  }
  return undefined;
}

const varint = (n: number) => {
  const b: number[] = [];
  while (n > 127) b.push((n & 127) | 128), (n >>>= 7);
  b.push(n);
  return Buffer.from(b);
};

/** A gRPC frame of `ClipData { string text = 1; }`. */
export function clipFrame(text: string): Buffer {
  const utf = Buffer.from(text, "utf8");
  const msg = utf.length ? Buffer.concat([Buffer.from([0x0a]), varint(utf.length), utf]) : Buffer.alloc(0);
  const head = Buffer.alloc(5);
  head.writeUInt32BE(msg.length, 1);
  return Buffer.concat([head, msg]);
}

/** EmulatorController.setClipboard; resolves when the emulator says OK. */
export function setClipboard(g: { port: number; token: string }, text: string, timeoutMs = 5_000): Promise<void> {
  return new Promise((ok, fail) => {
    const client = http2.connect(`http://127.0.0.1:${g.port}`);
    const timer = setTimeout(() => (client.destroy(), fail(new Error("the phone's clipboard didn't answer"))), timeoutMs);
    const done = (e?: Error) => (clearTimeout(timer), client.close(), e ? fail(e) : ok());
    client.on("error", (e) => done(e));
    const req = client.request({ ":method": "POST", ":path": "/android.emulation.control.EmulatorController/setClipboard", "content-type": "application/grpc", te: "trailers", authorization: `Bearer ${g.token}` });
    let status = "";
    let message = "";
    const read = (h: Record<string, unknown>) => {
      if (h["grpc-status"] != null) status = String(h["grpc-status"]);
      if (h["grpc-message"] != null) message = String(h["grpc-message"]);
    };
    req.on("response", read);
    req.on("trailers", read);
    req.on("data", () => {});
    req.on("end", () => done(status === "0" ? undefined : new Error(`the phone's clipboard refused (${status}${message ? `: ${message}` : ""})`)));
    req.on("error", (e) => done(e));
    req.end(clipFrame(text));
  });
}
