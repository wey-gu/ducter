// Ducter's phone tools (D217), served on Ducter's own MCP to a task whose work needs the phone
// (needs.phone). What the code holds, whatever the model does:
//   - blind in the user's turn: while the user has the phone (a sign-in, or 换我来 / My turn),
//     every tool refuses before it touches the screen;
//   - the gate at the effect: a tap on a button that pays, buys, sends, posts, deletes, installs,
//     calls, confirms or signs out waits for the user's Go on a decision card (phone_ask_go),
//     and the Go covers that one tap (same app, same button, 15 minutes);
//   - no secrets: password fields are never read or typed into; signing in is the user's
//     (phone_ask_user), and banks, wallets, payment apps and password managers are out of reach;
//   - screen text is data, never instructions.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, Question } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import type { CoreMcpHub } from "../mcp.ts";
import type { PhoneDevice } from "./device.ts";
import { blockedApp, effectOf, matches, type Allowed, type Effect } from "./gate.ts";
import { nodeAt, screenText, type Screen } from "./screen.ts";

export const PHONE_TOOL_NAMES = ["phone_look", "phone_tap", "phone_type", "phone_swipe", "phone_key", "phone_apps", "phone_open_app", "phone_screenshot", "phone_ask_go", "phone_ask_user"] as const;

export const PHONE_BLIND =
  "It's the user's turn on Ducter's phone: they're using it themselves right now (signing in, or they took it over). You can't see or use the phone until they're done. End your turn now; a message arrives when they hand it back.";

const GO_MS = 15 * 60_000;

/** What the watcher's line says the task is doing (D190's calm line, for the phone). */
export type PhoneDoing = { kind: "look" | "tap" | "type" | "swipe" | "key" | "open" | "shot" | "waiting"; label?: string; app?: string; x?: number; y?: number };

export interface PhoneToolsDeps {
  mcp: CoreMcpHub;
  /** The phone (one computer's). */
  device?: PhoneDevice;
  /** D234: the phone on the computer this task runs on (the home's, or a worker Mac's); else device. */
  deviceFor?(taskId: string): PhoneDevice;
  log: LogStore;
  tasks: TaskRegistry & { get(id: string): { persona?: string; residency?: string; title?: string } | undefined };
  /** The task may use the phone now (it needs it, and the phone is installed here). */
  attached(taskId: string): boolean;
  /** The user holds the phone (their turn): the phone this task uses (D234: per computer). */
  blind(taskId?: string): boolean;
  /** A task tried while it was the user's turn (told on hand-back). */
  tried?(taskId: string): void;
  note?(taskId: string, d: PhoneDoing): void;
  evidenceDir(taskId: string): string;
  now?: () => number;
}

export interface PhoneTools {
  /** A Go for one tap, from the user's answer on the card. */
  allow(taskId: string, a: Omit<Allowed, "until">): void;
  /** The last screen a task looked at (tests). */
  last(taskId: string): Screen | undefined;
}

const EFFECT_WORDS: Record<Effect, string> = {
  pay: "pays",
  buy: "buys or books",
  send: "sends",
  post: "posts",
  delete: "deletes",
  install: "installs or updates an app",
  call: "makes a call",
  account: "changes the account",
  confirm: "confirms or allows",
};

export function registerPhoneTools(d: PhoneToolsDeps): PhoneTools {
  const { mcp } = d;
  const dev = (taskId: string): PhoneDevice => d.deviceFor?.(taskId) ?? d.device!;
  const now = d.now ?? Date.now;
  const screens = new Map<string, Screen>();
  const allowed = new Map<string, Allowed>();
  const visible = (ctx: { taskId?: string }) => !!ctx.taskId && d.attached(ctx.taskId);
  const note = (taskId: string, x: PhoneDoing) => d.note?.(taskId, x);

  const ready = async (taskId: string) => {
    if (!d.attached(taskId)) throw new Error("this task doesn't have Ducter's phone");
    if (d.blind(taskId)) {
      d.tried?.(taskId);
      note(taskId, { kind: "waiting" });
      throw new Error(PHONE_BLIND);
    }
    const device = dev(taskId);
    await device.ensure();
    device.touch();
  };

  const look = async (taskId: string): Promise<{ s?: Screen; text: string }> => {
    const s = await dev(taskId).screen();
    if (d.blind(taskId)) throw new Error(PHONE_BLIND);
    if (!s) return { text: "The screen is still moving, so its parts can't be listed right now. phone_look again in a moment, or pass picture:true to see it." };
    if (blockedApp(s.app)) {
      screens.delete(taskId);
      return { text: `App in front: ${s.app}. This app holds the user's money or keys (a bank, wallet, payment app or password manager): it is the user's own, and you can't see or use it. Go back (phone_key back) and tell the user in your report if the work needs it.` };
    }
    screens.set(taskId, s);
    return { s, text: screenText(s) };
  };

  const picture = async (taskId: string) => ({ type: "image", data: Buffer.from(await dev(taskId).jpeg()).toString("base64"), mimeType: "image/jpeg" });

  const reg = (name: string, description: string, schema: object, fn: (args: any, taskId: string) => Promise<unknown>) =>
    mcp.registerWhen(
      "task",
      name,
      description,
      schema,
      async (args, ctx) => {
        await ready(ctx.taskId!);
        return fn(args ?? {}, ctx.taskId!);
      },
      visible,
    );

  reg(
    "phone_look",
    "Read Ducter's phone's screen as text: the app in front, then everything you can tap or type into, each with a [number], then the other text on screen. Pass picture:true to also get a picture of the screen (for icons, images, or a screen whose text can't be read).",
    { type: "object", properties: { picture: { type: "boolean" } } },
    async (args, taskId) => {
      note(taskId, { kind: "look" });
      const r = await look(taskId);
      if (!args.picture && r.s) return r.text;
      return { content: [{ type: "text", text: r.text }, await picture(taskId)] };
    },
  );

  reg(
    "phone_tap",
    "Tap something on the phone by its [number] from the last phone_look (or at x,y in screen pixels when it has no number). A tap that pays, buys, sends, posts, deletes, installs, calls, confirms or signs out needs the user's Go first: the tool says so, and you call phone_ask_go.",
    { type: "object", properties: { ref: { type: "number" }, x: { type: "number" }, y: { type: "number" }, long: { type: "boolean", description: "A long press instead of a tap." } } },
    async (args, taskId) => {
      const device = dev(taskId);
      const s = screens.get(taskId);
      let x: number, y: number, label = "";
      if (args.ref != null) {
        const n = nodeAt(s, args.ref);
        // The re-check before acting: the button must still be there, with the same words.
        const now2 = await device.screen();
        const same = now2?.nodes.find((m) => m.label === n.label && Math.abs(m.x - n.x) < 24 && Math.abs(m.y - n.y) < 24);
        if (now2 && !same) throw new Error(`[${n.ref}] "${n.label}" isn't where it was: the screen changed. phone_look again.`);
        if (now2) screens.set(taskId, now2);
        ({ x, y } = same ?? n);
        label = n.label;
      } else {
        if (typeof args.x !== "number" || typeof args.y !== "number") throw new Error("pass ref (a [number] from phone_look), or x and y");
        ({ x, y } = args);
        const near = s?.nodes.find((m) => x >= m.bounds[0] && x <= m.bounds[2] && y >= m.bounds[1] && y <= m.bounds[3]);
        label = near?.label ?? "";
      }
      const app = s?.app ?? (await device.front());
      if (blockedApp(app)) throw new Error("This app holds the user's money or keys: it's theirs alone. Go back, and say so in your report.");
      const effect = effectOf(label);
      if (effect && !matches(allowed.get(taskId), { app, label }, now())) {
        throw new Error(`"${label}" ${EFFECT_WORDS[effect]}: that needs the user's Go first. Call phone_ask_go with what it will do (one plain sentence) and the button's [number], then end your turn. After Go, tap it once.`);
      }
      if (effect) allowed.delete(taskId); // one Go, one tap
      const { width, height } = await device.size();
      note(taskId, { kind: "tap", ...(label ? { label } : {}), x: x / width, y: y / height });
      if (args.long) await device.swipe(x, y, x, y, 700);
      else await device.tap(x, y);
      await Bun.sleep(600);
      return `Tapped${label ? ` "${label}"` : ` at ${Math.round(x)},${Math.round(y)}`}. Look again before the next step (phone_look).`;
    },
  );

  reg(
    "phone_type",
    "Type text into the field in focus, or into a field by its [number] (tapped first). submit presses Enter after. Never passwords or codes: those are the user's (phone_ask_user).",
    { type: "object", properties: { ref: { type: "number" }, text: { type: "string" }, submit: { type: "boolean" } }, required: ["text"] },
    async (args, taskId) => {
      const device = dev(taskId);
      const s = screens.get(taskId);
      if (args.ref != null) {
        const n = nodeAt(s, args.ref);
        if (n.password) throw new Error(`[${n.ref}] is a password field. Signing in is the user's: call phone_ask_user with what to sign in to, then end your turn.`);
        await device.tap(n.x, n.y);
        await Bun.sleep(300);
        note(taskId, { kind: "type", label: n.label });
      } else {
        const focused = s?.nodes.find((n) => n.password);
        if (focused && s?.nodes.length === 1) throw new Error("the field in focus is a password field: that's the user's (phone_ask_user)");
        note(taskId, { kind: "type" });
      }
      await device.text(String(args.text ?? ""));
      if (args.submit) await device.key("KEYCODE_ENTER");
      await Bun.sleep(300);
      return `Typed${args.submit ? " and pressed Enter" : ""}. phone_look to check.`;
    },
  );

  reg(
    "phone_swipe",
    "Scroll or swipe: direction up (see what's below), down (see what's above), left or right, by about one screen.",
    { type: "object", properties: { direction: { type: "string", enum: ["up", "down", "left", "right"] } }, required: ["direction"] },
    async (args, taskId) => {
      const device = dev(taskId);
      const { width: w, height: h } = await device.size();
      const dir = String(args.direction);
      const [x1, y1, x2, y2] = dir === "up" ? [w / 2, h * 0.75, w / 2, h * 0.3] : dir === "down" ? [w / 2, h * 0.3, w / 2, h * 0.75] : dir === "left" ? [w * 0.85, h / 2, w * 0.15, h / 2] : [w * 0.15, h / 2, w * 0.85, h / 2];
      note(taskId, { kind: "swipe" });
      await device.swipe(x1, y1, x2, y2, 350);
      await Bun.sleep(500);
      return `Swiped ${dir}. phone_look to read it.`;
    },
  );

  const KEYS: Record<string, string> = { back: "KEYCODE_BACK", home: "KEYCODE_HOME", recents: "KEYCODE_APP_SWITCH", enter: "KEYCODE_ENTER", delete: "KEYCODE_DEL" };
  reg(
    "phone_key",
    "Press one of the phone's keys: back, home, recents, enter or delete.",
    { type: "object", properties: { key: { type: "string", enum: Object.keys(KEYS) } }, required: ["key"] },
    async (args, taskId) => {
      const k = KEYS[String(args.key)];
      if (!k) throw new Error(`unknown key ${args.key}`);
      note(taskId, { kind: "key", label: String(args.key) });
      await dev(taskId).key(k);
      await Bun.sleep(400);
      return `Pressed ${args.key}.`;
    },
  );

  reg("phone_apps", "List the apps on Ducter's phone (their ids). The user installs new ones from Google Play, or asks you to.", { type: "object", properties: {} }, async (_args, taskId) => {
    const apps = (await dev(taskId).apps()).filter((a) => !blockedApp(a.pkg));
    return apps.length ? apps.map((a) => a.pkg).sort().join("\n") : "No apps to open.";
  });

  reg(
    "phone_open_app",
    "Open an app on the phone by its id (from phone_apps), e.g. com.android.settings or com.android.vending (Google Play).",
    { type: "object", properties: { app: { type: "string" } }, required: ["app"] },
    async (args, taskId) => {
      const pkg = String(args.app ?? "").trim();
      if (blockedApp(pkg)) throw new Error("That app holds the user's money or keys: it's theirs alone, and stays closed to tasks.");
      note(taskId, { kind: "open", app: pkg });
      await dev(taskId).launch(pkg);
      await Bun.sleep(1200);
      return `Opened ${pkg}. phone_look to read it.`;
    },
  );

  reg(
    "phone_screenshot",
    "Save a picture of the phone's screen (JPEG in your evidence folder); returns its path. To let the user see it, put the path in your report's `show`.",
    { type: "object", properties: { name: { type: "string" } } },
    async (args, taskId) => {
      const device = dev(taskId);
      const app = await device.front();
      if (blockedApp(app)) throw new Error("No pictures of an app that holds the user's money or keys.");
      note(taskId, { kind: "shot" });
      const dir = d.evidenceDir(taskId);
      mkdirSync(dir, { recursive: true });
      const name = String(args.name ?? "phone").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "phone";
      const path = join(dir, `${name}-${now()}.jpg`);
      writeFileSync(path, await device.jpeg());
      return path;
    },
  );

  const ask = (taskId: string, q: Question, summary: string) => {
    const card = d.tasks.get(taskId);
    const body: Bodies["report"] = { taskId, state: "needs_input", summary, questions: [q], evidence: [] };
    d.log.append({ persona: card?.persona, stream: `task:${taskId}`, origin: "task", kind: "report", body });
    d.tasks.setState(taskId, "needs_you", (card?.residency as any) ?? "hot");
  };

  reg(
    "phone_ask_go",
    "Ask the user's Go for one tap that pays, buys, sends, posts, deletes, installs, calls, confirms or signs out. `what` is one plain sentence in the user's language of what will happen (\"发给妈妈：周六见\"); `app` is the app's name as the user knows it, in their language (\"信息\", \"小红书\"), never its id; ref is the button's [number] from the last phone_look. Then end your turn; after Go, tap that button once.",
    { type: "object", properties: { what: { type: "string" }, app: { type: "string" }, ref: { type: "number" } }, required: ["what", "app", "ref"] },
    async (args, taskId) => {
      const s = screens.get(taskId);
      const n = nodeAt(s, args.ref);
      const effect = effectOf(n.label) ?? "confirm";
      const what = String(args.what ?? "").trim().slice(0, 200);
      const app = s!.app;
      const name = String(args.app ?? "").trim().slice(0, 40);
      ask(taskId, { id: "phone_go", text: what, blocking: true, default: "Go", reversible: false, phone: { kind: "go", app, ...(name && !/^[a-z][\w]*(\.[\w]+)+$/i.test(name) ? { name } : {}), label: n.label, effect } }, what);
      return `Asked the user's Go for "${n.label}" (${what}). End your turn now. After Go you'll get a message; phone_look, then tap it once.`;
    },
  );

  reg(
    "phone_ask_user",
    "When the work needs the user on the phone (signing in to an app, a code, a CAPTCHA): ask them to do it themselves on Ducter's phone, in a live view (you can't see it while they do). `what` is one short sentence for them (\"在小红书里登录你的账号\"). Then end your turn; a message arrives when they're done.",
    { type: "object", properties: { what: { type: "string" }, app: { type: "string", description: "The app it's in, when you know its id." } }, required: ["what"] },
    async (args, taskId) => {
      const what = String(args.what ?? "").trim().slice(0, 200);
      const app = typeof args.app === "string" && args.app.trim() ? args.app.trim() : (screens.get(taskId)?.app ?? "");
      ask(taskId, { id: "phone_user", text: what, blocking: true, default: "Done", reversible: false, phone: { kind: "user", ...(app ? { app } : {}) } }, what);
      return "Asked the user to do it on the phone. End your turn now; when they're done you'll get a message, then phone_look.";
    },
  );

  return {
    allow(taskId, a) {
      allowed.set(taskId, { ...a, until: now() + GO_MS });
    },
    last: (taskId) => screens.get(taskId),
  };
}
