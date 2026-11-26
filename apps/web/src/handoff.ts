// D609: the words and the groups a hand-off's records make on the web. Pure, so the views stay
// thin and the words are tested for every state: the task's one line under its last report, and
// 手上的事 grouped by state (等接手, 在做, 退回了, 没接).
import { cutAtWord, type HandoffLine, type KeepItem } from "@ducter/protocol";
import type { Strings } from "./i18n.ts";

export type HandoffGroupKey = "waiting" | "working" | "returned" | "declined";

export const HANDOFF_GROUPS: HandoffGroupKey[] = ["waiting", "working", "returned", "declined"];

/** The one quiet line under a task's last report: given → taken → its outcome. */
export function handoffTaskWords(h: HandoffLine, L: Strings): string {
  const gist = cutAtWord((h.outcome || h.why || h.item.title || h.item.ref).replace(/\s+/g, " ").trim(), 120);
  switch (h.state) {
    case "taken":
      return L.t("handoff.taken", h.to);
    case "done":
      return L.t("handoff.done", h.to, gist);
    case "returned":
      return L.t("handoff.returned", h.to, gist);
    case "declined":
      return L.t("handoff.declined", h.to, gist);
    case "withdrawn":
      return L.t("handoff.withdrawn", h.to);
    default:
      // given and unclaimed: the unclaimed line is the person's, said once.
      return L.t("handoff.given", h.to);
  }
}

/** Every record in its group; a taken item with no record of its own is still 在做 (legacy). */
export function handoffGroups(hs: HandoffLine[], items: KeepItem[]): { key: HandoffGroupKey; rows: HandoffLine[]; legacy: KeepItem[] }[] {
  // A done record's task may still carry an open PR (D508/D602): it stays in 在做 as that item,
  // not as a done hand-off (the page has no 做完了 group).
  const seen = new Set(hs.filter((h) => h.state !== "done").map((h) => h.taskId).filter((x): x is string => !!x));
  const groups = HANDOFF_GROUPS.map((key) => ({
    key,
    rows: hs.filter((h) => (key === "waiting" ? h.state === "given" || h.state === "unclaimed" : key === "working" ? h.state === "taken" : h.state === key)).sort((a, b) => a.givenAt.localeCompare(b.givenAt)),
    legacy: [] as KeepItem[],
  }));
  groups[1]!.legacy = items.filter((x) => !seen.has(x.taskId));
  return groups;
}
