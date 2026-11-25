// D578: the platform conventions D573 left. Tab stays in the sheet on top and the focus goes back to
// what opened it; a layer over a place is a history entry of its own, so Back closes it and stays in
// Ducter; a task's row is a real link; on the iPhone one swipe is one step and the status bar's tap
// reaches the page.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openerFor, tabTarget } from "../src/focus-trap.ts";
import { isLayerEntry, LAYER, layerHistory } from "../src/layer-history.ts";
import { scrolledFrom } from "../src/scroll-top.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

describe("D578: a sheet keeps Tab and gives the focus back", () => {
  const list = ["close", "field", "go"];
  test("Tab from outside the sheet lands on its first (Shift: its last)", () => {
    expect(tabTarget(list, null, false)).toBe("close");
    expect(tabTarget(list, "page-behind", false)).toBe("close");
    expect(tabTarget(list, null, true)).toBe("go");
  });
  test("at either end it goes round; in between the browser's order moves it", () => {
    expect(tabTarget(list, "go", false)).toBe("close");
    expect(tabTarget(list, "close", true)).toBe("go");
    expect(tabTarget(list, "field", false)).toBeUndefined();
    expect(tabTarget(list, "field", true)).toBeUndefined();
    expect(tabTarget([], null, false)).toBeUndefined();
  });
  type El = { id: string; isConnected: boolean; inSheet?: boolean; typing?: boolean };
  const pick = (recent: (El | null)[], touch = false) => openerFor(recent, (e) => !!e.inSheet, (e) => !!e.typing, touch)?.id ?? null;
  test("the opener is the newest element outside the sheet that is still on the page", () => {
    const button = { id: "new-task", isConnected: true };
    expect(pick([button, null])).toBe("new-task");
    // The sheet focused its own field first: the button that opened it is second.
    expect(pick([{ id: "sheet-field", isConnected: true, inSheet: true }, button])).toBe("new-task");
    expect(pick([{ id: "gone", isConnected: false }, null])).toBeNull();
  });
  test("on a touch screen a text field never gets it back (the keyboard stays down)", () => {
    const composer = { id: "composer", isConnected: true, typing: true };
    expect(pick([composer, null], true)).toBeNull();
    expect(pick([composer, null], false)).toBe("composer");
  });
  test("one watcher for every modal: main.tsx starts it", () => {
    expect(src("main.tsx")).toContain("installFocusTrap()");
    // The sheets are drawn modal, so the watcher finds them.
    expect(src("sheet-frame.tsx")).toContain('aria-modal="true"');
  });
});

describe("D578: a layer is a history entry of its own", () => {
  function fake() {
    const entries: unknown[] = [null];
    let at = 0;
    const pops: unknown[] = [];
    const h = {
      get state() {
        return entries[at];
      },
      pushState(s: unknown) {
        entries.splice(at + 1);
        entries.push(s);
        at++;
      },
      replaceState(s: unknown) {
        entries[at] = s;
      },
      back() {
        if (at > 0) at--, pops.push(entries[at]);
      },
    };
    return { h, entries, pops, at: () => at };
  }

  test("a sheet opened on the tab's first page pushes an entry; Back closes it and stays", () => {
    const f = fake();
    let sheet = false;
    const L = layerHistory(f.h, () => "/app", () => sheet);
    sheet = true;
    L.sync();
    expect(f.entries.length).toBe(2);
    expect(isLayerEntry(f.h.state)).toBe(true);
    // The browser's Back: the entry is gone and the page is still here; the sheet closes.
    f.h.back();
    expect(L.pop(f.pops.shift())).toBe("close");
    sheet = false;
    L.sync();
    expect(f.at()).toBe(0);
    expect(f.pops).toEqual([]);
  });

  test("closed another way (Esc, ×), the sheet takes its entry back off", () => {
    const f = fake();
    let sheet = true;
    const L = layerHistory(f.h, () => "/app", () => sheet);
    L.sync();
    sheet = false;
    L.sync();
    expect(f.at()).toBe(0);
    // Its own back() is not a Back the person pressed.
    expect(L.pop(f.pops.shift())).toBe("ours");
  });

  test("a task chosen in a sheet takes the sheet's entry, so Back goes to the place under it", () => {
    const f = fake();
    let sheet = true;
    const L = layerHistory(f.h, () => "/app", () => sheet);
    L.sync();
    // A.go: the top entry is a layer's, so the route replaces it (app.ts).
    if (isLayerEntry(f.h.state)) f.h.replaceState(null);
    sheet = false;
    L.sync();
    expect(f.entries).toEqual([null, null]);
    expect(f.at()).toBe(1);
  });

  test("Forward onto a closed layer's entry steps back over it", () => {
    const f = fake();
    const L = layerHistory(f.h, () => "/app", () => false);
    expect(L.pop({ [LAYER]: 1 })).toBe("stale");
    expect(L.pop(undefined)).toBe("ours");
    expect(L.pop(null)).toBeUndefined();
  });

  test("main.tsx wires it, and app.ts replaces a layer's entry when it goes to a place", () => {
    expect(src("main.tsx")).toContain("layers.pop(e.state)");
    expect(src("app.ts")).toContain("isLayerEntry(history.state)");
  });
});

describe("D578: a task's row is a real link", () => {
  test("a modified or middle click is the browser's, never in the apps", async () => {
    const { newTabClick } = await import("../src/controls.tsx");
    const c = (o: Partial<MouseEvent>) => ({ metaKey: false, ctrlKey: false, shiftKey: false, button: 0, ...o });
    expect(newTabClick(c({}), false)).toBe(false);
    expect(newTabClick(c({ metaKey: true }), false)).toBe(true);
    expect(newTabClick(c({ ctrlKey: true }), false)).toBe(true);
    expect(newTabClick(c({ shiftKey: true }), false)).toBe(true);
    expect(newTabClick(c({ button: 1 }), false)).toBe(true);
    expect(newTabClick(c({ metaKey: true }), true)).toBe(false);
  });
  test("On hand's rows and the conversation's task line are TaskLinks; the board still picks", () => {
    const onhand = src("onhand.tsx");
    for (const cls of ["tmain", "omain", "gtitle"]) expect(onhand).toContain(`<TaskLink class="${cls}"`);
    expect(onhand).not.toMatch(/<button class="(tmain|gtitle)"/);
    expect(onhand).not.toMatch(/<button class="omain" onClick=\{(onClick|\(\) => A\.go)/);
    expect(onhand).toContain("onPick={(e) => pickClick(e, task.id, room)}");
    expect(src("views.tsx")).toContain('<TaskLink class="taskline"');
  });
});

describe("D578: the iPhone", () => {
  const swift = readFileSync(join(import.meta.dir, "../../ios/Ducter/WebShell.swift"), "utf8").replace(/\/\/.*$/gm, "");
  test("one back gesture: WebKit's history swipe is off, the page's edge swipe stays", () => {
    expect(swift).toContain("allowsBackForwardNavigationGestures = false");
    expect(swift).not.toContain("allowsBackForwardNavigationGestures = true");
    // The page's swipe runs in the app (nav.ts returns early only in a Safari tab).
    expect(src("nav.ts")).toContain("if (browserSwipes() && !opts.inApp) return");
  });
  test("the status bar's tap is relayed to the page, which moves the view being read", () => {
    expect(swift).toContain("web.scrollView.scrollsToTop = false");
    expect(swift).toContain("topTap.scrollsToTop = true");
    expect(swift).toContain("scrollViewShouldScrollToTop");
    expect(swift).toContain("window.ducterTop && window.ducterTop()");
    expect(src("main.tsx")).toContain("ducterTop = () => scrollToTop()");
  });
  test("the view moved is the nearest one scrolled down, under the middle of the screen", () => {
    type N = { id: string; parentElement: N | null; down: boolean };
    const page: N = { id: "page", parentElement: null, down: false };
    const conv: N = { id: "conv", parentElement: page, down: true };
    const code: N = { id: "code", parentElement: conv, down: false };
    const bubble: N = { id: "bubble", parentElement: code, down: false };
    expect(scrolledFrom(bubble, (e) => e.down)?.id).toBe("conv");
    expect(scrolledFrom(page, (e) => e.down)).toBeNull();
  });
});
