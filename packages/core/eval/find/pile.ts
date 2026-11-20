// research/178: a pile shaped like the author's real one (hel, read only, 2026-11-20; GitHub's own
// numbers for who assigned what): 557 open, assigned to wey-gu, across nowledge-co repos and a few old
// personal ones. The counts are the real ones: repos (mem 432 of 539 …), authors (wey-gu 391, QingZ11
// 48, the bugdrop bot 26, hawkingrei 14, nowledge-ci 12, ThaddeusJiang 8, negret1986 7, 100gle 5, …), who
// assigned them (QingZ11 assigned 24 of wey-gu's own, the bot's 9 …; 100gle assigned exactly the 5 he
// opened), labels (type/bug 253, component/cloud 148, UI/UX design 70, …), 52 with two assignees, the
// sort's groups (do 240, later 197, decide 101, close 1, scaled). 100gle's five are the real titles and
// labels (his UI review of the web settings). The other titles are written for the eval, one topic
// each (kept hidden from the finder: the gold), in the mix of English and Chinese the real pile has.
import type { PileItem, SourceItem } from "@ducter/protocol";

export const ME = "wey-gu";
export const NOW = Date.parse("2026-11-20T10:00:00Z");
const DAY = 86_400_000;

/** A tiny seeded random, so the pile is the same every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export type Topic = "distill" | "search" | "windows" | "sync" | "billing" | "mcp" | "spaces" | "docs" | "ci" | "skills" | "ui" | "graph" | "auth" | "desktop" | "agents" | "threads" | "website" | "community" | "old";

/** Per topic: its labels, and titles built from an area and a problem (English and Chinese). */
const T: Record<Topic, { labels: string[]; areas: string[]; problems: string[]; zh?: [string[], string[]]; body: string }> = {
  distill: { labels: ["component/distillation"], areas: ["Distillation", "Automatic distillation", "Thread distillation", "Distill retry"], problems: ["fails on long threads", "drops the last message", "shows no useful error", "runs twice for one thread", "gets slow past 200 messages", "keeps older facts over newer ones"], zh: [["自动提炼", "线程蒸馏", "记忆蒸馏"], ["总是失败", "结果有重复", "没有进度提示", "标题太长"]], body: "When a long thread is distilled the job" },
  search: { labels: ["component/search"], areas: ["Search", "Advanced search", "Hybrid search", "Search filters"], problems: ["returns stale results", "ranks old memories first", "ignores the space filter", "times out on large libraries", "highlights the wrong words"], zh: [["搜索", "全文搜索", "搜索结果"], ["排序不对", "中文分词有问题", "很慢"]], body: "Searching for a phrase I saved yesterday" },
  windows: { labels: ["component/desktop"], areas: ["Windows", "Windows installer", "Windows tray"], problems: ["app hangs on startup", "new panel buttons overlap", "update loop never finishes", "font renders blurry at 150%", "can't find the data folder"], zh: [["Windows 新界面", "Windows 版"], ["按钮错位", "启动卡死", "托盘图标消失"]], body: "On Windows 11 after the last update" },
  sync: { labels: ["component/session-import"], areas: ["Codex session import", "Claude Code import", "Session sync", "Cursor import"], problems: ["misses tool calls", "duplicates threads", "stops after the first 100", "loses timestamps"], zh: [["会话同步", "会话导入"], ["漏掉工具调用", "重复导入"]], body: "Importing sessions from" },
  billing: { labels: ["component/billing", "component/cloud"], areas: ["Billing", "Stripe webhook", "Team plan invoice", "Usage quota"], problems: ["double-charges on retry", "shows the wrong seat count", "doesn't reset monthly", "emails go to the old address"], zh: [["计费", "订阅"], ["重复扣款", "额度不重置"]], body: "A customer on the team plan" },
  mcp: { labels: ["component/mcp", "component/agents"], areas: ["MCP server", "MCP auth", "Remote MCP"], problems: ["drops the auth header", "returns 500 on large payloads", "tool list is stale after reconnect", "times out behind a proxy"], zh: [["MCP 服务", "MCP 连接"], ["断开后不重连", "授权失效"]], body: "Connecting an agent over MCP" },
  spaces: { labels: ["component/spaces"], areas: ["Space switcher", "Default space", "Space permissions"], problems: ["loses the selection", "aliases aren't applied", "shows spaces I left"], zh: [["空间", "默认空间"], ["切换后丢失", "别名不生效"]], body: "Switching spaces" },
  docs: { labels: ["component/docs"], areas: ["Docs: install page", "Docs: MCP setup", "Docs: API reference", "Docs: self-hosting"], problems: ["misses the Linux steps", "has a dead link", "is out of date", "uses the old CLI flags"], zh: [["文档", "安装文档"], ["链接失效", "步骤过时"]], body: "The page says" },
  ci: { labels: ["component/ci"], areas: ["CI: e2e job", "CI: release build", "CI: lint"], problems: ["times out on macOS runners", "is flaky on Windows", "caches the wrong node_modules"], zh: [["CI", "流水线"], ["超时", "不稳定"]], body: "The job failed again on" },
  skills: { labels: ["component/skills", "component/skills-sharing"], areas: ["Skill sharing link", "Skills library", "Skill import"], problems: ["404s for invited users", "doesn't show the author", "breaks on non-ASCII names"], zh: [["技能分享", "技能库"], ["链接打不开", "名字乱码"]], body: "Sharing a skill with a teammate" },
  ui: { labels: ["UI/UX design", "component/web"], areas: ["Settings page", "Memory page", "Onboarding", "Empty state", "Sidebar"], problems: ["spacing is inconsistent", "button labels are unclear", "dark mode colors are off", "copy is too long", "icon sizes differ"], zh: [["设置页", "记忆页", "侧边栏"], ["间距不统一", "暗色模式颜色不对", "文案太长"]], body: "Looking at the page in the app" },
  graph: { labels: ["component/memory-relations", "component/graph"], areas: ["Graph view", "Memory relations", "Entity merge"], problems: ["is slow with 10k nodes", "links the wrong entity", "loses layout on reload"], zh: [["知识图谱", "关系图"], ["很卡", "实体合并错误"]], body: "In the graph view" },
  auth: { labels: ["component/account-auth"], areas: ["Sign-in", "SSO", "Password reset", "Session token"], problems: ["loops back to the login page", "fails with Okta", "email never arrives", "expires too early"], zh: [["登录", "单点登录"], ["反复跳回登录页", "收不到邮件"]], body: "Signing in with" },
  desktop: { labels: ["component/desktop"], areas: ["Desktop app", "macOS app", "Auto-update", "Menu bar"], problems: ["crashes on wake", "update download stalls", "menu bar icon is blurry", "uses 2 GB of memory"], zh: [["桌面版", "Mac 客户端"], ["唤醒后崩溃", "更新卡住"]], body: "The desktop app" },
  agents: { labels: ["component/agents", "component/agent-identity"], areas: ["Agent identity", "Agent team", "AI Now panel"], problems: ["shows the wrong avatar", "forgets the persona", "answers in English for Chinese threads"], zh: [["AI Now 面板", "智能体身份"], ["头像不对", "忘记设定"]], body: "The agent" },
  threads: { labels: ["component/threads"], areas: ["Thread view", "Thread export", "Thread scaffold"], problems: ["cuts long code blocks", "loses attachments", "can't be renamed"], zh: [["线程", "线程写入"], ["附件丢失", "不能改名"]], body: "Opening a thread" },
  website: { labels: ["component/web"], areas: ["Landing page", "Pricing page", "Blog"], problems: ["hero image is cropped on mobile", "has a typo in the plans", "RSS feed is empty"], body: "On the website" },
  community: { labels: ["question"], areas: ["How do I", "Is there a way to", "Feature idea:"], problems: ["export my memories", "use Mem with Obsidian", "self-host on a NAS", "share a space with my team"], zh: [["请问", "建议"], ["怎么导出记忆", "能不能支持 Obsidian"]], body: "Hi team," },
  old: { labels: ["enhancement"], areas: ["nebula-up", "graph-ocean", "jupyter extension"], problems: ["supports arm64", "updates to v3.6", "fixes the docker compose file"], body: "It would be great if" },
};

/** 100gle's five (real titles and labels, hel 2026-11-20): opened and assigned by him, from his UI review. */
const GLE: [number, string, string[], PileItem["group"], string][] = [
  [10694, "Remove unnecessary words for user in advanced search", ["enhancement", "component/web", "type/enhancement", "UI/UX design", "component/ui"], "do", "The advanced search panel explains the query syntax in three paragraphs; a user only needs the field and one hint."],
  [10691, "Remove unnecessary information for user in memory page", ["enhancement", "component/web", "type/bug", "type/enhancement", "UI/UX design", "component/ui"], "decide", "The memory page shows internal ids, the embedding model and the raw score; none of it helps a user read a memory."],
  [10688, "Improve about setting page", ["enhancement", "component/web", "type/enhancement", "UI/UX design", "component/ui"], "later", "The About page lists the build hash and channel first; the version and what's new should lead, the rest folded."],
  [10559, "Improve general setting page", ["enhancement", "component/web", "type/enhancement", "UI/UX design", "component/ui"], "later", "General settings mixes language, startup and data folder in one long list; group them and align the controls."],
  [10482, "Improve memory space setting page", ["enhancement", "component/web", "type/enhancement", "UI/UX design", "component/spaces", "component/ui"], "later", "The space settings page has two save buttons and the alias field has no explanation."],
];

/** Who opened them, with the real counts (the long tail of one-offs kept as one-offs). */
const AUTHORS: [string, number][] = [
  ["wey-gu", 391], ["QingZ11", 48], ["neonwatty-bugdrop[bot]", 26], ["hawkingrei", 14], ["nowledge-ci[bot]", 12], ["ThaddeusJiang", 8], ["negret1986", 7], ["Icemap", 3], ["dongshunyao", 3], ["jingwenhere", 2],
  ["fleeto", 1], ["SadWood", 1], ["ionling", 1], ["hbt653", 1], ["zxc1213", 1], ["JavaWenXin", 1], ["chinameok", 1], ["samlai7", 1], ["Vex-Works", 1], ["209jkjkjk", 1], ["Hambaobao", 1], ["abn", 1], ["yayoinoyume", 1], ["liangruchao", 1],
  ["sundy-li", 1], ["stevending1st", 1], ["qiankunli", 1], ["maweijiao", 1], ["JinSeoung-Oh", 1], ["Gabyran", 1], ["demohyp-debug", 1], ["brainhol", 1], ["Anyzm-user", 1], ["moonlit-k", 1], ["tqchen-fan", 1], ["xr-lab", 1], ["cobalt-yu", 1], ["peng-z", 1], ["lumen22", 1], ["arch-dev", 1], ["ricky-hu", 1], ["sora-9", 1], ["mikan-t", 1], ["owl-ops", 1], ["juno-w", 1], ["teal-io", 1], ["ivy-cheng", 1], ["k8s-fan", 1], ["dawn-lee", 1], ["neo-j", 1], ["fern-x", 1], ["opal-r", 1], ["ash-m", 1], ["birch-q", 1], ["cedar-s", 1], ["dune-v", 1], ["elm-t", 1],
];

/** Repositories, with the real counts scaled to 552 (100gle's five are in mem). */
const REPOS: [string, number][] = [["nowledge-co/mem", 438], ["nowledge-co/mem-feedback", 41], ["nowledge-co/community", 30], ["nowledge-co/nowledge-labs-website", 13], ["wey-gu/mem-releases", 5], ["nowledge-co/con-terminal", 3], ["nowledge-co/hawdb", 2], ["nowledge-co/test-infra", 2], ["nebula-contrib/ngbatis", 2], ["wey-gu/nebula-dgl", 2], ["opensource-f2f/artwork", 2], ["nowledge-co/OpenKL", 1], ["wey-gu/jupyter_nebulagraph", 1], ["wey-gu/awesome-graph-dataset", 1], ["nebula-contrib/nebulagraph-docker-ext", 1], ["wey-gu/nebulagraph-ai", 1], ["wey-gu/nebula-up", 1], ["nebula-contrib/graph-ocean", 1]];

export interface EvalItem extends PileItem {
  /** The hidden truth the finder never sees: what it is about. */
  topic: Topic;
}

export function evalPile(): EvalItem[] {
  const r = rng(426);
  const pick = <X>(xs: X[]) => xs[Math.floor(r() * xs.length)]!;
  const out: EvalItem[] = [];
  const authors = AUTHORS.flatMap(([a, n]) => Array.from({ length: n }, () => a));
  // Shuffle the authors over the slots.
  for (let k = authors.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [authors[k], authors[j]] = [authors[j]!, authors[k]!];
  }
  const repos = REPOS.flatMap(([x, n]) => Array.from({ length: n }, () => x));
  const seen = new Set<string>();
  const groups: PileItem["group"][] = [...Array(239).fill("do"), ...Array(196).fill("later"), ...Array(116).fill("decide"), "close"];
  let hawk = 0;
  // UI/UX design: 70 in all, 5 of them 100gle's: 65 slots of mem, evenly spread, by people (not the bots).
  const plain = repos.map((x, k) => (x === "nowledge-co/mem" && !authors[k % authors.length]!.endsWith("[bot]") ? k : -1)).filter((k) => k >= 0);
  const uiSlots = new Set(Array.from({ length: 65 }, (_, i) => plain[Math.floor((i * plain.length) / 65)]!));
  for (let k = 0; k < 552; k++) {
    const repo = repos[k % repos.length]!;
    const author = authors[k % authors.length]!;
    const topic: Topic = repo.endsWith("/mem-feedback") ? pick(["search", "sync", "desktop", "windows", "distill"] as Topic[]) : repo.endsWith("/community") ? pick(["community", "search", "docs", "sync"] as Topic[]) : repo.endsWith("website") ? pick(["website", "docs"] as Topic[]) : !repo.startsWith("nowledge-co/mem") ? "old" : author === "neonwatty-bugdrop[bot]" ? pick(["desktop", "windows", "search"] as Topic[]) : author === "nowledge-ci[bot]" ? "ci" : uiSlots.has(k) ? "ui" : pick(["distill", "search", "windows", "sync", "billing", "mcp", "spaces", "docs", "ci", "skills", "graph", "auth", "desktop", "agents", "threads"] as Topic[]);
    const t = T[topic];
    let title = "";
    for (let tries = 0; tries < 40 && (!title || seen.has(title)); tries++) title = t.zh && r() < 0.28 ? `${pick(t.zh[0])}${pick(t.zh[1])}` : `${pick(t.areas)} ${pick(t.problems)}`;
    if (seen.has(title)) title = `${title} (${k})`;
    seen.add(title);
    const bug = r() < 0.47;
    const labels = [...t.labels.slice(0, 1 + Math.floor(r() * t.labels.length)), bug ? "type/bug" : "type/enhancement", ...(r() < 0.45 ? [pick(["severity/moderate", "severity/major", "severity/minor"])] : []), ...(author === "neonwatty-bugdrop[bot]" ? ["bugdrop"] : [])];
    const n = repo === "nowledge-co/mem" ? 10690 - k * 3 : 400 - k;
    const createdDays = repo.startsWith("nowledge-co/") ? Math.floor(r() * 110) + 1 : 400 + Math.floor(r() * 1200);
    const updatedDays = Math.min(createdDays, Math.floor(r() * r() * 60));
    // Who assigned it (the real shape): their own mostly; QingZ11 triages a share of everyone's.
    const assignedBy = author === "wey-gu" ? (r() < 0.06 ? "QingZ11" : "wey-gu") : author === "QingZ11" ? (r() < 0.1 ? "wey-gu" : "QingZ11") : author.endsWith("[bot]") ? (r() < 0.4 ? "QingZ11" : "wey-gu") : author === "hawkingrei" ? (hawk++ === 0 ? "hawkingrei" : "wey-gu") : r() < 0.3 ? "QingZ11" : "wey-gu";
    const two = r() < 0.095;
    const item: SourceItem = {
      source: "src_gh",
      kind: "github",
      ref: `${repo}#${n}`,
      label: `#${n}`,
      where: repo,
      title,
      url: `https://github.com/${repo}/issues/${n}`,
      state: "open",
      updatedAt: new Date(NOW - updatedDays * DAY - k * 61_000).toISOString(),
      createdAt: new Date(NOW - createdDays * DAY - k * 61_000).toISOString(),
      labels,
      author,
      assignees: two ? [ME, pick(["QingZ11", "hawkingrei"])] : [ME],
      assignedBy,
      body: `${t.body} ${title.toLowerCase()}. Steps and logs below.`,
      ...(k === 77 ? { pr: true } : {}),
    };
    out.push({ item, group: groups[k % groups.length]!, why: "", topic });
  }
  for (const [n, title, labels, group, body] of GLE) {
    const item: SourceItem = { source: "src_gh", kind: "github", ref: `nowledge-co/mem#${n}`, label: `#${n}`, where: "nowledge-co/mem", title, url: `https://github.com/nowledge-co/mem/issues/${n}`, state: "open", updatedAt: new Date(NOW - (10694 - n) / 30 * DAY).toISOString(), createdAt: new Date(NOW - (12 + (10694 - n) / 20) * DAY).toISOString(), labels, author: "100gle", assignees: [ME], assignedBy: "100gle", body };
    out.push({ item, group, why: "", topic: "ui" });
  }
  return out;
}
