// D325: DEMO_STEER=1: a task at work with the composer's two ways of talking to it: a steer its
// next step took in (它看到了), one it hasn't reached yet, and two messages held for after this
// turn. A pretend runner answers like the real one: a steer is read a few seconds later and
// answered; After this is held at the home (changed, taken back, said now); the turn ends after a
// while and what is held goes as the next turn.
import type { Bodies, HeldMsg, MediaRef } from "@ducter/protocol";
import type { CoreApi, Runner } from "@ducter/protocol/src/internal.ts";

const ID = "t_steer";

export async function seedSteer(core: CoreApi & { setRunner(r: Runner): void }, zh: boolean, tick: () => Promise<void>) {
  const log = core.log;
  const stream = `task:${ID}`;
  const ev = (b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream, origin: "task", kind: "task_event", body: { taskId: ID, ...b } });
  let held: HeldMsg[] = [];
  const setHeld = (h: HeldMsg[]) => {
    held = h;
    log.append({ stream, origin: "task", kind: "task_held", body: { taskId: ID, held } });
  };
  const said = (text: string, delivered: string, clientId?: string, media?: MediaRef[]) =>
    ev({ role: "user", from: "user", text, ...(clientId ? { clientId } : {}), ...(media?.length ? { media } : {}), raw: { delivered } });
  const working = () => core.tasks.get(ID)?.attention === "working";
  /** A steer is read at the agent's next step (a few seconds), then answered. */
  const readSoon = (seq: number, text: string) =>
    setTimeout(() => {
      ev({ role: "system", from: "runner", raw: { read: [seq] } });
      ev({ role: "assistant", text: zh ? `好，${text.replace(/[。.]$/, "")}。` : `OK: ${text}` });
    }, 3500);

  log.append({ stream, origin: "partner", kind: "task_open", body: { taskId: ID, title: zh ? "把购物车的结算改成分步" : "Split the cart checkout into steps", project: "shop", place: { kind: "repo", device: "MacBook", repoPath: "~/dev/shop", branch: "ducter/checkout-steps", baseBranch: "main" }, harness: "claude-code", model: "opus", brief: zh ? "把 src/cart.ts 的结算拆成地址、付款、确认三步，测试要过。" : "Split checkout in src/cart.ts into address, payment and confirm; keep the tests green." } });
  core.tasks.setState(ID, "working", "hot");
  ev({ role: "assistant", text: zh ? "先看一下现在的结算流程和测试。" : "Looking at the current checkout flow and its tests first." });
  ev({ role: "tool", tool: { name: "Read", input: { file_path: "src/cart.ts" }, output: "export function checkout(cart) {…}", ok: true } });
  const s1 = said(zh ? "地址那一步先用测试环境的接口" : "Use the staging API for the address step", "steer", "seed1");
  ev({ role: "system", from: "runner", raw: { read: [s1.seq] } });
  ev({ role: "assistant", text: zh ? "好，地址那一步改用测试环境的接口。" : "OK, the address step uses the staging API now." });
  ev({ role: "tool", tool: { name: "Bash", input: { command: "bun test src/cart.test.ts" }, output: "12 pass\n0 fail", ok: true } });
  said(zh ? "确认页别显示完整卡号" : "Don't show the full card number on the confirm page", "steer", "seed2");
  setHeld([
    { id: "seed3", text: zh ? "做完以后把 CHANGELOG 也更新一下" : "When it's done, update the CHANGELOG too", at: new Date().toISOString() },
    { id: "seed4", text: zh ? "然后开一个草稿 PR，标题用中文" : "Then open a draft PR", at: new Date().toISOString() },
  ]);
  await tick();

  const runner: Runner = {
    harness: { start: async () => Promise.reject(new Error("demo")), available: async () => [] },
    openTask: async () => Promise.reject(new Error("demo")),
    async send(taskId, text, mode, _from, clientId, media) {
      if (taskId !== ID) return { delivered: "queued" };
      if (working() && mode === "queue") {
        if (!held.some((h) => h.id === clientId)) setHeld([...held, { id: clientId ?? `h${Date.now()}`, text, at: new Date().toISOString(), ...(media?.length ? { media } : {}) }]);
        return { delivered: "queued" };
      }
      if (working()) {
        const e = said(text, "steer", clientId, media);
        readSoon(e.seq, text);
        return { delivered: "steered" };
      }
      for (const h of held) said(h.text, "turn", h.id, h.media);
      if (held.length) setHeld([]);
      said(text, "turn", clientId, media);
      core.tasks.setState(ID, "working", "hot");
      return { delivered: "prompted" };
    },
    async held(taskId, id, op, text) {
      const i = held.findIndex((h) => h.id === id);
      if (taskId !== ID || i < 0) throw new Error("That message already went to the task.");
      const h = held[i]!;
      if (op === "edit") return setHeld(held.map((x, j) => (j === i ? { ...x, text: (text ?? "").trim() } : x))), {};
      setHeld(held.filter((_, j) => j !== i));
      if (op === "drop") return {};
      return runner.send(ID, h.text, "steer", "user", h.id, h.media);
    },
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(runner);
}
