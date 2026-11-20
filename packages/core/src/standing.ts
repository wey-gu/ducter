// D413: 不用问我的 / Without asking. What the person says Ducter may do for them from now on without
// asking ("review 做好了直接发别和我确认", "just post the reviews, don't ask me") is kept the moment their
// message lands, in their words, like a said rule (D401): no card, no Go. The review routine then
// posts its drafts on the PRs inside it through the same audited write (Done for you), and asks only
// for what is outside it (another org, a PR that only mentions them). Said again the other way
// ("评审发之前先问我", "ask me before posting reviews") or 收回 / Take back on the Partner page ends it.
//
// The floor (D61 GQ5) is never standing: paying, passwords, codes and sign-ins, deleting, and
// anything an untrusted source asked for. Ducter keeps none of those, and tells the partner the
// real reason so it says that, not a rule it made up. Outward actions Ducter has no standing path
// for yet are told to the partner as exactly that.
//
// Only an explicit statement counts: an action (a PR review), a "don't ask / post directly"
// directive, in one sentence, not a question and not this once ("这次直接发吧" is that once).
import { existsSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Bodies, StandingAction, StandingView } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

export const STANDING_FILE = "standing.json";

/** What one sentence of the person's says about asking first. */
export type StandingSaying =
  | { kind: "grant"; action: StandingAction; orgs?: string[]; quote: string }
  | { kind: "revoke"; action: StandingAction; quote: string }
  /** A no-ask said about something on the floor: never kept; the partner gives the real reason. */
  | { kind: "floor"; what: "pay" | "secret" | "delete"; quote: string }
  /** A no-ask said about an outward action Ducter can't keep as standing yet. */
  | { kind: "unsupported"; what: string; quote: string };

const REVIEW = /(?<![a-z])(code\s*)?reviews?(?![a-z])|评审|审查|审阅|\bCR\b/i;
const NO_ASK =
  /直接(发|发布|提交|贴|发出去|发到|post)|不用(再)?(问|确认|找我|等我)|不要(再)?(问|确认)|别(再)?(问|和我确认|跟我确认|找我确认|确认|等我)|无需确认|不必(问|确认)|不需要(问|确认)|自己(发|发布)(就行|吧|就好)?|\b(don'?t|do not|no need to|never|stop) (ask|asking|confirm|check with)\b|\bwithout (asking|confirm\w*|checking with me)\b|\bjust (post|send|publish)\b|\bpost (them |it |reviews? )?(directly|right away|straight)\b/i;
/** "review 不要直接发" / "别直接发": the other way. */
const NOT_DIRECT = /(不要|别|不能|不准|不许)\s*直接(发|发布|提交|post)|\b(don'?t|do not|never) (just )?post (them |it )?(directly|right away)\b/i;
const ASK_FIRST =
  /(先|还是|发之前|发布前|发前|之前)[^。！？!?\n]{0,6}(问|给我看|让我确认|跟我确认|和我确认)|(要|得|需要)先(问我|给我看|让我确认)|\bask (me )?(first|before)\b|\bcheck with me (first|before)\b|\bconfirm with me (first|before)\b/i;
const ONE_OFF = /这次|这一次|这回|这几个|这几份|这份|这个\s*PR|this time|this one|these ones|just once|for now/i;
const QUESTION = /[?？]\s*$|[吗么嘛][。！!]?\s*$|要不要|是不是|能不能|可不可以|\b(should (i|we|you)|shall (i|we)|can you|could you|would you)\b/i;
const FLOOR: [Extract<StandingSaying, { kind: "floor" }>["what"], RegExp][] = [
  ["pay", /付款|支付|付钱|刷卡|下单|买单|转账|\b(pay|paying|payments?|purchase|buy|checkout)\b/i],
  ["secret", /密码|验证码|登录|登陆|\b(passwords?|passcodes?|2fa|one-time code|sign(ing)? in|log(ging)? in)\b/i],
  ["delete", /删除|删掉|删了|清空|\b(delete|deleting|remove|wipe|erase)\b/i],
];
const OUTWARD = /邮件|email|e-mail|mail|消息|私信|message|回复|reply|评论|comment|issue|推送|push|合并|merge|发帖|post|tweet|PR|pull request/i;
const PARTICLES = /[\s哈啊呀吧哦喔啦了嘛呢~～!！。.,，;；:：]+$/;
const QUOTE_MAX = 90;
/** owner/repo or owner/repo#n named in the sentence: the owner bounds the permission. */
const OWNER_RE = /(?<![\w.-])([A-Za-z0-9][\w.-]{0,38})\/[\w.-]+(?:#\d+)?/g;

const sentences = (text: string) => text.split(/(?<=[。！？!?;；\n])|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
const clip = (s: string) => {
  const q = s.replace(/^>.*$/gm, "").replace(PARTICLES, "").trim();
  const chars = [...q];
  return chars.length <= QUOTE_MAX ? q : `${chars.slice(0, QUOTE_MAX - 1).join("").trimEnd()}…`;
};

/** What a piece of the person's words says about asking first, if anything (explicitly). */
export function readStanding(text: string): StandingSaying[] {
  const out: StandingSaying[] = [];
  // A quoted line ("> …") is someone else's words (often the partner's), never theirs.
  const own = text
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
  for (const s of sentences(own)) {
    if (QUESTION.test(s) || ONE_OFF.test(s)) continue;
    const review = REVIEW.test(s);
    if (review && (NOT_DIRECT.test(s) || (!NO_ASK.test(s) && ASK_FIRST.test(s)))) {
      out.push({ kind: "revoke", action: "pr_review", quote: clip(s) });
      continue;
    }
    if (!NO_ASK.test(s)) continue;
    const floor = FLOOR.find(([, re]) => re.test(s));
    if (floor) {
      out.push({ kind: "floor", what: floor[0], quote: clip(s) });
      continue;
    }
    if (review) {
      const orgs = [...new Set([...s.matchAll(OWNER_RE)].map((m) => m[1]!.toLowerCase()))];
      out.push({ kind: "grant", action: "pr_review", ...(orgs.length ? { orgs } : {}), quote: clip(s) });
      continue;
    }
    const o = OUTWARD.exec(s);
    if (o) out.push({ kind: "unsupported", what: o[0], quote: clip(s) });
  }
  return out;
}

export interface StandingStore {
  list(): StandingView[];
  /** The standing permission that lets this PR's review go without asking, if any. */
  allows(action: StandingAction, ref: string, o?: { mention?: boolean }): StandingView | undefined;
  /** Keep a saying (grant: kept or widened; revoke: ended), once per saying key. What changed. */
  hear(key: string, s: StandingSaying, at: string, seq?: number): { kept?: StandingView; revoked?: StandingView[] } | undefined;
  /** 收回 / Take back, by id. */
  revoke(id: string): boolean;
  /** The first use of this permission: true once (the one line in the conversation), then false. */
  firstUse(id: string): boolean;
  /** What Ducter did with this user message's words (for the partner's line under them). */
  heardFrom(seq: number): Heard[];
  /** The Log's sayings not heard yet (said before Ducter kept them), oldest first. */
  backfill(): StandingView[];
  onChange(fn: () => void): () => void;
  /** Ongoing (D413): a grant was kept: post what waits inside it now. */
  onGrant(fn: (s: StandingView) => void): () => void;
}

export type Heard =
  | { kind: "kept"; standing: StandingView }
  | { kind: "revoked"; text: string }
  | { kind: "floor"; what: "pay" | "secret" | "delete" }
  | { kind: "unsupported"; what: string };

interface File {
  items: StandingView[];
  /** Saying keys heard (said:<seq>[.i]) → what came of them, so a taken-back one never returns from the same words. */
  heard: Record<string, Heard>;
}

export function openStanding(o: { log: LogStore; dataDir: string; now?: () => Date; reviewOrgs?: () => string[] }): StandingStore {
  const now = o.now ?? (() => new Date());
  const path = join(o.dataDir, STANDING_FILE);
  let st: File = { items: [], heard: {} };
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      st = {
        items: Array.isArray(raw?.items) ? raw.items.filter((x: StandingView) => x && typeof x.id === "string" && x.action === "pr_review" && typeof x.text === "string") : [],
        heard: raw?.heard && typeof raw.heard === "object" ? raw.heard : {},
      };
    } catch (err) {
      console.warn(`[standing] ${path} is unreadable; starting with none:`, (err as Error).message);
    }
  }
  const subs = new Set<() => void>();
  const grants = new Set<(s: StandingView) => void>();
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(st, null, 2) + "\n", { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  const changed = () => {
    try {
      save();
    } catch (err) {
      console.warn("[standing] couldn't save:", (err as Error).message);
    }
    for (const fn of subs) fn();
  };
  const ownerOf = (ref: string) => ref.split("/")[0]!.toLowerCase();

  const fromLog = () =>
    o.log
      .read({ kinds: ["user_msg"], limit: 5000 })
      .filter((e) => e.origin === "user" && (e.stream === "channel" || e.stream.startsWith("channel:")))
      .filter((e) => !(e.body as Bodies["user_msg"]).forwarded)
      .flatMap((e) => readStanding((e.body as Bodies["user_msg"]).text ?? "").map((s, i) => ({ s, key: `said:${e.seq}${i ? `.${i}` : ""}`, at: e.ts, seq: e.seq })));

  const store: StandingStore = {
    list: () => st.items.slice(),
    allows(action, ref, x) {
      if (x?.mention) return undefined;
      const owner = ownerOf(ref);
      return st.items.find((s) => s.action === action && (!s.orgs?.length || s.orgs.includes(owner)));
    },
    hear(key, s, at, seq) {
      if (st.heard[key]) return undefined;
      if (s.kind === "floor" || s.kind === "unsupported") {
        st.heard[key] = s.kind === "floor" ? { kind: "floor", what: s.what } : { kind: "unsupported", what: s.what };
        changed();
        return {};
      }
      if (s.kind === "revoke") {
        const gone = st.items.filter((x) => x.action === s.action);
        st.items = st.items.filter((x) => x.action !== s.action);
        st.heard[key] = { kind: "revoked", text: gone[0]?.text ?? s.quote };
        changed();
        return { revoked: gone };
      }
      // Bounded by the orgs named, else by where the review routine looks now (a later org asks first).
      // Said again: one permission per action, its words the newest; unbounded if either is.
      const orgs = s.orgs ?? (o.reviewOrgs?.() ?? []).map((x) => x.toLowerCase());
      const had = st.items.find((x) => x.action === s.action);
      const bound = had ? (had.orgs?.length && orgs.length ? [...new Set([...had.orgs, ...orgs])] : []) : [...new Set(orgs)];
      const kept: StandingView = {
        id: had?.id ?? `st_${randomBytes(5).toString("hex")}`,
        action: s.action,
        ...(bound.length ? { orgs: bound } : {}),
        text: s.quote,
        createdAt: at,
        ...(seq !== undefined ? { seq } : {}),
        ...(had?.usedAt ? { usedAt: had.usedAt } : {}),
      };
      st.items = [...st.items.filter((x) => x.id !== kept.id), kept];
      st.heard[key] = { kind: "kept", standing: kept };
      changed();
      for (const fn of grants) fn(kept);
      return { kept };
    },
    revoke(id) {
      const n = st.items.length;
      st.items = st.items.filter((x) => x.id !== id);
      if (st.items.length === n) return false;
      changed();
      return true;
    },
    firstUse(id) {
      const s = st.items.find((x) => x.id === id);
      if (!s || s.usedAt) return false;
      s.usedAt = now().toISOString();
      changed();
      return true;
    },
    heardFrom(seq) {
      return Object.entries(st.heard)
        .filter(([k]) => k === `said:${seq}` || k.startsWith(`said:${seq}.`))
        .map(([, h]) => (h.kind === "kept" ? { kind: "kept" as const, standing: st.items.find((x) => x.id === h.standing.id) ?? h.standing } : h));
    },
    backfill() {
      const ids = new Set<string>();
      for (const { s, key, at, seq } of fromLog()) {
        if (st.heard[key]) continue;
        const r = store.hear(key, s, at, seq);
        if (r?.kept) ids.add(r.kept.id);
      }
      return st.items.filter((x) => ids.has(x.id));
    },
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    onGrant(fn) {
      grants.add(fn);
      return () => grants.delete(fn);
    },
  };
  return store;
}

/** D413: the person's words are heard as they land, before the partner's turn (as D401's rules). */
export function keepStandingAtOnce(log: LogStore, store: StandingStore): () => void {
  return log.subscribe((e) => {
    if (e.kind !== "user_msg" || e.origin !== "user") return;
    if (!(e.stream === "channel" || e.stream.startsWith("channel:"))) return;
    const b = e.body as Bodies["user_msg"];
    if (b.forwarded) return;
    readStanding(b.text ?? "").forEach((s, i) => store.hear(`said:${e.seq}${i ? `.${i}` : ""}`, s, e.ts, e.seq));
  });
}
