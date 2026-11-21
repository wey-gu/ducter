// research/178: what the person types into 想交给 Ducter 哪些？ / What should Ducter take on?, and which
// of the pile each one means (the gold, by the pile's facts and its hidden topic). The first two are the
// author's own sentences on 0.1.1, word for word.
import { NOW, type EvalItem } from "./pile.ts";

const DAY = 86_400_000;
const bug = (p: EvalItem) => (p.item.labels ?? []).some((l) => l === "type/bug" || l === "bug");
const within = (iso: string | undefined, days: number) => !!iso && Date.parse(iso) >= NOW - days * DAY;

export interface Sentence {
  id: string;
  lang: "zh" | "en";
  words: string;
  gold: (p: EvalItem) => boolean;
  /** Nothing should be ticked: a name the pile doesn't have (and the closest login said). */
  unknown?: string;
  /** The how-note the words carry, as said. */
  note?: string;
  /** D454: to-dos already handed over (their task failed): shown in their own group, never ticked, never dropped. */
  handed?: string[];
  /** D454: the one login a name one edit away is read as. */
  guess?: string;
  /** D454: words that must not be in the about chip (the note's). */
  notInAbout?: string;
}

export const SENTENCES: Sentence[] = [
  { id: "author-1", lang: "zh", words: "100gle 分配给我的 UI/UX 的问题走查的修改 task", gold: (p) => p.item.author === "100gle" },
  { id: "author-2", lang: "zh", words: "100gle 分配给我的那些他 UI 走查发现的问题", gold: (p) => p.item.author === "100gle" },
  { id: "person-opened", lang: "zh", words: "100gle 提的", gold: (p) => p.item.author === "100gle" },
  { id: "person-assigned-bug", lang: "zh", words: "QingZ11 分给我的 bug", gold: (p) => p.item.assignedBy === "QingZ11" && bug(p) },
  { id: "person-issue", lang: "zh", words: "hawkingrei 提的 issue", gold: (p) => p.item.author === "hawkingrei" },
  { id: "mine-topic", lang: "zh", words: "我自己提的关于蒸馏的", gold: (p) => p.item.author === "wey-gu" && p.topic === "distill" },
  { id: "time-topic", lang: "zh", words: "最近一周提的 Windows 问题", gold: (p) => within(p.item.createdAt, 7) && p.topic === "windows" },
  { id: "repo", lang: "zh", words: "mem-feedback 里的", gold: (p) => p.item.where === "nowledge-co/mem-feedback" },
  { id: "repo-topic", lang: "zh", words: "community 仓库里关于搜索的问题", gold: (p) => p.item.where === "nowledge-co/community" && p.topic === "search" },
  { id: "refs", lang: "zh", words: "#10559 和 #10482", gold: (p) => p.item.label === "#10559" || p.item.label === "#10482" },
  { id: "topic-note", lang: "zh", words: "关于记忆蒸馏的，先别动数据库", gold: (p) => p.topic === "distill", note: "先别动数据库" },
  { id: "topic-where", lang: "zh", words: "Windows 新界面的问题，验证都去 haswell 上跑", gold: (p) => p.topic === "windows", note: "验证都去 haswell 上跑" },
  { id: "en-person-topic", lang: "en", words: "issues opened by QingZ11 about search", gold: (p) => p.item.author === "QingZ11" && p.topic === "search" },
  { id: "en-assigned-by", lang: "en", words: "everything assigned to me by hawkingrei", gold: (p) => p.item.assignedBy === "hawkingrei" },
  { id: "en-label-topic", lang: "en", words: "bugdrop reports about the desktop app", gold: (p) => p.item.author === "neonwatty-bugdrop[bot]" && p.topic === "desktop" },
  { id: "en-pr-repo", lang: "en", words: "the PRs in mem", gold: (p) => !!p.item.pr && p.item.where === "nowledge-co/mem" },
  { id: "en-topic-time", lang: "en", words: "distillation issues updated in the last week", gold: (p) => p.topic === "distill" && within(p.item.updatedAt, 7) },
  { id: "time-person", lang: "zh", words: "最近一个月 ThaddeusJiang 提的", gold: (p) => p.item.author === "ThaddeusJiang" && within(p.item.createdAt, 30) },
  { id: "typo", lang: "zh", words: "100gel 提的", gold: () => false, unknown: "100gle" },
  { id: "assigned-topic", lang: "zh", words: "分配给我的关于计费的", gold: (p) => p.topic === "billing" },
  { id: "en-topic-note", lang: "en", words: "the MCP ones, but don't touch the auth code", gold: (p) => p.topic === "mcp", note: "don't touch the auth code" },
  { id: "repo-by-word", lang: "zh", words: "网站仓库里的文档问题", gold: (p) => p.item.where === "nowledge-co/nowledge-labs-website" && p.topic === "docs" },
  { id: "two-people", lang: "zh", words: "negret1986 和 Icemap 提的", gold: (p) => p.item.author === "negret1986" || p.item.author === "Icemap" },
  { id: "en-review", lang: "en", words: "UI review issues from 100gle", gold: (p) => p.item.author === "100gle" },
  { id: "label-said", lang: "zh", words: "技能分享相关的，标签 component/skills-sharing", gold: (p) => (p.item.labels ?? []).includes("component/skills-sharing") },
  { id: "time-model", lang: "zh", words: "上个月以来更新过的会话同步问题", gold: (p) => p.topic === "sync" && within(p.item.updatedAt, 50) },
  { id: "topic-ui", lang: "zh", words: "UI 走查的问题", gold: (p) => p.topic === "ui" },
  { id: "en-topic", lang: "en", words: "everything about sign-in and SSO", gold: (p) => p.topic === "auth" },
  // D454: the author on 0.1.8, word for word (100gle's open ones; #10559 already in a task that failed).
  { id: "author-3", lang: "zh", words: "那些 100gle 分配给我的任务", gold: (p) => p.item.author === "100gle" },
  { id: "author-3-handed", lang: "zh", words: "那些 100gle 分配给我的任务", gold: (p) => p.item.author === "100gle" && p.item.label !== "#10559", handed: ["nowledge-co/mem#10559"] },
  { id: "author-4", lang: "zh", words: "100gle 分配给我", gold: (p) => p.item.author === "100gle" },
  { id: "author-typo", lang: "zh", words: "那些 100gler 分配给我的任务", gold: (p) => p.item.author === "100gle", guess: "100gle" },
  { id: "author-note", lang: "zh", words: "100gle 分配给我的 UI walkthrough，你仔细一起做掉", gold: (p) => p.item.author === "100gle", note: "你仔细一起做掉", notInAbout: "仔细" },
];
