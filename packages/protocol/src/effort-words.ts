// D391: how hard a task should think, read from the person's own words when they say it in
// passing ("10559 帮我用 codex astra 仔细做一下"): careful words ask for the model's high effort
// (D387's high, the highest level that isn't an extreme one), quick words for low. Code reads it,
// so it holds whether or not the model remembered to pass an effort. Only the person's words are
// read (a brief's own "check carefully" is the partner's, not theirs).

const CAREFUL = [
  /仔细|认真|好好(地)?(做|弄|搞|改|看|查|想|写|修)|细致|严谨|彻底(地)?(做|查|修|弄)|慢慢(做|来)|别(急|赶)/,
  /\b(carefully|thoroughly|thorough|meticulous(ly)?|in depth|take your time|don'?t rush)\b/i,
];
const QUICK = [
  /快速(地)?(做|弄|搞|改|看|查|过|修|写)|随便(看看|弄弄|改改|看一下)|粗略|大概看看|简单(看看|看一下|弄一下|改一下)|快点(弄|做|搞|看)/,
  /\b(quick(ly)? (look|check|pass|fix|glance)|quickly|rough(ly)?|just a glance|skim)\b/i,
];

/** "high" for careful words, "low" for quick ones, undefined when they say neither (or both). */
export function effortFromWords(texts: string[]): "high" | "low" | undefined {
  const hay = texts.join("\n");
  const careful = CAREFUL.some((r) => r.test(hay));
  const quick = QUICK.some((r) => r.test(hay));
  if (careful === quick) return undefined;
  return careful ? "high" : "low";
}
