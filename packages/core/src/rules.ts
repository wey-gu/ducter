// 你的规则 / Your rules (D89): who does which kind of work, said in the conversation and kept
// here (rules.json in the data folder). The partner saves one with its rule_save tool after it
// restated the rule and the person agreed; the Partner page lists them and removes them (不要这条
// / Remove). There is no rule editor: a rule is added only by saying it.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { isHarnessId, isWorkKind, type RuleView, type WorkKind } from "@ducter/protocol";

export const RULES_FILE = "rules.json";
const MAX_RULES = 50;

export interface RulesStore {
  list(): RuleView[];
  /** D370: kinds: the kinds of work it covers; never: never this agent (model) for that work. */
  add(r: { text: string; harness: string; model?: string; match: string[]; device?: string; kinds?: string[]; never?: boolean }): RuleView;
  /** D165: a rule about what it tells the person (这类不用告诉我, or a kind that may wake them). */
  addNotice(r: { text: string; kind: string; sender?: string; wake?: boolean }): RuleView;
  remove(id: string): boolean;
  onChange(fn: () => void): () => void;
}

export function openRules(dataDir: string, now: () => Date = () => new Date()): RulesStore {
  const path = join(dataDir, RULES_FILE);
  let rules: RuleView[] = [];
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(raw?.rules)) rules = raw.rules.filter((r: RuleView) => r && typeof r.id === "string" && typeof r.text === "string" && (isHarnessId(r.harness) || (r.notice && typeof r.notice.kind === "string")));
    } catch (err) {
      console.warn(`[rules] ${path} is unreadable; starting with none:`, (err as Error).message);
    }
  }
  const listeners = new Set<() => void>();
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ rules }, null, 2) + "\n", { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
    listeners.forEach((fn) => fn());
  };
  return {
    list: () => rules.map((r) => ({ ...r, match: [...r.match], ...(r.kinds ? { kinds: [...r.kinds] } : {}) })),
    add(r) {
      if (!isHarnessId(r.harness)) throw new Error(`unknown AI agent ${r.harness}`);
      const text = r.text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!text) throw new Error("a rule needs its words");
      const match = [...new Set(r.match.map((m) => String(m).trim().toLowerCase()).filter((m) => m.length > 0 && m.length <= 40))].slice(0, 16);
      const kinds = [...new Set((r.kinds ?? []).filter(isWorkKind))];
      if (!match.length && !kinds.length) throw new Error("a rule needs a kind of work or at least one word that marks it");
      const never = r.never === true;
      const overlaps = (x: RuleView) => x.match.some((m) => match.includes(m)) || (x.kinds ?? []).some((k) => kinds.includes(k));
      // The same kind of work said again: the newer rule replaces the older one (newest wins). D370:
      // a "never" rule replaces an older one for the same agent, and a rule that sends this work to
      // the agent it now rules out; a rule that sends it somewhere replaces the older one and any
      // "never" for the agent it now names.
      rules = rules.filter((x) => {
        if (x.notice || !overlaps(x)) return true;
        if (never) return !(x.harness === r.harness && (x.never || !x.model || !r.model || x.model === r.model));
        return x.never ? x.harness !== r.harness : false;
      });
      const device = r.device?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);
      const rule: RuleView = { id: `rule_${randomBytes(5).toString("hex")}`, text, harness: r.harness, ...(r.model ? { model: r.model } : {}), match, ...(kinds.length ? { kinds } : {}), ...(never ? { never: true as const } : {}), createdAt: now().toISOString(), ...(device && !never ? { device } : {}) };
      rules = [...rules, rule].slice(-MAX_RULES);
      save();
      return { ...rule };
    },
    addNotice(r) {
      const text = r.text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!text) throw new Error("a rule needs its words");
      const sender = r.sender?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || undefined;
      const notice = { kind: r.kind, ...(sender ? { sender } : {}), ...(r.wake ? { wake: true } : {}) };
      // The same kind (and sender) said again replaces the older rule.
      rules = rules.filter((x) => !(x.notice && x.notice.kind === notice.kind && (x.notice.sender ?? "") === (notice.sender ?? "") && Boolean(x.notice.wake) === Boolean(notice.wake)));
      const rule: RuleView = { id: `rule_${randomBytes(5).toString("hex")}`, text, harness: "", match: [], createdAt: now().toISOString(), notice };
      rules = [...rules, rule].slice(-MAX_RULES);
      save();
      return { ...rule, notice: { ...notice } };
    },
    remove(id) {
      const before = rules.length;
      rules = rules.filter((r) => r.id !== id);
      if (rules.length === before) return false;
      save();
      return true;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The work a rule is matched against: its words, and (D370) its kind of work. */
export interface RuleWork {
  title: string;
  brief?: string;
  kind?: WorkKind;
}

/** Whether a rule covers this work: by its words ("word"), or by its kind of work ("kind"). */
function covers(r: RuleView, w: RuleWork, hay: string): "word" | "kind" | undefined {
  if (r.match.some((m) => hasWord(hay, m))) return "word";
  if (w.kind && r.kinds?.includes(w.kind)) return "kind";
  return undefined;
}

/**
 * The rule that sends this work to an agent, if any: the newest whose words appear in the title
 * or brief; else (D370) the newest that names its kind of work. Words are the more specific.
 */
export function ruleFor(rules: RuleView[], work: RuleWork): RuleView | undefined {
  const hay = `${work.title}\n${work.brief ?? ""}`.toLowerCase();
  let byKind: RuleView | undefined;
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i]!;
    if (r.notice || r.never) continue;
    const c = covers(r, work, hay);
    if (c === "word") return r;
    if (c === "kind") byKind ??= r;
  }
  return byKind;
}

/** D370: the rules that say never an agent (or one of its models) for this work. */
export function neverFor(rules: RuleView[], work: RuleWork): RuleView[] {
  const hay = `${work.title}\n${work.brief ?? ""}`.toLowerCase();
  return rules.filter((r) => r.never && !r.notice && covers(r, work, hay));
}

/** D370: whether a never rule rules out this agent and model. */
export const rulesOut = (r: RuleView, t: { harness: string; model?: string }) => r.harness === t.harness && (!r.model || r.model === t.model);

/** A Latin word matches whole words only ("ui" is not in "build"); other scripts match as written. */
function hasWord(hay: string, word: string): boolean {
  if (!/^[\x00-\x7f]+$/.test(word)) return hay.includes(word);
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay);
}
