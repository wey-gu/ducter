// D463: the owed live checks of D425–D459, one entry each (kit.ts runs them). Each reads what is
// already there, or asks the person for their one step; the pure readers below are what the tests
// hold against fakes.
import { basename, join } from "node:path";
import { pipxCmd, seenAtOf } from "@ducter/core/src/bridge-link.ts";
import { foundOf } from "@ducter/core/src/mem-glance.ts";
import { contactsOf, mailboxesOf, refsIn, resourceOf } from "@ducter/partner/src/bridge.ts";
import { readFreeLimit, type FreeProvider, WIDER_KINDS } from "@ducter/protocol";
import { askHome, type Check, type Ctx, dayOf, doNow, fieldsOf, jsonOf, type LoggedEvent, type Observed, opt, type Step, type StepDone, yesNo } from "./kit.ts";
import { payControls } from "./pay-page.ts";

const DAY = 86_400_000;
const MIN = 60_000;

// ---------- pure readers (tested with fakes) ----------

/** D453/D458: a week of offers from the Log: how many a morning, what was taken up. */
export function offersWeek(events: readonly LoggedEvent[], now: number, zone?: string) {
  const offers = new Map<string, string>(); // decisionId → day
  const taken = new Set<string>();
  const wider = new Map<string, Set<string>>();
  let first = Infinity;
  for (const e of events) {
    const at = Date.parse(e.ts);
    if (e.kind === "decision" && e.body?.offer === true && typeof e.body.decisionId === "string") {
      offers.set(e.body.decisionId, dayOf(at, zone));
      first = Math.min(first, at);
    } else if (e.kind === "decision_resolved" && e.body?.by === "user" && e.body.option !== "hold" && offers.has(e.body.decisionId)) taken.add(e.body.decisionId);
    else if (e.kind === "find_state" && (WIDER_KINDS as readonly string[]).includes(e.body?.kind)) {
      const s = wider.get(e.body.kind) ?? new Set<string>();
      s.add(e.body.findId);
      wider.set(e.body.kind, s);
    }
  }
  const perDay = new Map<string, number>();
  for (const d of offers.values()) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  const counts = [...perDay.values()];
  const n = offers.size;
  return {
    offers: n,
    days: first === Infinity ? 0 : Math.max(1, Math.ceil((now - first) / DAY)),
    mornings: perDay.size,
    perMorning: counts.length ? Math.round((n / counts.length) * 10) / 10 : 0,
    most: counts.length ? Math.max(...counts) : 0,
    taken: taken.size,
    takenRate: n ? Math.round((taken.size / n) * 1000) / 1000 : 0,
    wider: Object.fromEntries(WIDER_KINDS.map((k) => [k, wider.get(k)?.size ?? 0])) as Record<string, number>,
  };
}

export interface Hold {
  harness: string;
  why: string;
  resetKnown: boolean;
  free?: string;
  until: number;
  back?: number;
}

/** D435/D297: the partner's holds and whether each came back at its reset. */
export function holdsOf(events: readonly LoggedEvent[]): Hold[] {
  const out: Hold[] = [];
  const open = new Map<string, Hold>();
  for (const e of events) {
    if (e.kind !== "partner_session") continue;
    const b = e.body ?? {};
    if (b.event === "brain_held" && b.held) {
      if (open.has(b.harness)) continue; // the same hold said again
      const h: Hold = { harness: b.harness, why: b.held.why, resetKnown: !!b.held.resetKnown, until: Date.parse(b.held.until), ...(b.held.free ? { free: b.held.free } : {}) };
      open.set(b.harness, h);
      out.push(h);
    } else if (b.event === "brain_back") {
      const h = open.get(b.harness);
      if (h) (h.back = Date.parse(e.ts)), open.delete(b.harness);
    }
  }
  return out;
}

/** A hold is right when it came back at its known reset (not before it, within 30 min after), or is still waiting for it. */
export function holdVerdict(h: Hold, now: number): "ok" | "early" | "late" | "stuck" | "waiting" {
  if (h.back === undefined) return now > h.until + 60 * MIN ? "stuck" : "waiting";
  if (!h.resetKnown) return "ok";
  if (h.back < h.until - MIN) return "early";
  return h.back > h.until + 30 * MIN ? "late" : "ok";
}

/** D427/D429: the loops: each on-loop's latest wait, and what brought one back. */
export function loopsOf(events: readonly LoggedEvent[]) {
  const loops = new Map<string, any>();
  const waits = new Map<string, string>(); // taskId → latest waiter state
  const backs: Record<string, number> = { done: 0, failed: 0, lost: 0, restart: 0 };
  let late = 0;
  let moves = 0;
  for (const e of events) {
    const b = e.body ?? {};
    if (e.kind === "task_loop" && typeof b.taskId === "string") {
      if (b.back && b.back.at !== loops.get(b.taskId)?.back?.at && b.back.from in backs) backs[b.back.from]!++;
      loops.set(b.taskId, b);
    } else if (e.kind === "waiter" && typeof b.taskId === "string" && !b.limit) waits.set(b.taskId, b.state);
    else if (e.kind === "decision" && b.loop) {
      late++;
      if (b.loop.move) moves++;
    }
  }
  const on = [...loops.values()].filter((l) => l.state === "on");
  const unarmed = on.filter((l) => waits.get(l.taskId) !== "armed");
  // A round's done read as the loop's end (D427) is the regression this guards: a done-back loop left ended by no one.
  const endedByDone = [...loops.values()].filter((l) => l.state === "ended" && !l.endedBy).length;
  return { loops: loops.size, on: on.length, paused: [...loops.values()].filter((l) => l.state === "paused").length, ended: [...loops.values()].filter((l) => l.state === "ended").length, unarmed: unarmed.length, endedByNoOne: endedByDone, backs, lateCards: late, movesOffered: moves };
}

/** D440: seconds from the person's first message after `since` to the partner's first answer (not the home's greeting). */
export function firstAnswer(events: readonly LoggedEvent[], since: number): { asked: boolean; seconds?: number } {
  const ask = events.find((e) => e.kind === "user_msg" && Date.parse(e.ts) >= since);
  if (!ask) return { asked: false };
  const answer = events.find((e) => e.kind === "ai_msg" && e.seq > ask.seq && !e.body?.first);
  return answer ? { asked: true, seconds: Math.round((Date.parse(answer.ts) - Date.parse(ask.ts)) / 100) / 10 } : { asked: true };
}

/** D436: the newest 去付款 card since then, and how it was settled. */
export function checkoutOf(events: readonly LoggedEvent[], since: number) {
  const card = [...events].reverse().find((e) => e.kind === "decision" && e.body?.checkout && Date.parse(e.ts) >= since);
  if (!card) return undefined;
  const ck = card.body.checkout;
  const settled = events.find((e) => e.kind === "decision_resolved" && e.body?.decisionId === card.body.decisionId);
  const refused = events.filter((e) => e.kind === "task_event" && e.stream === card.body.taskId && /paying is the user's own tap/i.test(JSON.stringify(e.body ?? {}))).length;
  let host = "";
  try {
    host = new URL(ck.url).hostname;
  } catch {
    host = String(ck.site ?? "");
  }
  return {
    decisionId: String(card.body.decisionId),
    taskId: typeof card.body.taskId === "string" ? card.body.taskId : undefined,
    observed: { host, total: !!ck.total, currency: ck.currency ?? null, items: Array.isArray(ck.items) ? ck.items.length : 0, picture: Array.isArray(ck.media) && ck.media.length > 0 } satisfies Observed,
    settled: settled ? { option: String(settled.body.option), by: String(settled.body.by) } : undefined,
    refused,
  };
}

/** D444: what Ducter reads off `bridge contacts`, as shapes. */
export function contactShapes(j: any): Observed & { list: string } {
  const key = Array.isArray(j?.contacts) ? "contacts" : Array.isArray(j?.cards) ? "cards" : "none";
  const list: any[] = key === "none" ? [] : j[key];
  const boxes = mailboxesOf(j);
  return {
    list: key,
    cards: list.length,
    fields: fieldsOf(list),
    mailboxField: list.some((c) => c && typeof c === "object" && "mailbox_available" in c),
    unavailableField: list.some((c) => c && typeof c === "object" && "unavailable" in c),
    memberField: list.some((c) => c && typeof c === "object" && ("member" in c || "member_id" in c || "member_name" in c)),
    ownTools: boxes.map((b) => `${b.harness}:${b.open ? "open" : "closed"}`),
    usable: contactsOf(j).length,
  };
}

/** D433: `connections list --include-activity`'s connections, as shapes, and how many carry a seen time where Ducter reads it. */
export function activityShapes(j: any): Observed {
  const list: any[] = Array.isArray(j?.connections) ? j.connections : [];
  return {
    connections: list.length,
    fields: fieldsOf(list),
    activityFields: fieldsOf(list.map((c) => c?.activity).filter(Boolean)),
    seenRead: list.filter((c) => seenAtOf(c) !== undefined).length,
    saysNoActivity: list.filter((c) => c?.activity_available === false || c?.activity?.activity_available === false).length,
  };
}

/** D449: the 429 as pi would pass it (the body's words), read by Ducter's own reader. */
export function limitShapes(provider: FreeProvider, status: number, headers: Record<string, string>, body: string, now: number): Observed & { ok: boolean } {
  const read = readFreeLimit(body, now);
  const j = jsonOf(body);
  const headerReset = Number(headers["x-ratelimit-reset"]);
  const headerMs = Number.isFinite(headerReset) && headerReset > 0 ? (headerReset < 1e12 ? headerReset * 1000 : headerReset) : undefined;
  const agrees = read && headerMs !== undefined ? Math.abs(Date.parse(read.resetsAt) - headerMs) < 2000 : null;
  const ok = !!read && read.provider === provider && (headerMs === undefined || read.source === "header") && agrees !== false;
  return {
    ok,
    status,
    bodyFields: j ? fieldsOf([j, j.error].filter(Boolean)) : [],
    metadataHeaders: /"metadata"\s*:\s*\{[^}]*"headers"/.test(body),
    quotaId: /quotaId|quota_id/i.test(body),
    perDayNamed: /PerDay|per[_ ]day|free-models-per-day/i.test(body),
    retryDelay: /retryDelay|retry in \d/i.test(body),
    headerReset: headerMs !== undefined,
    readProvider: read?.provider ?? null,
    readScope: read?.scope ?? null,
    readSource: read?.source ?? null,
    resetsAt: read?.resetsAt ?? null,
    agreesWithHeader: agrees,
  };
}

/** D445: the package manager a Linux home's /etc/os-release names. */
export function expectedManager(osRelease: string | undefined): string | undefined {
  const id = /^(?:ID|ID_LIKE)=["']?([^"'\n]+)/gm;
  const ids: string[] = [];
  for (const m of (osRelease ?? "").matchAll(id)) ids.push(...m[1]!.split(/\s+/));
  if (ids.some((i) => /^(fedora|rhel|centos)$/.test(i))) return "dnf";
  if (ids.some((i) => /^(arch|manjaro|endeavouros)$/.test(i))) return "pacman";
  if (ids.some((i) => /suse/.test(i))) return "zypper";
  if (ids.some((i) => /^(debian|ubuntu)$/.test(i))) return "apt";
  return undefined;
}

// ---------- shared steps ----------

const since = (c: Ctx, days: number) => c.env.now() - days * DAY;
const noLog = (): StepDone => ({ outcome: "fail", note: "no Log here: run it on the home (where ~/.ducter/ducter.db is)", stop: true });

const homeUp: Step = {
  id: "home",
  title: "The home answers on this computer",
  by: "auto",
  async run(c) {
    const f = await askHome(c, { t: "devices" }, "devices");
    if (!f) return { outcome: "fail", note: "no Ducter answered here: start it (ducter up) and run again", stop: true };
    c.memo.devices = f.devices;
    const workers = f.devices.filter((d) => !d.home && d.kind !== "phone");
    return { outcome: "pass", observed: { computers: f.devices.filter((d) => d.kind !== "phone").length, workersAwake: workers.filter((d) => d.state === "awake").length, phones: f.devices.filter((d) => d.kind === "phone").length } };
  },
};

const nmemBin = (c: Ctx) => c.env.vars.NMEM_CLI_PATH || c.env.which("nmem");
const nmem = async (c: Ctx, args: string[], ms = 60_000) => {
  const bin = c.memo.nmem as string;
  return c.env.run([bin, "--json", ...args], ms);
};

// ---------- the checks ----------

const memShapes: Check = {
  name: "mem-shapes",
  decisions: ["D433", "D444", "D458"],
  title: "Mem's real answers have the shapes Ducter reads (contacts, activity, search, a resource, a message's references)",
  needs: ["Nowledge Mem signed in on this computer (nmem)", "optional: a nowledgemem:// link from a Bridge message", "optional: a saved `nmem --json bridge open <id>` you ran yourself"],
  where: "the author's Mac or hel, wherever Mem is",
  minutes: 3,
  todo: "Mem in the person's day (D444, `memory.md` \"Mem in the person's day\", research/191)",
  takes: ["--uri <nowledgemem://…>", "--message <file.json>", "--query <words>"],
  steps: [
    {
      id: "nmem",
      title: "nmem is here",
      by: "auto",
      async run(c) {
        const bin = nmemBin(c);
        if (!bin) return { outcome: "fail", note: "nmem isn't on this computer", stop: true };
        c.memo.nmem = bin;
        const v = await c.env.run([bin, "--version"], 15_000);
        const version = /(\d+\.\d+\.\d+\S*)/.exec(`${v?.out ?? ""} ${v?.err ?? ""}`)?.[1] ?? null;
        return { outcome: v && v.code === 0 ? "pass" : "fail", observed: { version }, ...(v && v.code === 0 ? {} : { stop: true, note: "nmem --version failed" }) };
      },
    },
    {
      id: "contacts",
      title: "bridge contacts (grouped): mailbox_available / unavailable and the member, where D444 reads them",
      by: "auto",
      async run(c) {
        const r = await nmem(c, ["bridge", "contacts"]);
        if (!r || r.code !== 0) return { outcome: "fail", note: `bridge contacts failed (exit ${r?.code ?? "none"})` };
        const j = jsonOf(r.out);
        if (!j) return { outcome: "fail", note: "bridge contacts gave no JSON" };
        const s = contactShapes(j);
        if (s.list === "none") return { outcome: "fail", observed: { ...s, topFields: fieldsOf([j]) }, note: "no contacts[] or cards[] where Ducter reads them" };
        if (!s.cards) return { outcome: "not-yet", observed: s, note: "no cards yet: connect one agent to Mem first" };
        return { outcome: s.mailboxField ? "pass" : "fail", observed: s, ...(s.mailboxField ? {} : { note: "no card carries mailbox_available" }) };
      },
    },
    {
      id: "activity",
      title: "connections list --include-activity: the last-seen time where D433 reads it",
      by: "auto",
      async run(c) {
        const h = await nmem(c, ["bridge", "connections", "list", "--help"], 15_000);
        const offered = !!h && /--include-activity/.test(`${h.out}\n${h.err}`);
        const rec = jsonOf(c.env.readText(join(c.env.dataDir, "bridge-connection.json")) ?? "");
        if (!offered) return { outcome: "pass", observed: { offered }, note: "this nmem has no --include-activity: Ducter reads none" };
        if (!rec?.spaceId || !rec?.agentId) return { outcome: "skip", observed: { offered }, note: "this home has no Bridge connection to list" };
        const r = await nmem(c, ["bridge", "connections", "list", "--space-id", rec.spaceId, "--agent-id", rec.agentId, "--include-activity"]);
        const j = r && r.code === 0 ? jsonOf(r.out) : undefined;
        if (!j) return { outcome: "fail", observed: { offered }, note: "the list with --include-activity failed or gave no JSON" };
        const s = activityShapes(j);
        const ok = s.seenRead as number > 0 || s.saysNoActivity === s.connections;
        return { outcome: ok ? "pass" : "fail", observed: { offered, ...s }, ...(ok ? {} : { note: "activity offered but no last_seen_at_ms where Ducter reads it" }) };
      },
    },
    {
      id: "search",
      title: "m search: what D321 and D458's gatherer read",
      by: "auto",
      async run(c) {
        const r = await nmem(c, ["m", "search", "-n", "5", "--", opt(c, "query") ?? "decided"]);
        const found = r && r.code === 0 ? foundOf(r.out) : undefined;
        const j = r ? jsonOf(r.out) : undefined;
        return found ? { outcome: "pass", observed: { memories: found.length, fields: fieldsOf(Array.isArray(j?.memories) ? j.memories : []) } } : { outcome: "fail", observed: { topFields: j ? fieldsOf([j]) : [] }, note: "no memories[] where Ducter reads them" };
      },
    },
    {
      id: "resource",
      title: "resources get: a link's title and body, where D444 reads them",
      by: "auto",
      optional: true,
      async run(c) {
        const uri = opt(c, "uri");
        if (!uri) return { outcome: "skip", note: "no --uri given" };
        if (!/^nowledgemem:\/\//i.test(uri)) return { outcome: "fail", note: "--uri is not a nowledgemem:// link" };
        const r = await nmem(c, ["resources", "get", "--", uri], 30_000);
        if (!r || r.code !== 0) return { outcome: "fail", note: `resources get failed (exit ${r?.code ?? "none"})` };
        const got = resourceOf(r.out);
        const j = jsonOf(r.out);
        const shape = { title: !!got?.title, text: !!got?.text, fields: j ? fieldsOf([j, j.resource].filter(Boolean)) : [] };
        return { outcome: got?.title && got?.text ? "pass" : "fail", observed: shape, ...(got?.title && got?.text ? {} : { note: "title or body not where Ducter reads them" }) };
      },
    },
    {
      id: "references",
      title: "a received message's KnowledgeReferences, where D444 reads them (from a saved bridge open)",
      by: "auto",
      optional: true,
      async run(c) {
        const file = opt(c, "message");
        if (!file) return { outcome: "skip", note: "no --message given (opening a message marks it read, so the kit never opens one)" };
        const j = jsonOf(c.env.readText(file) ?? "");
        if (!j) return { outcome: "fail", note: "--message is not JSON" };
        const m = j.message && typeof j.message === "object" ? j.message : j;
        const body = typeof m.body === "string" ? m.body : typeof m.text === "string" ? m.text : "";
        const refs = refsIn(j, body);
        const where = ["references", "knowledge_references"].flatMap((k) => [k in j ? k : "", m !== j && k in m ? `message.${k}` : ""]).filter(Boolean);
        return { outcome: refs.length ? "pass" : where.length ? "fail" : "not-yet", observed: { refs: refs.length, kinds: refs.map((r) => r.kind), where }, ...(refs.length ? {} : { note: where.length ? "references present but none read" : "this message carries no references" }) };
      },
    },
  ],
};

const offers: Check = {
  name: "offers-week",
  decisions: ["D453", "D458"],
  title: "A week of offers on hel: how many a morning, what was taken up, the wider kinds",
  needs: ["a home that has run a week with 有用就说 on (hel)"],
  where: "hel (or any home with a week of offers)",
  minutes: 1,
  todo: "Offers, not interruptions (D453)",
  steps: [
    {
      id: "week",
      title: "Offers in the last 7 days, read from the Log",
      by: "auto",
      async run(c) {
        const ev = c.env.events(["decision", "decision_resolved", "find_state"], since(c, 7));
        if (!ev) return noLog();
        const w = offersWeek(ev, c.env.now());
        const observed = { ...w, wider: Object.entries(w.wider).map(([k, n]) => `${k}:${n}`), meetsOneInTwenty: w.takenRate >= 0.05 };
        if (!w.offers) return { outcome: "not-yet", observed, note: "no offers in the Log yet" };
        if (w.days < 5) return { outcome: "not-yet", observed, note: `only ${w.days} days of offers: a week is owed` };
        if (w.perMorning > 3) return { outcome: "fail", observed, note: `${w.perMorning} offers a morning: more than the one or two meant` };
        if (w.takenRate < 0.05) return { outcome: "fail", observed, note: `taken up ${w.taken} of ${w.offers}: under the 1-in-20 bar` };
        return { outcome: "pass", observed };
      },
    },
  ],
};

const limitHit: Check = {
  name: "limit-hit",
  decisions: ["D435", "D297", "D449"],
  title: "A real usage limit: the partner held, back at the true reset, tasks resumed in their session",
  needs: ["a home where a real limit was hit in the last 14 days (Claude Code's 5-hour window, Codex's, or a free key's day)"],
  where: "hel or the author's Mac, after a limit",
  minutes: 1,
  todo: "Usage limits (D297, research/101)",
  steps: [
    {
      id: "holds",
      title: "The partner's holds in the last 14 days, each back at its reset",
      by: "auto",
      async run(c) {
        const ev = c.env.events(["partner_session"], since(c, 14));
        if (!ev) return noLog();
        const now = c.env.now();
        const hs = holdsOf(ev);
        const verdicts = hs.map((h) => holdVerdict(h, now));
        const observed: Observed = {
          holds: hs.length,
          why: hs.map((h) => h.why),
          resetKnown: hs.filter((h) => h.resetKnown).length,
          free: hs.flatMap((h) => (h.free ? [h.free] : [])),
          verdicts,
          minutesAfterReset: hs.flatMap((h) => (h.back !== undefined && h.resetKnown ? [Math.round((h.back - h.until) / MIN)] : [])),
        };
        if (!hs.length) return { outcome: "not-yet", observed, note: "no limit hit in 14 days" };
        const bad = verdicts.filter((v) => v === "early" || v === "late" || v === "stuck");
        return bad.length ? { outcome: "fail", observed, note: `${bad.join(", ")}` } : { outcome: "pass", observed };
      },
    },
    {
      id: "tasks",
      title: "Tasks that rested on a limit (D297) woke and went on",
      by: "auto",
      optional: true,
      async run(c) {
        const ev = c.env.events(["waiter"], since(c, 14)) ?? [];
        const last = new Map<string, any>();
        for (const e of ev) if (e.body?.limit) last.set(e.body.waiterId, e.body);
        const all = [...last.values()];
        const observed = { waits: all.length, fired: all.filter((w) => w.state === "fired").length, armed: all.filter((w) => w.state === "armed").length, cancelled: all.filter((w) => w.state === "cancelled").length, resetKnown: all.filter((w) => w.limit?.resetKnown).length };
        if (!all.length) return { outcome: "skip", observed, note: "no task rested on a limit" };
        const overdue = all.filter((w) => w.state === "armed" && w.at && Date.parse(w.at) < c.env.now() - 60 * MIN).length;
        return overdue ? { outcome: "fail", observed: { ...observed, overdue }, note: `${overdue} still waiting an hour past their reset` } : { outcome: "pass", observed };
      },
    },
  ],
};

const FREE_CALL: Record<FreeProvider, { url: string; init: (key: string) => RequestInit; pace: number; max: number }> = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    init: (key) => ({ method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model: "google/gemma-4-31b-it:free", messages: [{ role: "user", content: "Say ok." }], max_tokens: 1 }) }),
    pace: 3200, // under 20 a minute: the day's cap, not the minute's
    max: 80,
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    init: (key) => ({ method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "Say ok." }] }], generationConfig: { maxOutputTokens: 1 } }) }),
    pace: 0, // the minute's cap: the day's takes hours on Gemini's free tier
    max: 400,
  },
};

const freeKey: Check = {
  name: "free-key-429",
  decisions: ["D449"],
  title: "A throwaway free key run to its limit: the provider's own 429, read by Ducter as pi passes it",
  needs: ["a throwaway free OpenRouter key or free Gemini key made for this (never your main one)"],
  where: "any computer with the network",
  minutes: 10,
  todo: "A free key's day (D449, research/195)",
  outward: "the throwaway key's free requests, spent on purpose until the provider says 429",
  takes: ["--provider openrouter|google", "--max <requests>", "--pace <ms>"],
  steps: [
    {
      id: "confirm",
      title: "You agree to spend a throwaway key's free day",
      by: "person",
      async run(c) {
        let p = opt(c, "provider");
        if (!p) p = (await c.env.ask("Which provider: openrouter or google? "))?.trim().toLowerCase();
        if (p !== "openrouter" && p !== "google") return { outcome: "skip", note: "no provider chosen", stop: true };
        c.memo.provider = p;
        const a = (await c.env.ask(`This sends requests with the key until ${p} says 429 (up to ${opt(c, "max") ?? FREE_CALL[p].max}). Use a throwaway key. Type yes to go on: `))?.trim();
        if (a?.toLowerCase() !== "yes") return { outcome: "skip", observed: { provider: p }, note: "not agreed", stop: true };
        return { outcome: "pass", observed: { provider: p } };
      },
    },
    {
      id: "spend",
      title: "Requests until the provider's 429",
      by: "auto",
      async run(c) {
        const p = c.memo.provider as FreeProvider;
        const secret = await c.env.secret(`Paste the throwaway ${p} key (not shown, never kept): `);
        if (!secret?.trim()) return { outcome: "skip", note: "no key given", stop: true };
        const call = FREE_CALL[p];
        const max = Number(opt(c, "max") ?? call.max);
        const pace = Number(opt(c, "pace") ?? call.pace);
        const t0 = c.env.now();
        for (let n = 1; n <= max; n++) {
          let res: Response;
          try {
            res = await c.env.fetch(call.url, call.init(secret.trim()));
          } catch {
            return { outcome: "fail", observed: { sent: n }, note: "the provider can't be reached", stop: true };
          }
          if (res.status === 429) {
            const headers: Record<string, string> = {};
            res.headers.forEach((v, k) => /^(x-ratelimit-|retry-after)/i.test(k) && (headers[k.toLowerCase()] = v));
            c.memo.limit = { status: 429, headers, body: await res.text(), at: c.env.now() };
            return { outcome: "pass", observed: { sent: n, seconds: Math.round((c.env.now() - t0) / 1000) } };
          }
          await res.body?.cancel().catch(() => {});
          if (res.status === 401 || res.status === 403) return { outcome: "fail", observed: { sent: n, status: res.status }, note: "the key was refused", stop: true };
          if (pace) await c.env.wait(pace);
        }
        return { outcome: "not-yet", observed: { sent: max }, note: `no 429 in ${max} requests`, stop: true };
      },
    },
    {
      id: "read",
      title: "Ducter's reader on the 429's words (the body alone, as pi passes it on)",
      by: "auto",
      async run(c) {
        const l = c.memo.limit as { status: number; headers: Record<string, string>; body: string; at: number };
        const s = limitShapes(c.memo.provider as FreeProvider, l.status, l.headers, l.body, l.at);
        const { ok, ...observed } = s;
        c.memo.resetsAt = s.resetsAt;
        return ok ? { outcome: "pass", observed } : { outcome: "fail", observed, note: s.readProvider ? "read, but its reset isn't the provider's own" : "Ducter's reader didn't know this 429" };
      },
    },
    {
      id: "said",
      title: "If this key is the home's: Settings › Partner says the day is used up and when it's back",
      by: "person",
      optional: true,
      async run(c) {
        const at = c.memo.resetsAt ? new Date(String(c.memo.resetsAt)).toLocaleString() : "the provider's reset";
        return yesNo("said", "", `Only if this key is the home's key now: does Settings › Partner say today's free requests are used up, back at ${at}?`, { optional: true }).run(c);
      },
    },
  ],
};

const firstAnswerCheck: Check = {
  name: "first-answer",
  decisions: ["D440"],
  title: "A bare Mac's first answer: no Node, no agent, a free key pasted, pi put in place, the first message answered",
  needs: ["a throwaway macOS user account with no Node and no AI agent", "a free Gemini key or a Kimi voucher key made by a person", "Ducter installed there from the download page"],
  where: "the bare account, after installing Ducter",
  minutes: 15,
  todo: "A first answer with no plan (D440, research/189)",
  takes: ["--wait <seconds>"],
  steps: [
    {
      id: "bare",
      title: "This account has no Node and no AI agent on its PATH",
      by: "auto",
      async run(c) {
        const found = ["node", "claude", "codex", "pi"].filter((x) => c.env.which(x));
        return found.length ? { outcome: "fail", observed: { found }, note: `not a bare account: ${found.join(", ")} on PATH` } : { outcome: "pass", observed: { found } };
      },
    },
    homeUp,
    doNow("key", "You paste the free key", "In Ducter, paste the free key where the first screen asks for one, and wait until it says it's ready."),
    {
      id: "pi",
      title: "pi is in Ducter's own tools folder (D363), not on the PATH",
      by: "auto",
      async run(c) {
        const at = ["bin", join("node", "bin")].map((d) => join(c.env.dataDir, "tools", d, "pi")).find((p) => c.env.exists(p));
        return at ? { outcome: "pass", observed: { where: at.includes(join("node", "bin")) ? "tools/node/bin" : "tools/bin" } } : { outcome: "fail", observed: { where: null }, note: "no pi under Ducter's tools folder" };
      },
    },
    doNow("ask", "You send the first message", "Now send your first message in Ducter (anything you'd really ask), then press Enter at once."),
    {
      id: "answer",
      title: "The partner answers it",
      by: "auto",
      async run(c) {
        const from = (c.memo["key.at"] as number | undefined) ?? c.startedAt;
        const limit = Number(opt(c, "wait") ?? 180) * 1000;
        const t0 = c.env.now();
        for (;;) {
          const ev = c.env.events(["user_msg", "ai_msg"], from);
          if (!ev) return noLog();
          const a = firstAnswer(ev, from);
          if (a.seconds !== undefined) return { outcome: "pass", observed: { seconds: a.seconds } };
          if (c.env.now() - t0 > limit) return { outcome: "fail", observed: { asked: a.asked }, note: a.asked ? `no answer in ${limit / 1000} s` : "no message seen in the Log" };
          await c.env.wait(2000);
        }
      },
    },
    yesNo("right", "The answer reads right", "Does the answer make sense, in your language, with no setup words in it?"),
  ],
};

const errand: Check = {
  name: "errand-checkout",
  decisions: ["D436", "D446"],
  title: "An errand on one real shop up to the pay page, paid by your own tap (or not bought)",
  needs: ["your phone with Ducter", "Ducter's browser signed in to one real shop, with things in the cart", "the home running (hel or this Mac)"],
  where: "the home (hel or the author's Mac)",
  minutes: 15,
  todo: "An errand to the checkout (D436, `errand.md`, research/185)",
  steps: [
    homeUp,
    {
      id: "signed-in",
      title: "Ducter's browser is signed in somewhere",
      by: "auto",
      async run(c) {
        const f = await askHome(c, { t: "browser_sites" }, "browser_sites");
        if (!f) return { outcome: "fail", note: "the home didn't say its browser's sites", stop: true };
        const observed = { ready: f.ready, sites: f.sites.length };
        return f.sites.length ? { outcome: "pass", observed } : { outcome: "fail", observed, note: "sign Ducter's browser in to one shop first", stop: true };
      },
    },
    doNow("ask", "You ask for the errand from the phone", "From your phone, ask for it (e.g. 把购物车里那三样买了). Wait until the 去付款 card shows."),
    {
      id: "card",
      title: "A 去付款 card with the shop's host and the total",
      by: "auto",
      async run(c) {
        const ev = c.env.events(["decision"], c.startedAt);
        if (!ev) return noLog();
        const ck = checkoutOf(ev, c.startedAt);
        if (!ck) return { outcome: "fail", note: "no checkout card since the check began", stop: true };
        c.memo.checkout = ck.decisionId;
        return { outcome: ck.observed.total ? "pass" : "fail", observed: ck.observed, ...(ck.observed.total ? {} : { note: "the card has no total" }) };
      },
    },
    yesNo("matches", "The card's total and shop match the cart", "Do the card's total and the shop's name match what's in your cart?"),
    yesNo("live", "去付款 opens the live page on the phone", "Tap 去付款 on the phone: does the shop's pay page open live, there?"),
    doNow("pay", "You pay with your own tap, or tap 先不买", "Now pay yourself in the live view (or tap 先不买), then answer the card (付好了 / 还没付)."),
    {
      id: "settled",
      title: "The card was settled by you, and Ducter never pressed pay",
      by: "auto",
      async run(c) {
        const ev = c.env.events(["decision", "decision_resolved", "task_event"], c.startedAt);
        if (!ev) return noLog();
        const ck = checkoutOf(ev, c.startedAt);
        if (!ck?.settled) return { outcome: "fail", note: "the card is still open" };
        const observed = { option: ck.settled.option, by: ck.settled.by, payPressesRefused: ck.refused };
        return ck.settled.by === "user" ? { outcome: "pass", observed } : { outcome: "fail", observed, note: "settled by a default, not by you" };
      },
    },
  ],
};

const payWords: Check = {
  name: "pay-words",
  decisions: ["D436", "D446"],
  title: "The pay gate read against real checkout pages: does it name each page's real pay button?",
  needs: ["five real checkout pages saved at the pay step (File › Save Page As, nothing pressed): zh, en, ja if you can"],
  where: "any computer with the saved pages",
  minutes: 10,
  todo: "An errand to the checkout (D436, `errand.md`, research/185)",
  takes: ["--page <file.html> (repeat)"],
  steps: [
    {
      id: "read",
      title: "Each page's controls, judged by the gate",
      by: "auto",
      async run(c) {
        const pages = c.opts.page ?? [];
        if (!pages.length) return { outcome: "fail", note: "give the saved pages: --page a.html --page b.html …", stop: true };
        const read: { page: string; controls: number; pays: string[] }[] = [];
        for (const p of pages) {
          const html = c.env.readText(p);
          if (html === undefined) return { outcome: "fail", note: `can't read ${basename(p)}`, stop: true };
          read.push({ page: basename(p), ...(await payControls(html)) });
        }
        c.memo.pages = read;
        return { outcome: pages.length >= 5 ? "pass" : "not-yet", observed: { pages: read.length, controls: read.map((r) => r.controls), refused: read.map((r) => `${r.page}: ${r.pays.slice(0, 5).join(" | ") || "(none)"}`) }, ...(pages.length >= 5 ? {} : { note: "five pages are owed" }) };
      },
    },
    {
      id: "named",
      title: "You confirm the real pay button is among what the gate refuses",
      by: "person",
      async run(c) {
        const pages = c.memo.pages as { page: string; pays: string[] }[];
        const missed: string[] = [];
        for (const p of pages) {
          const a = (await c.env.ask(`${p.page}: Ducter would refuse to press: ${p.pays.join(" | ") || "nothing"}. Is the page's real pay button among them? [y/n] `))?.trim();
          if (a === undefined) return { outcome: "skip", note: "nobody at the terminal" };
          if (!/^y/i.test(a)) missed.push(p.page);
        }
        return missed.length ? { outcome: "fail", observed: { missed }, note: `the gate missed the pay button on ${missed.length}` } : { outcome: "pass", observed: { missed } };
      },
    },
  ],
};

const PLATFORMS = ["mac-app", "chrome-mac", "safari-iphone", "iphone-app", "android-app"];
const talk: Check = {
  name: "talk-mic",
  decisions: ["D442"],
  title: "Talk hands-free with a real microphone: the gaps, the echo guard, talking over it",
  needs: ["one of: the Mac app, Chrome on a Mac, Safari or the app on an iPhone, the Android app", "speakers, then earphones", "a quiet room"],
  where: "the device itself (run the kit on a Mac beside it)",
  minutes: 15,
  todo: "Talk hands-free (D442, `voice.md`, research/190)",
  takes: [`--platform ${PLATFORMS.join("|")}`],
  steps: [
    {
      id: "platform",
      title: "Which device",
      by: "person",
      async run(c) {
        const p = opt(c, "platform") ?? (await c.env.ask(`Which: ${PLATFORMS.join(", ")}? `))?.trim();
        return p && PLATFORMS.includes(p) ? { outcome: "pass", observed: { platform: p } } : { outcome: "skip", note: "no platform", stop: true };
      },
    },
    yesNo("gaps-zh", "The 1.2 s / 2.4 s gaps in Chinese", "Start a talk; say a Chinese sentence with a short pause in it. Did it wait through the pause and answer soon after you stopped?"),
    yesNo("gaps-en", "The gaps in English", "The same in English: waited through the pause, answered soon after?"),
    yesNo("echo", "On speakers it never answers itself", "On the speakers (no earphones): did it never take its own voice as yours?"),
    yesNo("over", "Talking over it stops it and it listens", "Talk while it is speaking: did it stop and hear you? (Safari/iPhone: the owed question)"),
    yesNo("earphones", "With earphones the same", "With earphones: did the talk work the same?", { optional: true }),
    yesNo("silence", "A long silence never leaves it stuck", "Stay quiet a minute: did it keep listening, or say it stopped, never stuck?"),
    yesNo("awake", "The screen stayed on", "Did the screen stay on through the talk?"),
    yesNo("card", "A card answered by saying 好", "When a card came up, did saying 好 answer it?", { optional: true }),
  ],
};

const addFolder: Check = {
  name: "add-folder",
  decisions: ["D455"],
  title: "Choose a folder on each computer: the home's and a worker's folders listed there, outside the roots refused",
  needs: ["the home (hel) running", "a paired worker Mac, awake"],
  where: "the home (hel)",
  minutes: 3,
  todo: "Folders anywhere and GitHub sign-in (D272, research/87)",
  steps: [
    homeUp,
    {
      id: "home-folders",
      title: "The home's own folders",
      by: "auto",
      async run(c) {
        return browse(c, undefined);
      },
    },
    {
      id: "outside",
      title: "A path outside the roots is refused",
      by: "auto",
      async run(c) {
        const f = await askHome(c, { t: "folder_browse", path: "/", clientId: "check-outside" }, "folder_browse_result", 15_000, (x) => x.clientId === "check-outside");
        if (!f) return { outcome: "fail", note: "no answer" };
        const roots = f.roots ?? [];
        const ok = (!f.ok && f.reason === "outside") || roots.includes("/");
        return { outcome: ok ? "pass" : "fail", observed: { ok: f.ok, reason: f.reason ?? null, rootIsSlash: roots.includes("/") }, ...(ok ? {} : { note: "/ was listed though it is outside the roots" }) };
      },
    },
    {
      id: "worker-folders",
      title: "Each awake worker's folders, looked through there",
      by: "auto",
      async run(c) {
        const ws = ((c.memo.devices as any[]) ?? []).filter((d) => !d.home && d.kind !== "phone" && d.state === "awake");
        if (!ws.length) return { outcome: "not-yet", note: "no worker awake: wake one and run again" };
        const seen: string[] = [];
        for (const w of ws) {
          const r = await browse(c, w.id);
          if (r.outcome !== "pass") return { ...r, note: `${w.name}: ${r.note ?? r.outcome}` };
          seen.push(`${w.kind}:${(r.observed as Observed).folders}`);
        }
        return { outcome: "pass", observed: { workers: ws.length, folders: seen } };
      },
    },
  ],
};

async function browse(c: Ctx, device: string | undefined): Promise<StepDone> {
  const id = `check-${device ?? "home"}`;
  const f = await askHome(c, { t: "folder_browse", ...(device ? { device } : {}), clientId: id }, "folder_browse_result", 20_000, (x) => x.clientId === id);
  if (!f) return { outcome: "fail", note: "no answer" };
  if (!f.ok) return { outcome: "fail", observed: { reason: f.reason ?? null }, note: `refused: ${f.reason ?? "?"}` };
  const folders = f.folders ?? [];
  return { outcome: "pass", observed: { folders: folders.length, repos: folders.filter((x) => x.repo).length, withOrigin: folders.filter((x) => x.remote).length, roots: (f.roots ?? []).length, more: !!f.more } };
}

const loops: Check = {
  name: "loops",
  decisions: ["D427", "D429"],
  title: "Loops on hel: every round-keeping task stays on its next wait; a round's done never ends it",
  needs: ["a home with a task in rounds running for a day or more (hel)"],
  where: "hel",
  minutes: 1,
  todo: "D427: a task in rounds is kept (`core/src/loops.ts`, research/177)",
  steps: [
    {
      id: "kept",
      title: "Loops in the last 7 days, read from the Log",
      by: "auto",
      async run(c) {
        const ev = c.env.events(["task_loop", "waiter", "decision"], since(c, 7));
        if (!ev) return noLog();
        const l = loopsOf(ev);
        const observed = { ...l, backs: Object.entries(l.backs).map(([k, n]) => `${k}:${n}`) };
        if (!l.loops) return { outcome: "not-yet", observed, note: "no task in rounds this week" };
        if (l.unarmed) return { outcome: "fail", observed, note: `${l.unarmed} loop(s) on with no next wait` };
        if (l.endedByNoOne) return { outcome: "fail", observed, note: `${l.endedByNoOne} loop(s) ended by no one` };
        return { outcome: "pass", observed };
      },
    },
  ],
};

const poppler: Check = {
  name: "poppler",
  decisions: ["D439"],
  title: "The document check's tools on this home: Poppler (8 of 13 PDF defects need it), LibreOffice for Office files",
  needs: ["nothing: run it on each home"],
  where: "hel and the author's Mac",
  minutes: 1,
  todo: "Documents you'd send (D439, `documents.md`, research/188)",
  steps: [
    {
      id: "tools",
      title: "pdftotext, pdftoppm and soffice on this home",
      by: "auto",
      async run(c) {
        const has = (x: string) => !!c.env.which(x);
        const observed = { pdftotext: has("pdftotext"), pdftoppm: has("pdftoppm"), soffice: has("soffice") || c.env.exists("/Applications/LibreOffice.app") };
        return observed.pdftotext && observed.pdftoppm ? { outcome: "pass", observed } : { outcome: "fail", observed, note: "no Poppler here: the page check misses most PDF defects" };
      },
    },
  ],
};

const pkgLine: Check = {
  name: "pkg-line",
  decisions: ["D445"],
  title: "The pipx line names this Linux home's own package manager",
  needs: ["a Fedora or Arch home (a VM is fine)"],
  where: "the Linux home",
  minutes: 1,
  todo: "Settings polish (D432, research/182)",
  steps: [
    {
      id: "line",
      title: "The line Ducter shows, against /etc/os-release",
      by: "auto",
      async run(c) {
        if (c.env.platform !== "linux") return { outcome: "not-yet", note: "run it on a Linux home" };
        const line = pipxCmd("linux", (t) => !!c.env.which(t));
        const want = expectedManager(c.env.readText("/etc/os-release"));
        const observed = { line, expected: want ?? null };
        if (!want) return { outcome: "not-yet", observed, note: "this distribution isn't one D445 names" };
        return line.includes(` ${want} `) ? { outcome: "pass", observed } : { outcome: "fail", observed, note: `expected ${want}` };
      },
    },
  ],
};

const iosDevice: Check = {
  name: "ios-device",
  decisions: ["D447", "D452", "D425", "D431"],
  title: "The iPhone app on a real phone: the keyboard, Dynamic Type, the waiting line's motion, apps, menus",
  needs: ["an iPhone with the latest Ducter build", "Settings › Accessibility › Larger Text at hand"],
  where: "the iPhone (run the kit on a Mac beside it)",
  minutes: 10,
  todo: "The iOS Simulator pass (D447)",
  steps: [
    {
      id: "phone",
      title: "Which phone",
      by: "person",
      async run(c) {
        const m = (await c.env.ask("iPhone model and iOS version (e.g. iPhone 17, iOS 26.1): "))?.trim();
        return m ? { outcome: "pass", observed: { phone: m.slice(0, 40) } } : { outcome: "skip", note: "not said", stop: true };
      },
    },
    yesNo("keyboard", "A sheet's field with the keyboard up", "Open New task and type in its field: do the field and its buttons stay in view, the page not jumping under the status bar?"),
    yesNo("composer", "The composer with the keyboard up", "Type in the conversation: does the composer sit on the keyboard with the last message visible?"),
    yesNo("type-large", "Accessibility Large: no clipped words", "Set Larger Text to an Accessibility size: are words whole (no clipping or overlap) on the conversation, On hand and Settings?"),
    yesNo("waiting", "The waiting line moves smoothly", "Ask something that takes a while: does the waiting line move smoothly, no stutter, never over the card under it?"),
    yesNo("apps", "Your apps and an open app sheet", "Open Your apps and one app: do the shelf and the sheet look right?", { optional: true }),
    yesNo("menu", "A long-press menu", "Long-press a message: does the menu open in place and read right?"),
  ],
};

const miniWindow: Check = {
  name: "mini-window",
  decisions: ["D438"],
  title: "The mini window over a full-screen app, another Space and Stage Manager: above, never taking the keyboard",
  needs: ["the signed Mac app (a release build)", "a full-screen app open"],
  where: "the author's Mac",
  minutes: 5,
  todo: "The mini window (D438, research/187)",
  steps: [
    yesNo("fullscreen", "Over a full-screen app", "Put an app in full screen and show the mini window (⌃⌥⌘Space): is it above that app?"),
    yesNo("keyboard", "It never takes the keyboard", "Type in the full-screen app while the mini window shows: do the keys still go to that app?"),
    yesNo("space", "On another Space", "Switch to another Space: does the mini window come along (or show there when asked)?"),
    yesNo("stage", "With Stage Manager", "Turn Stage Manager on: does it stay above, outside the stage?", { optional: true }),
  ],
};

const workerBrowser: Check = {
  name: "worker-browser",
  decisions: ["D436"],
  title: "A worker Mac's Ducter browser over a real socket: the card's picture, the live view, your click",
  needs: ["a paired worker Mac, awake, with 上网 / Web on", "your phone", "a shop signed in on that worker's Ducter browser"],
  where: "the home",
  minutes: 10,
  todo: "An errand to the checkout (D436, `errand.md`, research/185)",
  steps: [
    homeUp,
    {
      id: "worker",
      title: "A worker with Web on",
      by: "auto",
      async run(c) {
        const ws = ((c.memo.devices as any[]) ?? []).filter((d) => !d.home && d.kind !== "phone" && d.state === "awake" && d.abilities?.some((a: any) => a.id === "web" && a.state === "on"));
        if (!ws.length) return { outcome: "not-yet", note: "no awake worker with Web on", stop: true };
        c.env.say(`  use: ${ws.map((w) => w.name).join(", ")}`);
        return { outcome: "pass", observed: { workers: ws.length } };
      },
    },
    doNow("ask", "You ask for an errand there", "From your phone, ask for an errand on that worker (在 <its name> 上…) up to its checkout. Wait for the 去付款 card."),
    {
      id: "picture",
      title: "The card carries the page's picture from the worker",
      by: "auto",
      async run(c) {
        const ev = c.env.events(["decision"], c.startedAt);
        if (!ev) return noLog();
        const ck = checkoutOf(ev, c.startedAt);
        if (!ck) return { outcome: "fail", note: "no checkout card since the check began" };
        return ck.observed.picture ? { outcome: "pass", observed: ck.observed } : { outcome: "fail", observed: ck.observed, note: "no picture on the card" };
      },
    },
    yesNo("live", "The live view, through the worker", "Tap 去付款: does the live page open on the phone, moving as the worker's page does?"),
    yesNo("click", "Your click goes through", "Tap something harmless on the page (not pay): did the worker's page do it?"),
  ],
};

/** Every owed check, the riskiest first (research/194 §2, research/201). */
export const CHECKS: readonly Check[] = [errand, payWords, workerBrowser, firstAnswerCheck, freeKey, limitHit, loops, memShapes, talk, offers, addFolder, poppler, iosDevice, miniWindow, pkgLine];

export const checkNamed = (name: string) => CHECKS.find((c) => c.name === name);
