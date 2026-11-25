// D276: a hub on a real Log and real decisions, its adapters against the fake servers.
import { expect } from "bun:test";
import { join } from "node:path";
import type { Bodies, ChannelKind } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { createDecisions } from "../src/decisions.ts";
import { openLog } from "../src/log.ts";
import { createMediaStore } from "../src/media.ts";
import { createRegistry } from "../src/registry.ts";
import { createChannels, createSlack, createTelegram, createWechat, type Channels } from "../src/channels/index.ts";
import type { Quiet } from "../src/push.ts";
import { fakeSlack } from "./fake-slack.ts";
import { fakeTelegram } from "./fake-telegram.ts";
import { fakeWechat } from "./fake-wechat.ts";
import { tempDir } from "./helpers.ts";

export const PERSON = 4242; // the person's Telegram id (and private chat id)
export const STRANGER = 9999;

export async function waitFor<T>(fn: () => T | undefined | false | null, ms = 4000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > until) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

export function channelRig(o: { quiet?: Quiet | null; openUrl?: string; zh?: boolean; lang?: string; /** D516: the home's partners, the default first. */ partners?: { id: string; name: string }[]; /** D531: each partner's look (Slack's per-message face). */ looks?: Record<string, string>; slackScopes?: string[]; /** D580: Slack display names by user id. */ slackNames?: Record<string, string> } = {}) {
  const t = tempDir();
  const clock = new FakeClock(Date.parse("2026-11-16T04:00:00Z")); // 12:00 in Shanghai
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const decisions = createDecisions({ log, tasks, clock });
  const media = createMediaStore(t.dir);
  const tg = fakeTelegram();
  const sl = fakeSlack({ ...(o.slackScopes ? { scopes: o.slackScopes } : {}), ...(o.slackNames ? { names: o.slackNames } : {}) });
  const wx = fakeWechat();
  const sleeps: number[] = [];
  let quiet: Quiet | null = o.quiet ?? null;
  let off = false;
  const make = (dataDir: string): Channels =>
    createChannels({
      dataDir,
      log,
      decisions,
      media,
      clock,
      quiet: () => quiet,
      notifyOff: () => off,
      lang: () => o.lang ?? (o.zh === false ? "en" : "zh"),
      personaName: () => "Ducter",
      ...(o.partners ? { partners: () => o.partners! } : {}),
      ...(o.looks ? { face: (id: string) => ({ name: o.partners?.find((p) => p.id === id)?.name ?? "Ducter", look: o.looks![id] ?? "sand" }) } : {}),
      ...(o.openUrl ? { openUrl: () => o.openUrl } : {}),
      sleep: async (ms) => void sleeps.push(ms),
      gapMs: 0,
      wechat: { api: wx.api, pollGapMs: 5 },
      make: (kind, rec, store) =>
        kind === "telegram"
          ? createTelegram({ token: rec.token, api: tg.api, pollSeconds: 1, backoffMs: 20, offset: () => store.get("telegram")?.offset, setOffset: (n) => store.patch("telegram", { offset: n }) })
          : kind === "wechat"
            ? createWechat({ token: rec.token, api: wx.api, ...(rec.base ? { base: rec.base } : {}), cdn: `${wx.api}/cdn`, botId: rec.bot?.id ?? "", pollMs: 400, backoffMs: 20, state: () => ({ ...(store.get("wechat")?.ctx ? { ctx: store.get("wechat")!.ctx } : {}), ...(store.get("wechat")?.buf ? { buf: store.get("wechat")!.buf } : {}) }), save: (p) => store.patch("wechat", p) })
            : createSlack({ botToken: rec.token, appToken: rec.appToken ?? "", api: sl.api, backoffMs: 20 }),
    });
  const hub = make(t.dir);
  return {
    dir: t.dir,
    clock,
    log,
    tasks,
    decisions,
    media,
    tg,
    sl,
    wx,
    hub,
    sleeps,
    make,
    setQuiet: (q: Quiet | null) => void (quiet = q),
    setOff: (v: boolean) => void (off = v),
    /** Connects and links a chat app the way the person does it. */
    async linked(kind: ChannelKind) {
      if (kind === "wechat") {
        expect((await hub.connect("wechat", {})).ok).toBe(true);
        wx.confirm();
        await waitFor(() => hub.view().find((v) => v.kind === "wechat")?.state === "linked");
        return;
      }
      if (kind === "telegram") {
        expect((await hub.connect("telegram", { token: tg.token })).ok).toBe(true);
        const c = hub.code("telegram");
        if (!c.ok) throw new Error("no code");
        tg.says(PERSON, `/start ${c.link!.split("start=")[1]}`);
      } else {
        expect((await hub.connect("slack", { botToken: sl.botToken, appToken: sl.appToken })).ok).toBe(true);
        await waitFor(() => sl.connected());
        const c = hub.code("slack");
        if (!c.ok) throw new Error("no code");
        sl.says("UWEY", c.code);
      }
      await waitFor(() => hub.view().find((v) => v.kind === kind)?.state === "linked");
      await hub.idle();
    },
    userMsgs: () => log.read({ stream: "channel", kinds: ["user_msg"], limit: 100 }).map((e) => ({ seq: e.seq, ...(e.body as Bodies["user_msg"]) })),
    ask(d: Partial<Bodies["decision"]> = {}) {
      const body: Bodies["decision"] = { decisionId: `d_${Math.random().toString(36).slice(2, 10)}`, question: "要把它合进 main 吗？", goLabel: "合进去", defaultOption: "go", reversible: true, defaultAt: new Date(clock.now() + 10 * 60_000).toISOString(), ...d };
      return log.append({ stream: "channel", origin: "partner", kind: "decision", body });
    },
    say(text: string, replyTo?: number, extra: Partial<Bodies["ai_msg"]> = {}) {
      return log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, ...(replyTo !== undefined ? { replyTo } : {}), ...extra } });
    },
    stop() {
      hub.stop();
      tg.stop();
      sl.stop();
      wx.stop();
      log.close();
      t.cleanup();
    },
  };
}
