// Keys never render (D152). A task's brief, its commands and their output can carry a credential
// the user pasted ("connect with nmem_ct_…") or one a tool printed. The Log keeps them as they
// are (the task needs the key to do its work, and the Log stays on the home), and the home
// hides them in everything it sends to a client (core/src/ws.ts, the projection), so no screen,
// notification or screenshot shows one. Clients hide again when they render, for a home that
// predates this. The Go port (apps/desktop/internal/redact) passes the same cases
// (fixtures/redact.json).
//
// What stays: a short recognizable head ("nmem_ct_", "sk-", "Bearer ") so a person can tell
// which key it was, then HIDDEN. Patterns are RE2-safe (no lookaround) so Go reads them alike.

/** What stands where a key was. Language-neutral: clients say "a key is hidden" in theirs. */
export const HIDDEN = "••••••";

/** Known key formats: the head kept, the rest hidden. */
const PREFIXED =
  /\b(nmem_[a-z]{2,4}_|sk-ant-[a-z0-9]{2,6}-|sk-proj-|sk-|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|xox[abprs]-|AKIA|ASIA|AIza|hf_|npm_|pk_live_|sk_live_|rk_live_|whsec_|shpat_|dop_v1_)[A-Za-z0-9_\-]{8,}/g;
/** A JWT: three base64url parts. */
const JWT = /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/g;
/** An Authorization header or a bare bearer token. */
const BEARER = /\b((?:[Bb]earer|[Bb]asic|[Tt]oken)\s+)[A-Za-z0-9._~+/\-]{12,}=*/g;
/** A password in a URL: scheme://user:secret@host. */
const URL_CRED = /(\b[a-z][a-z0-9+.\-]*:\/\/[^\s:/@]+:)[^\s@/]{3,}@/gi;
/** A value after a field that names a secret: token=…, "api_key": "…", password: …, --token … */
const FIELD =
  /((?:[A-Za-z0-9]+[_\-])*(?:api[_\-]?key|apikey|access[_\-]?key|secret|token|password|passwd|pwd|credential|auth[_\-]?key|private[_\-]?key|connect[_\-]?code)(?:[_\-][A-Za-z0-9]+)*\\?["']?\s*(?:[:=]|\s)\s*\\?["']?)([^\s"'`,;<>()\[\]{}\\•\uE000\uE001]{12,})/gi;
/** A PEM private key block. */
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
/** D191: a card number (15–16 digits from a card network, or grouped as printed) that passes Luhn; the last four stay. */
const CARD = /\b(?:[2-6]\d{14,15}|\d{4}(?:[ -]\d{4}){3}|\d{4}[ -]\d{6}[ -]\d{5})\b/g;

/** D191: a card's security code or a one-time code, named: "CVV 737", "安全码 737", "验证码：482913". */
const CVC = /((?:cvc2?|cvv2?|csc|cvn|security code|安全码|验证码|校验码)\s*[:：=]?\s*)(\d{3,8})\b/gi;

/** The Luhn check (a card number), on the digits only. */
export function luhnOk(s: string): boolean {
  const d = s.replace(/\D+/g, "");
  if (d.length < 15 || d.length > 16) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = d.charCodeAt(d.length - 1 - i) - 48;
    if (i % 2 === 1 && (n *= 2) > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** A value that reads as a key, not a word: long, with a digit, not one repeated character, not a path. */
function keyLike(v: string): boolean {
  if (v.length < 12) return false;
  if (!/[0-9]/.test(v) || !/[A-Za-z]/.test(v)) return false;
  if (v.includes("/") && !/^[A-Za-z0-9+/]{20,}={0,2}$/.test(v)) return false; // a path, not base64
  if (/^v?\d+(\.\d+)+$/.test(v)) return false; // a version
  return true;
}

/** One key found in a text: its format, its head (a prefixed key's "nmem_ct_", kept on screen; else the label before it, "Bearer ", "token="), and the key (a prefixed one with its head). */
export interface FoundKey {
  kind: "pem" | "prefixed" | "jwt" | "bearer" | "url" | "field" | "card";
  head: string;
  key: string;
}

// Each key found is first swapped for a marker (private-use characters, never in real text), so
// a later pattern can't match inside a key already found; then each marker becomes what the
// caller says. One scan, two callers: what renders (redact) and what reaches a task (the brief).
const MARK = /\uE000(\d+)\uE001/g;

/**
 * Finds every key in the text and lets `hide` say what stands in its place (undefined keeps it).
 * The one detector: `redact` (what renders, D152) and the partner's brief guard (what reaches a
 * task, G-safety G3; research/48 F7, D175) both use it.
 */
export function redactWith(s: string, hide: (k: FoundKey) => string | undefined, o: { strict?: boolean } = {}): string {
  if (!s || s.length < 8) return s;
  const found: FoundKey[] = [];
  const mark = (k: FoundKey) => `\uE000${found.push(k) - 1}\uE001`;
  let out = s.replace(PEM, (m) => mark({ kind: "pem", head: "", key: m }));
  out = out.replace(CARD, (m) => (luhnOk(m) ? mark({ kind: "card", head: "", key: m }) : m));
  out = out.replace(CVC, (_m, head: string, v: string) => head + mark({ kind: "field", head, key: v }));
  // A known head with a digit after it is a key. strict (what reaches a task): a long tail is one
  // too, digits or not (a screen keeps "sk-learn-preprocessing" readable; a task loses nothing by it).
  out = out.replace(PREFIXED, (m, head: string) => (/[0-9]/.test(m.slice(head.length)) || (o.strict && m.length - head.length >= 16) ? mark({ kind: "prefixed", head, key: m }) : m));
  out = out.replace(JWT, (m) => mark({ kind: "jwt", head: "", key: m }));
  out = out.replace(BEARER, (m, head: string) => head + mark({ kind: "bearer", head, key: m.slice(head.length) }));
  out = out.replace(URL_CRED, (m, head: string) => `${head}${mark({ kind: "url", head, key: m.slice(head.length, -1) })}@`);
  // A value already found by a pattern above ("sk-ant-api03-" + its marker) keeps its head.
  out = out.replace(FIELD, (m, head: string, v: string, at: number, all: string) => (keyLike(v) && !all.startsWith("\uE000", at + m.length) ? head + mark({ kind: "field", head, key: v }) : m));
  if (!found.length) return s;
  return out.replace(MARK, (_m, i: string) => {
    const k = found[Number(i)]!;
    const r = hide(k);
    // Kept: the key as it was (a head outside the key, "Bearer " or "token=", is still in the text).
    return r ?? k.key;
  });
}

/** The text with every key in it hidden. */
export function redact(s: string): string {
  return redactWith(s, (k) => (k.kind === "pem" ? `-----BEGIN PRIVATE KEY-----${HIDDEN}-----END PRIVATE KEY-----` : k.kind === "prefixed" ? k.head + HIDDEN : k.kind === "card" ? HIDDEN + k.key.replace(/\D+/g, "").slice(-4) : HIDDEN));
}

/** A Nowledge Mem connect code ("nmem_ct_…"): the one key a user may hand a task on purpose (D152's scenario, D175). */
export const isConnectCode = (k: FoundKey) => k.kind === "prefixed" && /^nmem_[a-z]{2,4}_$/.test(k.head);

/** Whether the text had a key hidden in it (a client says so under it). */
export const hasHidden = (s: string | undefined): boolean => !!s && s.includes(HIDDEN);

const SECRET_KEY = /^(?:api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|client[_-]?secret|password|passwd|authorization|private[_-]?key|connect[_-]?code)$/i;

/** A value with every string in it hidden as `redact` does; a field named for a secret hidden whole. */
export function redactDeep<T>(v: T): T {
  return walk(v, "") as T;
}

function walk(v: unknown, key: string): unknown {
  // D206: media refs hold ids, keys and a data: preview, never words; a preview's base64 can look like a key.
  if (key === "media" || key === "preview") return v;
  if (typeof v === "string") return SECRET_KEY.test(key) && v.length >= 8 ? HIDDEN : redact(v);
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((x) => {
      const y = walk(x, "");
      if (y !== x) changed = true;
      return y;
    });
    return changed ? out : v;
  }
  if (v && typeof v === "object") {
    let out: Record<string, unknown> | undefined;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const y = walk(x, k);
      if (y !== x) (out ??= { ...(v as Record<string, unknown>) })[k] = y;
    }
    return out ?? v;
  }
  return v;
}
