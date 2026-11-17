// D332: the partner connects with the person's own AI agents by itself. When the home's Nowledge Mem
// is signed in and offers exactly one personal place (bridge-link's "ready"), and the person runs AI
// agents of their own here, the home connects at start (and whenever it becomes ready: after Mem is
// put in or signed in) without a tap. The partner then says so once in the conversation. The one
// switch in Settings is the only control: off revokes the connection and nothing connects again by
// itself; on connects. A failure stays quiet: the pane shows one row with the step to take.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fill, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import type { BridgeView } from "@ducter/protocol";

export const BRIDGE_SAID_FILE = "bridge-said";

export interface BridgeAutoDeps {
  link: { view(): Promise<BridgeView | undefined>; connect(): Promise<void>; disconnect(): Promise<void> };
  /** The switch: Settings › 终端里的 AI one on/off (peers.reach !== "off"). */
  on: () => boolean;
  /** The AI agents the person runs themselves here (Claude Code, Codex, pi): the reason to connect unasked. */
  own: () => string[];
  dataDir: string;
  /** The partner's one line, once, naming those agents. */
  say: (agents: string[]) => void;
}

export interface BridgeAuto {
  /** Look once: connect when ready and wanted; say it once when this connection is the first. */
  tick(): Promise<void>;
  /** The person flipped the switch: on connects (asked, so even without agents seen), off revokes. */
  switched(on: boolean): Promise<void>;
}

export function createBridgeAuto(d: BridgeAutoDeps): BridgeAuto {
  const said = join(d.dataDir, BRIDGE_SAID_FILE);
  const mark = () => {
    try {
      writeFileSync(said, new Date().toISOString() + "\n");
    } catch {
      /* the line may be said again; nothing else breaks */
    }
  };
  let running = false;
  let made = false; // this run made the connection (by itself or by the switch): the line is owed
  const look = async (asked: boolean) => {
    if (running) return;
    running = true;
    try {
      let v = await d.link.view();
      if (!v) return;
      if (v.state === "connected") {
        // Connected before this (an earlier version's tap): nothing to announce.
        if (!made && !existsSync(said)) mark();
      } else if (v.state === "ready" && d.on() && (asked || d.own().length > 0)) {
        await d.link.connect();
        v = await d.link.view();
        if (v?.state === "connected") made = true;
      }
      if (made && v?.state === "connected" && !existsSync(said)) {
        mark();
        d.say(d.own());
      }
    } catch {
      /* quiet: the pane says what to do */
    } finally {
      running = false;
    }
  };
  return {
    tick: () => look(false),
    async switched(on) {
      if (on) return look(true);
      const v = await d.link.view().catch(() => undefined);
      if (v?.state === "connected" || v?.state === "unconfirmed") await d.link.disconnect();
    },
  };
}

/** The partner's one line when it first can be reached, from a table per language (D292). */
const SAID = {
  en: { line: "{names} in your terminal can reach me now: work they hand me, and anything that needs your call, will show up here. To stop it, turn it off in Settings › AI in your terminal.", any: "AI agents", list: (a: string[]) => (a.length === 1 ? a[0]! : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`) },
  zh: { line: "你在终端里用的 {names} 现在能找到我了：它们交给我的事、要你定的事，都会来这里。不想要的话，在 设置 › 终端里的 AI 里关掉。", any: "AI agent", list: (a: string[]) => a.join("、") },
};

export function bridgeOnWords(lang: LangTag, agents: string[]): string {
  const w = words(SAID, lang);
  return fill(w.line, { names: agents.length ? w.list(agents) : w.any });
}
