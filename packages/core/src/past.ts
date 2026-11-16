// D285: 做过的事 / Past tasks (design/past.md). Three parts, all on the home:
//   - marks: the person's own marks on a task (their name for it, a star, a few tags, a picture),
//     kept per persona in <dataDir>/marks.json (user data like settings, not events);
//   - the index: per task, what anyone said and what it touched, built from the Log on first use
//     and kept live by subscription;
//   - search: free words over every field, AND across words, time words as a date range, ranked by
//     where they matched and how recently it was worked on. Deterministic; never a model.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  harnessName,
  PAST_GLYPHS,
  PAST_NAME_LEN,
  PAST_TAG_LEN,
  PAST_TAGS_MAX,
  PAST_TINTS,
  type Bodies,
  type LogEvent,
  type PastFacets,
  type PastField,
  type PastGlyph,
  type PastItem,
  type PastMark,
  type PastMarkPatch,
  type PastQuery,
  type TaskCard,
} from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";

// ---------- marks ----------

export interface Marks {
  get(persona: string, taskId: string): PastMark | undefined;
  /** Applies a patch; the mark as it is now (undefined when nothing is left on it). */
  set(persona: string, taskId: string, patch: PastMarkPatch): PastMark | undefined;
  /** Tags in use for this persona, most used first. */
  tags(persona: string): { tag: string; n: number }[];
}

const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;

/** A tag as kept: trimmed, inner spaces folded, Latin lowercased, cut to PAST_TAG_LEN; "" when empty. */
export function cleanTag(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return [...s].slice(0, PAST_TAG_LEN).join("");
}

export function createMarks(opts: { dataDir: string; now?: () => number }): Marks {
  const file = join(opts.dataDir, "marks.json");
  const now = opts.now ?? Date.now;
  let all: Record<string, Record<string, PastMark>> = {};
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { personas?: Record<string, Record<string, PastMark>> };
      if (j && typeof j.personas === "object" && j.personas) all = j.personas;
    }
  } catch {
    all = {};
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, personas: all }, null, 2));
    renameSync(tmp, file);
  };
  return {
    get: (persona, taskId) => {
      const m = all[persona]?.[taskId];
      return m ? structuredClone(m) : undefined;
    },
    set(persona, taskId, patch) {
      const prev = all[persona]?.[taskId];
      const m: PastMark = { ...(prev ?? {}), at: new Date(now()).toISOString() };
      if (patch.name !== undefined) {
        const name = [...String(patch.name ?? "").trim().replace(/\s+/g, " ")].slice(0, PAST_NAME_LEN).join("");
        if (name) m.name = name;
        else delete m.name;
      }
      if (patch.starred !== undefined) {
        if (patch.starred) m.starred = true;
        else delete m.starred;
      }
      if (patch.tags !== undefined) {
        const tags: string[] = [];
        for (const t of Array.isArray(patch.tags) ? patch.tags : []) {
          const c = cleanTag(t);
          if (c && !tags.includes(c)) tags.push(c);
        }
        if (tags.length) m.tags = tags.slice(0, PAST_TAGS_MAX);
        else delete m.tags;
      }
      if (patch.glyph !== undefined) {
        if (patch.glyph && (PAST_GLYPHS as readonly string[]).includes(patch.glyph)) m.glyph = patch.glyph;
        else delete m.glyph;
      }
      if (patch.tint !== undefined) {
        if (patch.tint && (PAST_TINTS as readonly string[]).includes(patch.tint)) m.tint = patch.tint;
        else delete m.tint;
      }
      const empty = !m.name && !m.starred && !m.tags && !m.glyph && !m.tint;
      all[persona] ??= {};
      if (empty) delete all[persona]![taskId];
      else all[persona]![taskId] = m;
      save();
      return empty ? undefined : structuredClone(m);
    },
    tags(persona) {
      const n = new Map<string, number>();
      for (const m of Object.values(all[persona] ?? {})) for (const t of m.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
      return [...n].map(([tag, k]) => ({ tag, n: k })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
    },
  };
}

// ---------- the picture Ducter draws when the person chose none ----------

const KIND_WORDS: [PastGlyph, RegExp][] = [
  ["errand", /\b(book|order|buy|hotel|flight|reserve|grocer)|订|买|酒店|机票|预约|预订|外卖/i],
  ["talk", /\b(call|phone|reply|email|message|slack|telegram)\b|电话|打给|回复|邮件|消息/i],
  ["ship", /\b(release|deploy|ship|publish|tag v?\d|rollout)|发布|上线|发版|部署/i],
  ["fix", /\b(fix|bug|flaky|crash|broken|regress|error|fail|panic|leak)|修|报错|崩|失败|不稳定|故障|泄漏/i],
  ["review", /\b(review|audit|pr #?\d|code review)|审|评审|看看.{0,6}(pr|改动)/i],
  ["look", /\b(investigate|why|research|explore|look into|find out|figure out|compare|profil)|查|调查|为什么|研究|排查|对比|摸清/i],
  ["data", /\b(data|chart|metric|benchmark|csv|sql|report|stats?)\b|数据|统计|报表|基准|压测/i],
  ["write", /\b(write|doc|draft|blog|readme|post|copy|translate)|写|文档|文章|翻译|草稿/i],
  ["idea", /\b(idea|plan|design|brainstorm|proposal|spec)\b|想法|方案|设计|规划|计划/i],
];

/** The kind of work a task reads as, from its own words (deterministic); "build" when nothing says. */
export function kindOf(title: string, brief = ""): PastGlyph {
  const t = `${title}\n${brief.slice(0, 300)}`;
  for (const [k, re] of KIND_WORDS) if (re.test(title)) return k;
  for (const [k, re] of KIND_WORDS) if (re.test(t)) return k;
  return "build";
}

// ---------- time words ----------

const DAY = 24 * 3600_000;
const ZH_DAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const EN_DAY: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Monday 00:00 of the week holding ms. */
const startOfWeek = (ms: number) => {
  const d = new Date(startOfDay(ms));
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.getTime();
};
const addDays = (ms: number, n: number) => {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

/** Time words in a query, as a date range on when a task was last worked on; rest: the words left. */
export function timeWords(q: string, now: number): { since: number; before: number; words: string; rest: string } | undefined {
  const today = startOfDay(now);
  const tries: [RegExp, (m: RegExpMatchArray) => [number, number] | undefined][] = [
    [/上(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/, (m) => {
      const d = addDays(startOfWeek(now), -7 + ((ZH_DAY[m[1]!]! + 6) % 7));
      return [d, addDays(d, 1)];
    }],
    [/(?:这|本)(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/, (m) => {
      const d = addDays(startOfWeek(now), (ZH_DAY[m[1]!]! + 6) % 7);
      return [d, addDays(d, 1)];
    }],
    [/\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/i, (m) => {
      const want = EN_DAY[m[1]!.toLowerCase()]!;
      let d = addDays(today, -1);
      while (new Date(d).getDay() !== want) d = addDays(d, -1);
      return [d, addDays(d, 1)];
    }],
    [/(?<![上下这本个])(?:周|星期|礼拜)([一二三四五六日天])/, (m) => {
      const want = ZH_DAY[m[1]!]!;
      let d = today;
      while (new Date(d).getDay() !== want) d = addDays(d, -1);
      return [d, addDays(d, 1)];
    }],
    [/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (m) => {
      const want = EN_DAY[m[1]!.toLowerCase()]!;
      let d = today;
      while (new Date(d).getDay() !== want) d = addDays(d, -1);
      return [d, addDays(d, 1)];
    }],
    [/今天|\btoday\b/i, () => [today, addDays(today, 1)]],
    [/大前天/, () => [addDays(today, -3), addDays(today, -2)]],
    [/前天|\bday before yesterday\b/i, () => [addDays(today, -2), addDays(today, -1)]],
    [/昨天|\byesterday\b/i, () => [addDays(today, -1), today]],
    [/上(?:个)?(?:周|星期|礼拜)|\blast week\b/i, () => [addDays(startOfWeek(now), -7), startOfWeek(now)]],
    [/(?:这|本)(?:个)?(?:周|星期|礼拜)|\bthis week\b/i, () => [startOfWeek(now), addDays(today, 1)]],
    [/上(?:个)?月|\blast month\b/i, () => {
      const d = new Date(today);
      const end = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), end];
    }],
    [/(?:这|本)(?:个)?月|\bthis month\b/i, () => {
      const d = new Date(today);
      return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), addDays(today, 1)];
    }],
    [/(?:最近|过去)\s*(\d{1,3})\s*天|\b(?:past|last)\s+(\d{1,3})\s+days?\b/i, (m) => [addDays(today, -Number(m[1] ?? m[2]) + 1), addDays(today, 1)]],
    [/(\d{1,3})\s*天前|\b(\d{1,3})\s+days?\s+ago\b/i, (m) => {
      const d = addDays(today, -Number(m[1] ?? m[2]));
      return [d, addDays(d, 1)];
    }],
    [/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/, (m) => {
      const y = new Date(today).getFullYear();
      let d = new Date(y, Number(m[1]) - 1, Number(m[2])).getTime();
      if (d > now) d = new Date(y - 1, Number(m[1]) - 1, Number(m[2])).getTime();
      return [d, addDays(d, 1)];
    }],
  ];
  for (const [re, f] of tries) {
    const m = q.match(re);
    if (!m) continue;
    const r = f(m);
    if (!r) continue;
    return { since: r[0], before: r[1], words: m[0].trim(), rest: q.replace(m[0], " ").replace(/\s+/g, " ").trim() };
  }
  return undefined;
}

// ---------- the index ----------

/** What one task is findable by. */
interface Doc {
  taskId: string;
  brief: string;
  words: string[]; // the person's own words sent into it
  reports: string[]; // its report summaries, oldest first
  said: string; // the agent's words, capped
  files: string[];
  from?: string;
}

const SAID_CAP = 12_000;
const FILES_CAP = 300;
const PATH_KEYS = ["file_path", "path", "notebook_path", "filePath", "file"];

/** Words that say "find" or "a task" and nothing about which one. */
const STOP = new Set(
  "the a an that this those these one ones task tasks thing where we i my me you show find everything all about did do done with in on for of to and or it its was were is from by at which what when last".split(" "),
);
const ZH_STOP = /^(那个|那件|那次|这个|那些|所有|全部|关于|有关|的|了|我|我们|你|把|一下|任务|事情|事|找|找到|看看|之前|以前|上次|做的|做过的|相关|一切|东西)+$/;
const ZH_STRIP = /(那个|那件|那次|我们|我的|有关|关于|所有|全部|相关的|相关|的事|的任务|任务|事情|一下|之前|上次|以前|做过的|做的|找出|找到|找)/g;

/** The words of a query, lowercased; stop words out; CJK runs cleaned of filler. */
export function queryTerms(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().replace(/'s\b/g, "").split(/[\s,，。、;；:："'“”‘’()（）!！?？]+/)) {
    if (!raw) continue;
    if (CJK.test(raw)) {
      // Mixed runs: split CJK from Latin ("flaky测试" → "flaky", "测试").
      for (const part of raw.split(/(?<=[㐀-鿿])(?=[a-z0-9])|(?<=[a-z0-9])(?=[㐀-鿿])/)) {
        if (!CJK.test(part)) {
          if (part && !STOP.has(part)) out.push(part);
          continue;
        }
        if (ZH_STOP.test(part)) continue;
        for (const piece of part.replace(ZH_STRIP, " ").split(/\s+/)) {
          const p = piece.replace(/^的+|的+$/g, "");
          if (p && !ZH_STOP.test(p)) out.push(p);
        }
      }
    } else if (!STOP.has(raw)) {
      out.push(raw.replace(/^#/, ""));
    }
  }
  return [...new Set(out)].filter((x) => x && (CJK.test(x) || x.length > 1));
}

const WEIGHT: Record<PastField, number> = { name: 6, title: 5, tag: 5, branch: 4, project: 4, file: 3, words: 3, agent: 2.5, report: 2.5, brief: 2 };

const bigrams = (s: string) => {
  const c = [...s];
  const out: string[] = [];
  for (let i = 0; i + 1 < c.length; i++) out.push(c[i]! + c[i + 1]!);
  return out;
};

/** How well a term matches a text: 1 whole word or CJK substring, 0.75 inside a word, scaled by the share of CJK bigrams (half or more), else 0. */
function termIn(term: string, text: string): { s: number; at: number } {
  if (!text) return { s: 0, at: -1 };
  const at = text.indexOf(term);
  if (at >= 0) {
    if (CJK.test(term)) return { s: 1, at };
    const before = at === 0 ? "" : text[at - 1]!;
    const after = text[at + term.length] ?? "";
    const edge = (c: string) => !c || !/[a-z0-9]/.test(c);
    return { s: edge(before) ? (edge(after) ? 1 : 0.85) : 0.6, at };
  }
  if (CJK.test(term) && [...term].length >= 3) {
    const bs = bigrams(term);
    let hit = 0;
    let first = -1;
    for (const b of bs) {
      const i = text.indexOf(b);
      if (i >= 0) (hit++, first < 0 && (first = i));
    }
    if (hit / bs.length >= 0.5) return { s: 0.7 * (hit / bs.length), at: first };
  }
  return { s: 0, at: -1 };
}

/** A short piece of text around at, for the card's "why it came up" line. */
function snippet(text: string, at: number, len: number): string {
  const flat = text.replace(/\s+/g, " ");
  if (flat.length <= 72) return flat;
  const start = Math.max(0, Math.min(at - 24, flat.length - 72));
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + 72).trim()}${start + 72 < flat.length ? "…" : ""}`;
}

export interface PastDeps {
  log: LogStore;
  tasks: TaskRegistry;
  marks: Marks;
  /** A worker's name by its device id ("local" / absent: the home, no name). */
  computerName?: (device: string) => string | undefined;
  now?: () => number;
}

export interface Past {
  query(persona: string, q: PastQuery): { items: PastItem[]; total: number; facets: PastFacets; suggestions: string[]; range?: { since: string; before: string; words: string } };
  item(taskId: string): PastItem | undefined;
  /** D285: what a new task opened from this one carries, put after the person's words. */
  seed(taskId: string, words: string, zh: boolean): string;
}

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

export function createPast(d: PastDeps): Past {
  const now = d.now ?? Date.now;
  const docs = new Map<string, Doc>();
  let built = false;
  const docOf = (taskId: string): Doc => {
    let doc = docs.get(taskId);
    if (!doc) docs.set(taskId, (doc = { taskId, brief: "", words: [], reports: [], said: "", files: [] }));
    return doc;
  };
  const apply = (e: LogEvent) => {
    if (e.kind === "task_open") {
      const b = e.body as Bodies["task_open"];
      const doc = docOf(b.taskId);
      if (b.brief) doc.brief = b.brief;
      if (b.from) doc.from = b.from;
    } else if (e.kind === "report") {
      const b = e.body as Bodies["report"];
      if (b.summary) docOf(b.taskId).reports.push(b.summary);
    } else if (e.kind === "checkpoint") {
      const b = e.body as Bodies["checkpoint"];
      if (b.text) docOf(b.taskId).reports.push(b.text);
    } else if (e.kind === "task_event") {
      const b = e.body as Bodies["task_event"];
      if (!b.taskId) return;
      const doc = docOf(b.taskId);
      if (b.role === "user" && b.from === "user" && b.text) doc.words.push(b.text);
      else if (b.role === "assistant" && b.text && doc.said.length < SAID_CAP) doc.said += `\n${b.text.slice(0, SAID_CAP - doc.said.length)}`;
      else if (b.role === "tool" && b.tool?.input && typeof b.tool.input === "object" && doc.files.length < FILES_CAP) {
        const inp = b.tool.input as Record<string, unknown>;
        for (const k of PATH_KEYS) {
          const v = inp[k];
          if (typeof v === "string" && v.length < 400 && /[/.]/.test(v) && !doc.files.includes(v)) doc.files.push(v);
        }
      }
    }
  };
  const build = () => {
    if (built) return;
    built = true;
    for (const e of d.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_open", "report", "checkpoint", "task_event"] })) apply(e);
    d.log.subscribe((e) => {
      if (e.kind === "task_open" || e.kind === "report" || e.kind === "checkpoint" || e.kind === "task_event") apply(e);
    });
  };

  const itemOf = (c: TaskCard): PastItem => {
    const doc = docs.get(c.taskId);
    const mark = d.marks.get(c.persona, c.taskId);
    const own = c.original ?? c.title;
    const dev = "device" in c.place ? c.place.device : undefined;
    const computer = dev && dev !== "local" ? d.computerName?.(dev) ?? dev : undefined;
    const outcome = (c.lastReport?.summary ?? "").split("\n").find((l) => l.trim())?.trim();
    const from = doc?.from ?? c.from?.taskId;
    const fromCard = from ? d.tasks.get(from) : undefined;
    return {
      taskId: c.taskId,
      title: mark?.name ?? own,
      ...(mark?.name && mark.name !== own ? { original: own } : {}),
      project: c.project,
      harness: c.harness,
      ...(c.model ? { model: c.model } : {}),
      ...(computer ? { computer } : {}),
      openedAt: c.openedAt,
      updatedAt: c.updatedAt,
      attention: c.attention,
      ...(outcome ? { outcome: outcome.length > 160 ? `${outcome.slice(0, 159)}…` : outcome } : {}),
      ...(c.changes ? { changes: c.changes } : c.lastReport?.branch?.adds !== undefined ? { changes: { files: c.lastReport.branch.files ?? 0, adds: c.lastReport.branch.adds ?? 0, dels: c.lastReport.branch.dels ?? 0, at: c.updatedAt } } : {}),
      ...(c.place.kind === "repo" && c.place.branch ? { branch: c.place.branch } : {}),
      ...(c.integrated ? { integrated: { act: c.integrated.act, ...(c.integrated.ref ? { ref: c.integrated.ref } : {}) } } : {}),
      kind: kindOf(own, doc?.brief),
      ...(mark ? { mark } : {}),
      ...(from && fromCard ? { from: { taskId: from, title: fromCard.title } } : {}),
    };
  };

  /** The fields of one task, lowercased, in the order a hit is reported. */
  const fieldsOf = (c: TaskCard, it: PastItem): [PastField, string][] => {
    const doc = docs.get(c.taskId);
    const out: [PastField, string][] = [];
    if (it.mark?.name) out.push(["name", it.mark.name.toLowerCase()]);
    out.push(["title", (it.original ?? (it.mark?.name ? "" : it.title)).toLowerCase() || (c.original ?? c.title).toLowerCase()]);
    if (it.mark?.tags?.length) out.push(["tag", it.mark.tags.join(" · ")]);
    if (it.branch || it.integrated?.ref) out.push(["branch", `${it.branch ?? ""} ${it.integrated?.ref ?? ""}`.toLowerCase()]);
    out.push(["project", `${c.project} ${"repoPath" in c.place ? c.place.repoPath : "path" in c.place ? (c.place as { path: string }).path : ""}`.toLowerCase()]);
    if (doc?.files.length) out.push(["file", doc.files.join("\n").toLowerCase()]);
    if (doc?.words.length) out.push(["words", doc.words.join("\n").toLowerCase()]);
    out.push(["agent", `${c.harness} ${harnessName(c.harness)} ${c.model ?? ""} ${it.computer ?? ""}`.toLowerCase()]);
    if (doc?.reports.length) out.push(["report", doc.reports.join("\n").toLowerCase()]);
    if (doc?.brief) out.push(["brief", doc.brief.toLowerCase()]);
    if (doc?.said) out.push(["report", doc.said.toLowerCase()]);
    return out;
  };
  // The display text (original case) a hit's snippet is cut from.
  const shownText = (c: TaskCard, it: PastItem, f: PastField): string => {
    const doc = docs.get(c.taskId);
    switch (f) {
      case "name":
        return it.mark?.name ?? "";
      case "title":
        return it.original ?? it.title;
      case "tag":
        return (it.mark?.tags ?? []).join(" · ");
      case "branch":
        return `${it.branch ?? ""} ${it.integrated?.ref ?? ""}`.trim();
      case "project":
        return c.project;
      case "file":
        return doc?.files.join("\n") ?? "";
      case "words":
        return doc?.words.join("\n") ?? "";
      case "agent":
        return `${harnessName(c.harness)}${c.model ? ` · ${c.model}` : ""}${it.computer ? ` · ${it.computer}` : ""}`;
      case "report":
        return [...(doc?.reports ?? []), doc?.said ?? ""].join("\n");
      case "brief":
        return doc?.brief ?? "";
      default:
        return "";
    }
  };

  return {
    query(persona, q) {
      build();
      const t = now();
      const raw = String(q.q ?? "").trim().slice(0, 200);
      const tw = raw ? timeWords(raw, t) : undefined;
      const terms = queryTerms(tw ? tw.rest : raw);
      const since = Math.max(tw?.since ?? -Infinity, q.since ? Date.parse(q.since) : -Infinity);
      const before = Math.min(tw?.before ?? Infinity, q.before ? Date.parse(q.before) : Infinity);
      const all = d.tasks.list().filter((c) => c.persona === persona || !persona);
      const facets: PastFacets = { projects: [], harnesses: [], tags: d.marks.tags(persona) };
      const pn = new Map<string, number>();
      const hn = new Map<string, number>();
      for (const c of all) pn.set(c.project, (pn.get(c.project) ?? 0) + 1), hn.set(c.harness, (hn.get(c.harness) ?? 0) + 1);
      facets.projects = [...pn].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
      facets.harnesses = [...hn].map(([harness, n]) => ({ harness, n })).sort((a, b) => b.n - a.n);
      const browsing = !terms.length && !tw && !q.tag && !q.starred && !q.project && !q.harness && !q.since && !q.before;
      const scored: { it: PastItem; score: number; at: number }[] = [];
      const loose: { it: PastItem; score: number; at: number; n: number }[] = [];
      for (const c of all) {
        const at = Date.parse(c.updatedAt);
        const opened = Date.parse(c.openedAt);
        // A date range holds a task worked on in it: opened before its end and touched after its start.
        if (!(opened < before && at >= since)) continue;
        if (q.project !== undefined && q.project !== null && c.project !== q.project) continue;
        if (q.harness && c.harness !== q.harness) continue;
        const it = itemOf(c);
        if (q.starred && !it.mark?.starred) continue;
        if (q.tag && !it.mark?.tags?.includes(cleanTag(q.tag))) continue;
        // Browsing (no words, no filter): what is done; what is still on hand lives in On hand.
        if (browsing && ACTIVE.has(c.attention) && !it.mark?.starred) continue;
        const ageDays = Math.max(0, (t - at) / DAY);
        const fresh = 1 + 0.35 * Math.exp(-ageDays / 21);
        if (!terms.length) {
          scored.push({ it, score: fresh * (it.mark?.starred ? 1.2 : 1), at });
          continue;
        }
        const fields = fieldsOf(c, it);
        let score = 0;
        let matched = 0;
        // The field that explains the most of the words is the one the card says it matched in.
        const per = fields.map(() => ({ w: 0, at: -1 }));
        for (const term of terms) {
          let top = 0;
          for (const [i, [f, text]] of fields.entries()) {
            const m = termIn(term, text);
            if (!m.s) continue;
            const w = (WEIGHT[f] ?? 1) * m.s;
            if (w > top) top = w;
            per[i]!.w += w;
            if (per[i]!.at < 0) per[i]!.at = m.at;
          }
          if (top > 0) matched++;
          score += top;
        }
        if (!matched) continue;
        let bi = -1;
        // What the card already shows (its tags, project, agent) is never the "why" line.
        const SEEN = new Set<PastField>(["tag", "project", "agent"]);
        for (const [i, p] of per.entries()) if (p.w > 0 && !SEEN.has(fields[i]![0]) && (bi < 0 || p.w > per[bi]!.w)) bi = i;
        const best = bi >= 0 ? { f: fields[bi]![0], at: per[bi]!.at } : undefined;
        score *= fresh * (it.mark?.starred ? 1.15 : 1);
        if (best) {
          const shown = shownText(c, it, best.f);
          const head = best.f === "title" || (best.f === "name" && !it.original);
          if (!head && shown) {
            let text: string;
            if (best.f === "file" || best.f === "words" || best.f === "report") {
              // The line that matched, not the whole field.
              const lines = shown.split("\n");
              const lower = lines.map((l) => l.toLowerCase());
              const term = terms.find((x) => lower.some((l) => l.includes(x)));
              const i = term ? lower.findIndex((l) => l.includes(term)) : 0;
              const line = lines[Math.max(0, i)] ?? "";
              text = snippet(line, term ? line.toLowerCase().indexOf(term) : 0, 72);
            } else text = snippet(shown, Math.max(0, best.at), 72);
            if (text.trim()) it.hit = { field: best.f, text };
          }
        }
        if (matched === terms.length) scored.push({ it, score, at });
        else loose.push({ it, score: score * (matched / terms.length), at, n: matched });
      }
      // Every word somewhere first; when nothing has them all, the closest (most words) instead.
      let list = scored;
      if (!list.length && loose.length) list = loose.filter((x) => x.n === Math.max(...loose.map((y) => y.n)));
      list.sort((a, b) => (terms.length ? b.score - a.score : 0) || b.at - a.at);
      const limit = Math.max(1, Math.min(Number(q.limit) || 200, 500));
      const suggestions = [...new Set([...facets.tags.map((x) => x.tag), ...facets.projects.filter((p) => p.name).map((p) => p.name.toLowerCase())])].slice(0, 12);
      return {
        items: list.slice(0, limit).map((x) => x.it),
        total: list.length,
        facets,
        suggestions,
        ...(tw ? { range: { since: new Date(tw.since).toISOString(), before: new Date(tw.before).toISOString(), words: tw.words } } : {}),
      };
    },
    item(taskId) {
      build();
      const c = d.tasks.get(taskId);
      return c ? itemOf(c) : undefined;
    },
    seed(taskId, words, zh) {
      build();
      const c = d.tasks.get(taskId);
      if (!c) return words;
      const doc = docs.get(taskId);
      const it = itemOf(c);
      const date = new Date(c.updatedAt).toISOString().slice(0, 10);
      const reports = (doc?.reports ?? []).slice(-3).reverse();
      const files = (doc?.files ?? []).slice(-12);
      const lines: string[] = [];
      if (zh) {
        lines.push(`这件事接着之前的一件：「${it.title}」（${date}，${harnessName(c.harness)}${c.project ? `，${c.project}` : ""}）。它当时发现和做到的：`);
        if (reports.length) for (const r of reports) lines.push(`- ${r.replace(/\s+/g, " ").slice(0, 600)}`);
        else lines.push("- 它没有留下报告。");
        if (it.branch) lines.push(`它的分支：${it.branch}${it.integrated?.act === "merge" ? "（已合并）" : ""}`);
        if (files.length) lines.push(`它动过的文件：${files.join("、")}`);
        lines.push("先用这些，不必从头再查一遍；需要时自己核对一下现在的样子。");
      } else {
        lines.push(`This picks up from an earlier task: "${it.title}" (${date}, ${harnessName(c.harness)}${c.project ? `, ${c.project}` : ""}). What it found and did:`);
        if (reports.length) for (const r of reports) lines.push(`- ${r.replace(/\s+/g, " ").slice(0, 600)}`);
        else lines.push("- It left no report.");
        if (it.branch) lines.push(`Its branch: ${it.branch}${it.integrated?.act === "merge" ? " (merged)" : ""}`);
        if (files.length) lines.push(`Files it touched: ${files.join(", ")}`);
        lines.push("Start from this rather than finding it all again; check how things stand now where it matters.");
      }
      return `${words.trim()}\n\n---\n${lines.join("\n")}`;
    },
  };
}
