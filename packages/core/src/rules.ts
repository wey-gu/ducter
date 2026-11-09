// 你的规则 / Your rules (D89): who does which kind of work, said in the conversation and kept
// here (rules.json in the data folder). The partner saves one with its rule_save tool after it
// restated the rule and the person agreed; the Partner page lists them and removes them (不要这条
// / Remove). There is no rule editor: a rule is added only by saying it.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { isHarnessId, type RuleView } from "@ducter/protocol";

export const RULES_FILE = "rules.json";
const MAX_RULES = 50;

export interface RulesStore {
  list(): RuleView[];
  add(r: { text: string; harness: string; model?: string; match: string[] }): RuleView;
  remove(id: string): boolean;
  onChange(fn: () => void): () => void;
}

export function openRules(dataDir: string, now: () => Date = () => new Date()): RulesStore {
  const path = join(dataDir, RULES_FILE);
  let rules: RuleView[] = [];
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(raw?.rules)) rules = raw.rules.filter((r: RuleView) => r && typeof r.id === "string" && typeof r.text === "string" && isHarnessId(r.harness));
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
    list: () => rules.map((r) => ({ ...r, match: [...r.match] })),
    add(r) {
      if (!isHarnessId(r.harness)) throw new Error(`unknown AI agent ${r.harness}`);
      const text = r.text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!text) throw new Error("a rule needs its words");
      const match = [...new Set(r.match.map((m) => String(m).trim().toLowerCase()).filter((m) => m.length > 0 && m.length <= 40))].slice(0, 16);
      if (!match.length) throw new Error("a rule needs at least one word that marks the kind of work");
      // The same kind of work said again: the newer rule replaces the older one (newest wins).
      rules = rules.filter((x) => !x.match.some((m) => match.includes(m)));
      const rule: RuleView = { id: `rule_${randomBytes(5).toString("hex")}`, text, harness: r.harness, ...(r.model ? { model: r.model } : {}), match, createdAt: now().toISOString() };
      rules = [...rules, rule].slice(-MAX_RULES);
      save();
      return { ...rule };
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

/** The rule that covers this work, if any: the newest whose words appear in the title or brief. */
export function ruleFor(rules: RuleView[], work: { title: string; brief?: string }): RuleView | undefined {
  const hay = `${work.title}\n${work.brief ?? ""}`.toLowerCase();
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i]!;
    if (r.match.some((m) => hasWord(hay, m))) return r;
  }
  return undefined;
}

/** A Latin word matches whole words only ("ui" is not in "build"); other scripts match as written. */
function hasWord(hay: string, word: string): boolean {
  if (!/^[\x00-\x7f]+$/.test(word)) return hay.includes(word);
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay);
}
