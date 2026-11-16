// D298: a pasted API key, checked and kept. The shape names the candidates (protocol/api-keys.ts);
// one read per candidate that spends nothing (the account's balance, the key's own record or the
// model list, at the same address the agent will use) says which provider it is and whether it
// works; the first that knows it wins. Kept in keys.env (0600) under the variable its agent reads,
// never in the Log, never printed, never sent back. Used by the home (the key_add frame) and by
// the CLI before Ducter runs (`ducter key add`, the Mac app's first run).
import { writeKey } from "@ducter/protocol/src/keys.ts";
import { KEY_PROVIDER_INFO, PI_INSTALL, cleanKey, keyName, recognizeKey, type HarnessId, type KeyProvider, type LangTag, type KeyResult, type KeyTrouble } from "@ducter/protocol";

export interface KeyCheckOptions {
  dataDir: string;
  /** The person's language (keyName picks the provider's name; any tag). */
  lang: LangTag;
  /** Test seam: the network. */
  fetch?: typeof fetch;
  /** Can this computer run that agent now (claude, dsh on PATH; pi: node or pi)? */
  canRun?: (h: HarnessId) => boolean;
  timeoutMs?: number;
  /** Don't keep it (a check only). */
  dryRun?: boolean;
}

export function defaultCanRun(which: (cmd: string) => string | null | undefined = (c) => Bun.which(c)): (h: HarnessId) => boolean {
  return (h) => (h === "claude-code" ? !!which("claude") : h === "codex" ? !!which("codex") : h === "deepseek-harness" ? !!which("dsh") : !!(which("pi") || which("node")));
}

type One = { kind: "ok"; checked: boolean } | { kind: "wrong" } | { kind: "trouble"; reason: KeyTrouble; detail?: string };

const NET = /ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|FailedToOpenSocket|ConnectionRefused|ConnectionClosed|timed? ?out|abort|network|certificate|TLS|socket/i;

/** One provider's verdict on the key. */
async function checkOne(p: KeyProvider, key: string, o: KeyCheckOptions): Promise<One> {
  const info = KEY_PROVIDER_INFO[p];
  const c = info.check;
  if (!c) return { kind: "ok", checked: false };
  const headers: Record<string, string> = { accept: "application/json", ...(c.headers ?? {}) };
  let url = c.url;
  if (c.auth === "bearer") headers.authorization = `Bearer ${key}`;
  else if (c.auth === "x-api-key") headers["x-api-key"] = key;
  else url += `${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  const f = o.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(url, { headers, signal: AbortSignal.timeout(o.timeoutMs ?? 8000) });
  } catch (err) {
    const msg = `${(err as Error)?.name ?? ""} ${(err as Error)?.message ?? ""} ${(err as { code?: string })?.code ?? ""}`;
    return { kind: "trouble", reason: NET.test(msg) || !msg.trim() ? "blocked" : "failed", detail: NET.test(msg) ? undefined : short(msg) };
  }
  let body: any;
  const text = await res.text().catch(() => "");
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  const said = short(String(body?.error?.message ?? body?.message ?? body?.error ?? ""));
  if (res.status === 401 || res.status === 403) return { kind: "wrong" };
  // Google answers a wrong key with 400 "API key not valid".
  if (res.status === 400 && /api[ _-]?key/i.test(said)) return { kind: "wrong" };
  if (res.status === 402 || /insufficient|balance|quota exceeded|余额/i.test(said)) return { kind: "trouble", reason: "no_balance" };
  if (res.status === 429) return { kind: "trouble", reason: "limited" };
  // A route the provider doesn't have (it moved): it got past the key, so keep it unchecked.
  if (res.status === 404 || res.status === 405) return { kind: "ok", checked: false };
  if (!res.ok) return { kind: "trouble", reason: "failed", detail: said || `HTTP ${res.status}` };
  if (c.balance === "deepseek" && body && body.is_available === false) return { kind: "trouble", reason: "no_balance" };
  if (c.balance === "moonshot") {
    const left = Number(body?.data?.available_balance);
    if (Number.isFinite(left) && left <= 0) return { kind: "trouble", reason: "no_balance" };
  }
  if (c.balance === "openrouter") {
    const left = body?.data?.limit_remaining;
    if (typeof left === "number" && left <= 0) return { kind: "trouble", reason: "no_balance" };
  }
  return { kind: "ok", checked: true };
}

const short = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 139) + "…" : t;
};

/**
 * Recognises, checks and keeps a pasted key. Returns what it came to, in the result's own fields
 * (keyWords says it). The key is kept only when a provider took it and Ducter can think with it.
 */
export async function addKey(raw: string, o: KeyCheckOptions): Promise<KeyResult> {
  const key = cleanKey(raw);
  const candidates = recognizeKey(key);
  if (!candidates.length) return { ok: false, reason: "shape" };
  let firstTrouble: { p: KeyProvider; one: Extract<One, { kind: "trouble" }> } | undefined;
  let allBlocked = true;
  for (const p of candidates) {
    const one = await checkOne(p, key, o);
    if (one.kind === "wrong") {
      allBlocked = false;
      continue;
    }
    if (one.kind === "trouble") {
      // Unreachable: another candidate may still answer (one blocked abroad, the next at home).
      if (one.reason === "blocked") {
        firstTrouble ??= { p, one };
        continue;
      }
      allBlocked = false;
      return troubled(p, one, o.lang);
    }
    allBlocked = false;
    const info = KEY_PROVIDER_INFO[p];
    const base: KeyResult = { ok: true, provider: p, name: keyName(p, o.lang), checked: one.checked };
    if (info.unsupported) return { ...base, ok: false, reason: "unsupported" };
    const can = o.canRun ?? defaultCanRun();
    const harness = info.harnesses.find((h) => can(h)) ?? info.harnesses.at(-1);
    if (!harness) return { ...base, ok: false, reason: "unsupported" };
    if (!o.dryRun) writeKey(o.dataDir, info.env, key);
    const model = harness === "pi" ? info.pi?.model : undefined;
    return {
      ...base,
      harness,
      ...(model ? { model } : {}),
      ...(!can(harness) && harness === "pi" ? { needs: "pi" as const, install: PI_INSTALL } : {}),
    };
  }
  if (firstTrouble) {
    // Unreachable. When a provider inside China was unreachable too and none answered at all, it's
    // the network itself; else the ones abroad are blocked from here (often: a proxy is needed).
    const home = candidates.some((p) => KEY_PROVIDER_INFO[p].homeInChina);
    if (allBlocked && home) return { ok: false, provider: firstTrouble.p, name: keyName(firstTrouble.p, o.lang), reason: "offline" };
    return { ...troubled(firstTrouble.p, firstTrouble.one, o.lang), abroad: !KEY_PROVIDER_INFO[firstTrouble.p].homeInChina };
  }
  return candidates.length === 1 ? { ok: false, provider: candidates[0], name: keyName(candidates[0]!, o.lang), reason: "wrong" } : { ok: false, reason: "wrong" };
}

function troubled(p: KeyProvider, one: Extract<One, { kind: "trouble" }>, lang: LangTag): KeyResult {
  return { ok: false, provider: p, name: keyName(p, lang), reason: one.reason, ...(one.detail ? { detail: one.detail } : {}) };
}
