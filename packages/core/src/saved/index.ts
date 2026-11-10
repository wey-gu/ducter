// 自动填充 / Autofill (D191): the store, the fill tools for tasks in Ducter's browser, the one
// listing tool (saved_list, for the partner and for those tasks), and the clients' frame.
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { SavedFrame } from "@ducter/protocol/src/saved.ts";
import type { CoreMcpHub, Ctx } from "../mcp.ts";
import type { BrowserHost } from "../browser/host.ts";
import { openSaved, SavedError, scrub, type SavedStore } from "./store.ts";
import { hostSeam, registerFillTools, savedListText, type Fill, type FillSeam } from "./fill.ts";

export interface Autofill {
  store: SavedStore;
  fill?: Fill;
  /** What a client shows (never a secret). */
  frame(extra?: Partial<SavedFrame>): SavedFrame;
  /** Hide every saved value in a text a model is about to read. */
  scrub(text: string): string;
  /** A task's brief names a saved handle that exists ("card:visa-4242"): it fills from Autofill. */
  wants(open: { brief?: string } | undefined): boolean;
  stop(): void;
}

/** Handles as a brief names them. */
export const HANDLE_IN_TEXT = /(?<![\w.:-])((?:signin|card):[a-z0-9][a-z0-9.\-]*(?:#\d+)?|me\.[a-z_]+)/g;

export interface AutofillOptions {
  dataDir: string;
  persona: string;
  mcp: CoreMcpHub;
  log: LogStore;
  tasks: Parameters<typeof registerFillTools>[0]["tasks"];
  store?: SavedStore;
  platform?: string;
}

export function createAutofill(o: AutofillOptions): Autofill & { attachBrowser(host: BrowserHost, seam?: FillSeam): void } {
  const store = o.store ?? openSaved({ dataDir: o.dataDir, persona: o.persona, ...(o.platform ? { platform: o.platform } : {}) });
  let list: string[] | undefined;
  store.onChange(() => (list = undefined));
  const any = () => {
    try {
      const v = store.view();
      return v.items.length > 0 || v.details.some((x) => x.kept);
    } catch {
      return false;
    }
  };
  let browserHost: BrowserHost | undefined;
  const hasBrowser = (taskId: string) => !!browserHost?.task(taskId);

  // Listed to the partner only once something is saved, and to a task only in Ducter's browser.
  o.mcp.registerWhen(
    "partner",
    "saved_list",
    "What the user saved in Autofill (sign-ins, cards, their details): names and handles, never the values. Use it before a task that books, buys or signs in, and put the handle in the brief (\"pay with card:visa-4242 after the user's Go\").",
    { type: "object", properties: {} },
    async () => savedListText(store, "partner"),
    any,
  );
  o.mcp.registerWhen(
    "task",
    "saved_list",
    "What the user saved for filling in (sign-ins, cards, their details): handles for browser_fill, never the values.",
    { type: "object", properties: {} },
    async () => savedListText(store, "task"),
    (ctx: Ctx) => !!ctx.taskId && hasBrowser(ctx.taskId) && any(),
  );

  const api: Autofill & { attachBrowser(host: BrowserHost, seam?: FillSeam): void } = {
    store,
    frame(extra = {}) {
      try {
        return { t: "saved", ...store.view(), keptIn: store.keptIn, ...extra };
      } catch (err) {
        return { t: "saved", items: [], details: [], uses: [], keptIn: store.keptIn, ok: false, reason: err instanceof SavedError ? err.reason : "failed", message: (err as Error).message };
      }
    },
    scrub(text) {
      if (!text) return text;
      try {
        list ??= store.scrubList();
      } catch {
        list = [];
      }
      let out = scrub(text, list);
      // A held security code is short: hidden as a whole number only, while its payment is open.
      for (const c of api.fill?.codes() ?? []) out = out.replace(new RegExp(`(?<!\\d)${c}(?!\\d)`, "g"), "•••");
      return out;
    },
    wants(open) {
      const brief = open?.brief ?? "";
      if (!brief) return false;
      try {
        return [...brief.matchAll(HANDLE_IN_TEXT)].some((m) => !!store.resolve(m[1]!.replace(/[.\-]+$/, "")));
      } catch {
        return false;
      }
    },
    attachBrowser(host, seam) {
      browserHost = host;
      api.fill = registerFillTools({ mcp: o.mcp, saved: store, log: o.log, seam: seam ?? hostSeam(host), tasks: o.tasks, hasBrowser });
    },
    stop() {
      api.fill?.stop();
    },
  };
  return api;
}

export { SavedError } from "./store.ts";
