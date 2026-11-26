// D611 on the web: each computer's Ducter folder is one shared rule row (D592's EditRow), its real
// path in mono; DUCTER_FOLDER is read-only; the move in flight says 在搬…; a refusal lists the
// tasks and waits; done leaves one plain line. The path wraps inside its box at 390 (app.css),
// never running past the card.
import { beforeEach, describe, expect, test } from "bun:test";
import type { DeviceView, VNode } from "@ducter/protocol";

const dv = (folder: DeviceView["folder"], platform = "darwin-arm64"): DeviceView => ({ id: "local", name: "hel", kind: "server", home: true, state: "awake", platform, harnesses: [], abilities: [], ...(folder ? { folder } : {}) });

function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") return void out.push(String(node)), out;
  if (Array.isArray(node)) return node.forEach((x) => texts(x, out)), out;
  const v = node as VNode;
  if (v && typeof v === "object" && "props" in v) {
    const p = v.props as Record<string, unknown>;
    if (typeof p.label === "string") out.push(p.label);
    for (const k of ["children", "values", "muted", "error"]) if (p[k] !== undefined) texts(p[k], out);
  }
  return out;
}

describe("D611: a computer's Ducter folder on the web", () => {
  beforeEach(async () => {
    const { A } = await import("../src/app.ts");
    const { strings } = await import("../src/i18n.ts");
    A.L = strings("zh");
    A.folderRows = {};
    A.changed = (() => {}) as never;
  });

  test("the row: the real path in mono, the whole row the button", async () => {
    const { A } = await import("../src/app.ts");
    const { FolderRow } = await import("../src/folder-row.tsx");
    const row = FolderRow({ dv: dv({ path: "/Users/someone/ducter", why: "default" }) }) as VNode;
    expect(row.props).toMatchObject({ label: "Ducter 文件夹", values: ["~/ducter"], editable: true, open: false, mono: true });
  });

  test("DUCTER_FOLDER: read-only, never opens", async () => {
    const { A } = await import("../src/app.ts");
    const { FolderRow } = await import("../src/folder-row.tsx");
    A.folderRow("local").open = true;
    const row = FolderRow({ dv: dv({ path: "/Users/someone/Env", why: "env" }) }) as VNode;
    expect(row.props).toMatchObject({ editable: false, open: false, muted: A.L.t("settings.folder.env") });
    expect(texts(row)).not.toContain(A.L.t("settings.folder.toMac"));
  });

  test("while it moves the row says 在搬…; refused, the tasks and the wait; done, one plain line", async () => {
    const { A } = await import("../src/app.ts");
    const { FolderRow } = await import("../src/folder-row.tsx");
    const device = dv({ path: "/Users/someone/ducter", why: "default" });
    const st = A.folderRow("local");
    st.busy = true;
    let row = FolderRow({ dv: device }) as VNode;
    expect(row.props).toMatchObject({ values: [A.L.t("settings.folder.moving")], editable: false });
    st.busy = false;
    st.open = true;
    st.tasks = [{ taskId: "t1", title: "Fix the flaky test" }];
    row = FolderRow({ dv: device }) as VNode;
    const said = texts(row);
    expect(said).toContain("Fix the flaky test");
    expect(said).toContain(A.L.t("settings.folder.wait"));
    st.tasks = undefined;
    st.open = false;
    st.done = A.L.t("settings.folder.done", "~/Ducter", 3, 5);
    row = FolderRow({ dv: dv({ path: "/Users/someone/Ducter", why: "chosen" }) }) as VNode;
    expect(row.props.muted).toBe(A.L.t("settings.folder.done", "~/Ducter", 3, 5));
  });

  test("the ~/Ducter suggestion is a Mac's alone, never a Linux server's", async () => {
    const { FolderRow } = await import("../src/folder-row.tsx");
    const row = FolderRow({ dv: dv({ path: "/root/ducter", why: "default" }, "linux-x64") }) as VNode;
    expect(texts(row)).not.toContain((await import("../src/app.ts")).A.L.t("settings.folder.toMac"));
  });

  test("another computer's path field, and the frame it sends", async () => {
    const { A } = await import("../src/app.ts");
    const sent: unknown[] = [];
    A.send = ((f: unknown) => void sent.push(f)) as never;
    const worker = { ...dv({ path: "/Users/weyl/Ducter", why: "chosen" }), id: "dev_mac", name: "Macbook Pro M3", home: false };
    A.folderMove("dev_mac", "/Users/weyl/Code/Ducter");
    expect(sent.at(-1)).toMatchObject({ t: "folder_change", path: "/Users/weyl/Code/Ducter", device: "dev_mac" });
    const req = sent.at(-1) as { clientId: string };
    A.receive({ t: "folder_change_result", ok: true, clientId: req.clientId, device: "dev_mac", path: "/Users/weyl/Code/Ducter", projects: 2, worktrees: 4 } as never);
    expect(A.folderRow("dev_mac").done).toBe(A.L.t("settings.folder.done", "~/Code/Ducter", 2, 4));
    const { FolderRow } = await import("../src/folder-row.tsx");
    const row = FolderRow({ dv: worker }) as VNode;
    expect(row.props.saveLabel).toBe(A.L.t("settings.folder.move"));
  });

  test("a long path wraps inside its box (390), never a fixed no-wrap line", async () => {
    const css = await Bun.file(new URL("../static/app.css", import.meta.url)).text();
    const block = /\.edit-row \.v\.mono \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("font-family: var(--mono)");
    expect(block).toContain("overflow-wrap: anywhere");
    expect(block).not.toContain("white-space: nowrap");
  });
});
