// D362: one download Ducter can watch: bytes as they arrive, the whole size when the source says
// it, a stall limit (no bytes for a while) and a whole limit, and a signal for 停止. Written to
// <file>.part and renamed when complete, so a cut-off download never looks finished.
import { createWriteStream, renameSync, rmSync } from "node:fs";
import type { DownloadOpts, DownloadResult } from "./update.ts";

export async function downloadFile(url: string, file: string, o: DownloadOpts = {}, fetcher: typeof fetch = fetch): Promise<DownloadResult> {
  const part = `${file}.part`;
  const ctl = new AbortController();
  let why: "stalled" | "timeout" | "stopped" | undefined;
  const cut = (w: "stalled" | "timeout" | "stopped") => {
    why ??= w;
    ctl.abort();
  };
  if (o.signal?.aborted) return { ok: false, why: "stopped" };
  const onAbort = () => cut("stopped");
  o.signal?.addEventListener("abort", onAbort, { once: true });
  const whole = setTimeout(() => cut("timeout"), o.timeoutMs ?? 30 * 60_000);
  let stall: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(stall);
    stall = setTimeout(() => cut("stalled"), o.stallMs ?? 120_000);
  };
  const clean = () => {
    try {
      rmSync(part, { force: true });
    } catch {}
  };
  try {
    arm();
    const r = await fetcher(url, { signal: ctl.signal, headers: { "user-agent": "ducter-agents" } });
    if (!r.ok || !r.body) return { ok: false, why: "network", detail: `HTTP ${r.status}` };
    const len = Number(r.headers.get("content-length") ?? "");
    const size = Number.isFinite(len) && len > 0 ? len : undefined;
    const out = createWriteStream(part);
    let got = 0;
    o.onBytes?.(0, size);
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      got += value.byteLength;
      if (!out.write(value)) await new Promise<void>((res) => out.once("drain", () => res()));
      o.onBytes?.(got, size);
    }
    await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
    if (size !== undefined && got !== size) {
      clean();
      return { ok: false, why: "network", detail: `got ${got} of ${size} bytes` };
    }
    renameSync(part, file);
    return { ok: true, size: got };
  } catch (err) {
    clean();
    if (why) return { ok: false, why };
    return { ok: false, why: "network", detail: (err as Error).message };
  } finally {
    clearTimeout(whole);
    clearTimeout(stall);
    o.signal?.removeEventListener("abort", onAbort);
  }
}
