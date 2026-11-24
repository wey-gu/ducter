// D546: every object a partner owns shows its owner, never the shown partner. The author, with four
// partners on the Mac and the web: switched to 小玛 and opened On hand: the same tasks (right, one On
// hand, D24), but every task's face turned 小玛's, and a task Ducter opened said 「小玛交给它的事」.
// The page's own figure (the bar, the composer, first run) is the shown partner's; a row, a card, a
// Keep, a group, an opened task and its transcript's labels are their owner's (card.persona,
// KeepSheet.persona, TaskGroupView.persona, RoutineBody.persona; absent: the default partner). With
// one partner nothing changes: no data-look (the art as drawn) and the one partner's own name.
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings, format, TABLES } from "../src/i18n.ts";
import type { ServerFrame } from "@ducter/protocol";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const zh = (k: string, ...a: unknown[]) => format(TABLES.zh[k] ?? k, a);
const en = (k: string, ...a: unknown[]) => format(TABLES.en[k] ?? k, a);

const four = [
  { id: "default", name: "Ducter", look: "sand", asks: 0 },
  { id: "p2", name: "小家", look: "sage", asks: 0 },
  { id: "p3", name: "多比", look: "sky", asks: 0 },
  { id: "p4", name: "小玛", look: "plum", asks: 0 },
];

async function rig(partners: typeof four | undefined, shown: string) {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  A.S = new Store();
  A.L = strings("zh");
  A.partners = undefined;
  A.partnerShown = shown;
  A.receive({ t: "welcome", persona: shown, personaName: partners?.find((p) => p.id === shown)?.name ?? "阿福", headSeq: 1 } as ServerFrame);
  if (partners) A.receive({ t: "partners", partners, shown } as unknown as ServerFrame);
  return A;
}

afterAll(async () => {
  const { A } = await import("../src/app.ts");
  const { Store } = await import("../src/store.ts");
  A.partners = undefined;
  A.partnerShown = "default";
  A.S = new Store();
});

/** Every vnode in a tree (function components left uncalled), depth first. */
function walk(v: unknown, out: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(v)) for (const x of v) walk(x, out);
  else if (v && typeof v === "object" && "props" in v) {
    const n = v as { type: unknown; props: Record<string, unknown> };
    out.push(n);
    walk(n.props.children, out);
  }
  return out;
}

describe("D546: the owner, not the shown partner", () => {
  test("with four partners and 小玛 shown, a task Ducter opened is Ducter's: its clay and its name", async () => {
    const A = await rig(four, "p4");
    expect(A.shownPartner()?.id).toBe("p4");
    expect(A.lookOf("default")).toBe("sand"); // [data-look="sand"] puts the art back as drawn under 小玛's root clay
    expect(A.nameOf("default")).toBe("Ducter");
    expect(A.lookOf("p2")).toBe("sage");
    expect(A.nameOf("p2")).toBe("小家");
    // Absent, or a partner since removed: the default's.
    expect(A.lookOf(undefined)).toBe("sand");
    expect(A.nameOf("gone")).toBe("Ducter");
    // The brief's label and the transcript's labels carry the owner's name.
    expect(zh("task.asked", A.nameOf("default"))).toBe("Ducter 交给它的事");
    expect(zh("task.asked", A.nameOf("p2"))).toBe("小家 交给它的事");
    expect(en("task.asked", A.nameOf("p2"))).toBe("What 小家 asked");
    expect(zh("task.from.partner", A.nameOf("p3"))).toBe("多比 对它说");
    expect(zh("keep.kicker", A.nameOf("p2"))).toBe("小家 看守中");
  });

  test("with one partner nothing changes: no look, the one partner's own name (not always Ducter)", async () => {
    const A = await rig(undefined, "default");
    expect(A.manyPartners()).toBe(false);
    expect(A.lookOf("default")).toBeUndefined();
    expect(A.lookOf(undefined)).toBeUndefined();
    expect(A.nameOf("default")).toBe("阿福");
    expect(A.nameOf(undefined)).toBe("阿福");
    const one = await rig([{ id: "default", name: "阿福", look: "sky", asks: 0 }], "default");
    expect(one.lookOf("default")).toBeUndefined();
    expect(one.nameOf("default")).toBe("阿福");
  });

  test("a Keep owned by 小家 shows 小家's mark and clay while 小玛 is shown; with one partner, no mark", async () => {
    const A = await rig(four, "p4");
    const { KeepSheetCard } = await import("../src/keep.tsx");
    const { PartnerMark } = await import("../src/partners.tsx");
    const now = new Date().toISOString();
    const k = { id: "kp1", title: "每周一看牙医的预约", persona: "p2", run: "same", life: "on", taskIds: [], items: [], wakes: [], since: now, asks: 0 } as never;
    const nodes = walk(KeepSheetCard({ k, stacked: false }));
    expect(nodes[0]!.props["data-look"]).toBe("sage");
    const mark = nodes.find((n) => n.type === PartnerMark);
    expect(mark?.props.persona).toBe("p2");
    const drawn = walk(PartnerMark({ persona: "p2" }));
    expect(drawn[0]!.props["aria-label"]).toBe("小家");
    expect(walk(drawn).some((n) => n.props.look === "sage")).toBe(true);
    // One partner: no clay given, and no mark.
    await rig(undefined, "default");
    expect(walk(KeepSheetCard({ k, stacked: false }))[0]!.props["data-look"]).toBeUndefined();
    expect(PartnerMark({ persona: "p2" })).toBeNull();
  });

  test("rows, cards, groups, the opened task and its workbench take their owner's clay", () => {
    const oh = src("onhand.tsx");
    // A row (the board's and the rail's), a card, a group: each root carries its owner's look.
    expect(oh).toMatch(/class=\{`trow[^\n]*data-row=\{task\.id\} data-look=\{A\.lookOf\(task\.card\?\.persona\)\}/);
    expect(oh).toMatch(/data-row=\{task\.id\}\s*data-look=\{A\.lookOf\(task\.card\?\.persona\)\}\s*>/);
    expect(oh).toContain("data-group={b.g.id} data-look={A.lookOf(b.g.persona)}");
    expect(oh).toContain("<PartnerMark persona={b.g.persona} />");
    // The opened task: the page (its head's mark at 28, its transcript, its locator) and the workbench beside it.
    const v = src("views.tsx");
    expect(v).toContain('<main class="scroll task-page" data-look={A.lookOf(task.card?.persona)}');
    expect(v).toContain("<Avatar size={28} state={faceOf(a)} still={stillFace(a)} who={A.nameOf(task.card?.persona)} />");
    // A needs-you card for another partner's task says whose (its mark before the task's name) in its clay.
    expect(v).toContain("data-look={task && !inTask ? A.lookOf(task.card?.persona) : undefined}");
    expect(v).toContain("<PartnerMark persona={task.card?.persona} />");
    const wb = src("workbench.tsx");
    expect(wb.match(/data-look=\{A\.lookOf\(task\.card\?\.persona\)\}/g)?.length).toBe(2);
    // The transcript's labels: the brief, what the partner said to it, a report, a note.
    const tx = src("transcript.tsx");
    expect(tx).toContain('t("task.asked", A.nameOf(task.card?.persona))');
    expect(tx).toContain('t("task.from.partner", A.nameOf(task.card?.persona))');
    expect(tx).toContain("t(k, A.nameOf(task.card?.persona))");
    expect(tx).toContain('t("told.other", who)');
    // A Keep's page and a routine's pause say whose they are.
    const kp = src("keep.tsx");
    expect(kp).toContain('t("keep.kicker", A.nameOf(k.persona))');
    expect(kp).toContain('t("keep.talk.sent", A.nameOf(k.persona))');
    expect(src("work.tsx")).toContain('t("routine.paused.by_partner", A.nameOf(r.persona))');
    // A routine carries whose mark; a wait's groove is in its owner's clay (its task's, else who set it).
    expect(src("work.tsx")).toContain("<PartnerMark persona={r.persona} />");
    expect(src("work.tsx")).toContain("data-look={A.lookOf(waitOwner(w))}");
  });

  test("the default's sand look puts the art back as drawn under another partner's root clay", () => {
    const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
    expect(css).toContain('[data-look="sand"] { --clay: none; }');
    // The art reads the nearest --clay, so an owned object's data-look wins over the root's data-clay.
    expect(css).toMatch(/img\[src\$="art\/working\.webp"\][^{]*\{ filter: var\(--clay, none\); \}/);
  });
});

// The guard: inside the renderers of owned objects, the shown partner is never asked for a face or a
// name. A use that is truly the shown partner's (the page's own figure) is listed with its reason.
describe("D546 guard: no shown-partner accessor in a row, card or task renderer", () => {
  const files = ["onhand.tsx", "transcript.tsx", "keep.tsx", "work.tsx", "workbench.tsx", "groups-view.ts", "did.tsx", "made.tsx", "past.tsx", "finds.tsx", "task-sheet.tsx", "task-info.tsx"];
  /** file: the uses that are the shown partner's own, each with why. */
  const allowed: Record<string, { line: string; why: string }[]> = {
    "onhand.tsx": [{ line: "const name = A.S.personaName;", why: "SourceSummary: to-dos are handed to the partner shown (D467)" }],
  };
  for (const f of files) {
    test(f, () => {
      let s: string;
      try {
        s = src(f);
      } catch {
        return; // not every client has every file
      }
      const hits = s.split("\n").flatMap((l, i) => (/A\.S\.personaName|A\.shownPartner\(\)/.test(l) ? [{ n: i + 1, l: l.trim() }] : []));
      const ok = allowed[f] ?? [];
      const bad = hits.filter((h) => !ok.some((o) => h.l.includes(o.line)));
      expect(bad).toEqual([]);
    });
  }
});
