// A Chrome that isn't there (D154 tests): `launch` and `connect` seams for a browser host, whose
// CDP answers just enough for a page to open, load and be read, and records every call.
import type { CdpConn, CdpEvent } from "../src/browser/cdp.ts";
import type { Launched } from "../src/browser/chrome.ts";

export interface FakeChrome {
  launch: () => Promise<Launched>;
  connect: () => Promise<CdpConn>;
  calls: { method: string; params: any; sessionId?: string }[];
  launches: number;
  /** What the page says once loaded. */
  page: { title: string; url?: string };
}

export function fakeChrome(o: { product?: string; title?: string; navError?: string } = {}): FakeChrome {
  const fns = new Set<(e: CdpEvent) => void>();
  let n = 0;
  let url = "about:blank";
  const f: FakeChrome = {
    calls: [],
    launches: 0,
    page: { title: o.title ?? "Example Domain" },
    launch: async () => {
      f.launches++;
      return { proc: { exited: Promise.resolve(0), kill() {}, exitCode: null } as unknown as Launched["proc"], wsUrl: "ws://127.0.0.1:1/devtools/browser/fake" };
    },
    connect: async () => cdp,
  };
  const cdp: CdpConn = {
    async send(method, params: any = {}, sessionId) {
      f.calls.push({ method, params, ...(sessionId ? { sessionId } : {}) });
      switch (method) {
        case "Browser.getVersion":
          return { product: o.product ?? "HeadlessChrome/157.0.8103.38" };
        case "Target.createTarget":
          return { targetId: `T${++n}` };
        case "Target.attachToTarget":
          return { sessionId: `S-${params.targetId}` };
        case "Page.navigate":
          url = params.url;
          return o.navError ? { errorText: o.navError } : { frameId: "F" };
        case "Runtime.evaluate": {
          const e = String(params.expression);
          if (e === "document.readyState") return { result: { value: "complete" } };
          if (e.startsWith("(function") || e.startsWith("((")) return { result: { value: { title: f.page.title, url: f.page.url ?? url, lines: ["Example Domain", "[1] link \"More information...\""], more: false } } };
          if (e.includes("document.title")) return { result: { value: { title: f.page.title, url: f.page.url ?? url } } };
          return { result: { value: undefined } };
        }
        case "Target.getTargetInfo":
          return { targetInfo: { url, title: f.page.title } };
        default:
          return {};
      }
    },
    on: (fn) => (fns.add(fn), () => fns.delete(fn)),
    onClose: () => () => {},
    closed: () => false,
    close() {},
  };
  return f;
}
