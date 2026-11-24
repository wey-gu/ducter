// 你的规则 / Your rules (D89): who does which kind of work, said in the conversation and kept
// here (rules.json in the data folder). The partner saves one with its rule_save tool after it
// restated the rule and the person agreed; the Partner page lists them and removes them (不要这条
// / Remove). There is no rule editor: a rule is added only by saying it, except (D538) a placement
// rule, which a computer's 关于这台 / About this computer can also add and change (多放 / 少放 this
// computer, for heavy work, web work or all work).
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { isHarnessId, isWorkKind, type Place, type PlaceRule, type RuleView, type TaskNeeds, type WorkKind } from "@ducter/protocol";

export const RULES_FILE = "rules.json";
const MAX_RULES = 50;

export interface RulesStore {
  list(): RuleView[];
  /** D372: kinds: the kinds of work it covers; never: never this agent (model) for that work. */
  add(r: { text: string; harness: string; model?: string; match: string[]; device?: string; kinds?: string[]; never?: boolean }): RuleView;
  /** D165: a rule about what it tells the person (这类不用告诉我, or a kind that may wake them). */
  addNotice(r: { text: string; kind: string; sender?: string; wake?: boolean; kinds?: WorkKind[]; match?: string[] }): RuleView;
  /**
   * D538: a placement rule: prefer (or avoid) a computer for heavy work, web work, or any work (kinds
   * or match narrow it). The same computer and the same work said again replaces the older one (多放
   * turns into 少放); `id` changes that one in place (its 关于这台 / About this computer card).
   */
  addWhere(r: { text: string; device: string; avoid?: boolean; heavy?: boolean; web?: boolean; kinds?: string[]; match?: string[]; id?: string }): RuleView;
  /** D538: the Nowledge Mem memory a placement rule is mirrored to (undefined: no longer). */
  setMem(id: string, mem: string | undefined): void;
  remove(id: string): boolean;
  onChange(fn: () => void): () => void;
}

export function openRules(dataDir: string, now: () => Date = () => new Date()): RulesStore {
  const path = join(dataDir, RULES_FILE);
  let rules: RuleView[] = [];
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(raw?.rules)) rules = raw.rules.filter((r: RuleView) => r && typeof r.id === "string" && typeof r.text === "string" && (isHarnessId(r.harness) || (r.notice && typeof r.notice.kind === "string") || (r.where && typeof r.device === "string" && !!r.device)));
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
    list: () => rules.map((r) => ({ ...r, match: [...r.match], ...(r.kinds ? { kinds: [...r.kinds] } : {}), ...(r.where ? { where: { ...r.where } } : {}) })),
    add(r) {
      if (!isHarnessId(r.harness)) throw new Error(`unknown AI agent ${r.harness}`);
      const text = r.text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!text) throw new Error("a rule needs its words");
      const match = [...new Set(r.match.map((m) => String(m).trim().toLowerCase()).filter((m) => m.length > 0 && m.length <= 40))].slice(0, 16);
      const kinds = [...new Set((r.kinds ?? []).filter(isWorkKind))];
      if (!match.length && !kinds.length) throw new Error("a rule needs a kind of work or at least one word that marks it");
      const never = r.never === true;
      const overlaps = (x: RuleView) => x.match.some((m) => match.includes(m)) || (x.kinds ?? []).some((k) => kinds.includes(k));
      // The same kind of work said again: the newer rule replaces the older one (newest wins). D372:
      // a "never" rule replaces an older one for the same agent, and a rule that sends this work to
      // the agent it now rules out; a rule that sends it somewhere replaces the older one and any
      // "never" for the agent it now names.
      rules = rules.filter((x) => {
        if (x.notice || x.where || !overlaps(x)) return true;
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
      // D437: a 这类不用复查 rule covers kinds of work or words (none: everything).
      const kinds = [...new Set((r.kinds ?? []).filter(isWorkKind))];
      const match = [...new Set((r.match ?? []).map((m) => String(m).trim().toLowerCase()).filter((m) => m.length > 0 && m.length <= 40))].slice(0, 16);
      const sameScope = (x: RuleView) => (x.kinds ?? []).join() === kinds.join() && x.match.join() === match.join();
      // The same kind (and sender, and scope) said again replaces the older rule.
      rules = rules.filter((x) => !(x.notice && x.notice.kind === notice.kind && (x.notice.sender ?? "") === (notice.sender ?? "") && Boolean(x.notice.wake) === Boolean(notice.wake) && sameScope(x)));
      const rule: RuleView = { id: `rule_${randomBytes(5).toString("hex")}`, text, harness: "", match, ...(kinds.length ? { kinds } : {}), createdAt: now().toISOString(), notice };
      rules = [...rules, rule].slice(-MAX_RULES);
      save();
      return { ...rule, match: [...match], ...(kinds.length ? { kinds: [...kinds] } : {}), notice: { ...notice } };
    },
    addWhere(r) {
      const text = r.text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!text) throw new Error("a rule needs its words");
      const device = r.device.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);
      if (!device) throw new Error("a placement rule names its computer");
      const kinds = [...new Set((r.kinds ?? []).filter(isWorkKind))];
      const match = [...new Set((r.match ?? []).map((m) => String(m).trim().toLowerCase()).filter((m) => m.length > 0 && m.length <= 40))].slice(0, 16);
      const where: PlaceRule = { ...(r.avoid ? { avoid: true as const } : {}), ...(r.heavy ? { heavy: true as const } : {}), ...(r.web ? { web: true as const } : {}) };
      const scope = (x: RuleView) => `${x.device?.toLowerCase()}|${x.where?.heavy ? 1 : 0}${x.where?.web ? 1 : 0}|${(x.kinds ?? []).join()}|${x.match.join()}`;
      const at = r.id ? rules.findIndex((x) => x.id === r.id && x.where) : -1;
      const old = at >= 0 ? rules[at]! : undefined;
      const rule: RuleView = {
        id: old?.id ?? `rule_${randomBytes(5).toString("hex")}`,
        text,
        harness: "",
        match,
        ...(kinds.length ? { kinds } : {}),
        createdAt: old?.createdAt ?? now().toISOString(),
        device,
        where: { ...where, ...(old?.where?.mem ? { mem: old.where.mem } : {}) },
      };
      // The same computer and the same work said again: the newer word replaces the older one.
      const mine = scope(rule);
      rules = rules.filter((x) => x.id === rule.id || !(x.where && scope(x) === mine));
      rules = old ? rules.map((x) => (x.id === rule.id ? rule : x)) : [...rules, rule].slice(-MAX_RULES);
      save();
      return { ...rule, match: [...match], where: { ...rule.where } };
    },
    setMem(id, mem) {
      const r = rules.find((x) => x.id === id && x.where);
      if (!r || r.where!.mem === mem) return;
      const { mem: _m, ...rest } = r.where!;
      rules = rules.map((x) => (x === r ? { ...x, where: { ...rest, ...(mem ? { mem } : {}) } } : x));
      save();
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

/** The work a rule is matched against: its words, and (D372) its kind of work. */
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
 * or brief; else (D372) the newest that names its kind of work. Words are the more specific.
 */
export function ruleFor(rules: RuleView[], work: RuleWork): RuleView | undefined {
  const hay = `${work.title}\n${work.brief ?? ""}`.toLowerCase();
  let byKind: RuleView | undefined;
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i]!;
    if (r.notice || r.never || r.where) continue;
    const c = covers(r, work, hay);
    if (c === "word") return r;
    if (c === "kind") byKind ??= r;
  }
  return byKind;
}

/** D372: the rules that say never an agent (or one of its models) for this work. */
export function neverFor(rules: RuleView[], work: RuleWork): RuleView[] {
  const hay = `${work.title}\n${work.brief ?? ""}`.toLowerCase();
  return rules.filter((r) => r.never && !r.notice && !r.where && covers(r, work, hay));
}

/**
 * D538: a placement rule kept from a computer's card, in the person's language, since nobody said it
 * in a sentence: 「构建、测试这类重活多放 haswell」, "Less web work on hel".
 */
export function placeRuleText(lang: string | undefined, device: string, avoid: boolean, work: "heavy" | "web" | "all"): string {
  if ((lang ?? "").toLowerCase().startsWith("zh")) {
    const what = work === "heavy" ? "构建、测试这类重活" : work === "web" ? "上网的活" : "活";
    return `${what}${avoid ? "少放" : "多放"} ${device}`;
  }
  const what = work === "heavy" ? "heavy work (builds, tests)" : work === "web" ? "web work" : "work";
  return `${avoid ? "Less" : "More"} ${what} on ${device}`;
}

/** D538: web work, as a placement rule's "web" means it: a page to read, a sign-in, a purchase, a browser place. */
export const browsesFor = (needs: TaskNeeds | undefined, place?: Place) => !!(needs?.browse || needs?.signedIn || needs?.buy || place?.kind === "browser");

/**
 * D538: the person's placement rules that speak for this work, newest first: heavy ones for heavy
 * work, web ones for web work, the rest for any work (narrowed by their kinds or words, when given).
 * Which work is heavy is the partner's judgment (needs.heavy); this only reads what it recorded.
 */
export function placeRulesFor(rules: RuleView[], work: RuleWork, needs: TaskNeeds | undefined, place?: Place): RuleView[] {
  const hay = `${work.title}\n${work.brief ?? ""}`.toLowerCase();
  const web = browsesFor(needs, place);
  return rules
    .filter((r) => {
      if (!r.where || !r.device) return false;
      const shaped = !!(r.where.heavy || r.where.web);
      if (shaped && !((r.where.heavy && needs?.heavy) || (r.where.web && web))) return false;
      if (r.match.length || r.kinds?.length) return !!covers(r, work, hay);
      return true;
    })
    .reverse();
}

/** D372: whether a never rule rules out this agent and model. */
export const rulesOut = (r: RuleView, t: { harness: string; model?: string }) => r.harness === t.harness && (!r.model || r.model === t.model);

/** A Latin word matches whole words only ("ui" is not in "build"); other scripts match as written. */
function hasWord(hay: string, word: string): boolean {
  if (!/^[\x00-\x7f]+$/.test(word)) return hay.includes(word);
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay);
}
