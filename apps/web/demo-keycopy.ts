// D539: DEMO_KEYCOPY=1: hel's case for the shots: a task waiting in 等你 on its 复制密钥 card, the
// partner's card for hel and haswell in the conversation, and two keys Ducter keeps on this
// computer (fake values, kept in a scratch shelf locked with a file, never the keychain).
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { Core } from "../../packages/core/src/core.ts";
import { createKeyShelf, type KeyShelf } from "../../packages/protocol/src/key-shelf.ts";
import { fileKey } from "../../packages/protocol/src/lock-key.ts";

export function demoShelf(dataDir: string): KeyShelf {
  const dir = join(dataDir, "demo-keys");
  return createKeyShelf({ dataDir: dir, env: {}, shell: async () => undefined, lock: fileKey(join(dir, "kept-keys")) });
}

export async function seedKeyCopy(core: Core, shelf: KeyShelf, zh: boolean) {
  const { sealKey } = await import("../../packages/protocol/src/key-seal.ts");
  const kept = [
    { env: "HCLOUD_TOKEN", name: zh ? "Hetzner API 令牌" : "Hetzner API token", from: "MacBook" },
    { env: "GRAFANA_SA_TOKEN", name: zh ? "Grafana 服务账号令牌" : "Grafana service account token", from: "MacBook" },
  ];
  for (const [i, k] of kept.entries()) {
    const copy = `demo-copy-${i}0000`;
    const { pub } = (await shelf.ops.keys_offer!({ env: k.env, copy })) as { pub: string };
    await shelf.ops.keys_take!({ env: k.env, name: k.name, from: k.from, copy, sealed: sealKey(pub, `demo-not-a-key-${i}`, `${copy}:${k.env}`) });
  }
  const log = core.log;
  const home = { device: "local", name: "hel" };
  const mac = { device: "w1", name: "MacBook" };
  const haswell = { device: "w2", name: "haswell" };
  const env = "STI_MCP_API_KEY";
  const name = zh ? "Prow 日志 MCP 的密钥" : "Prow log MCP key";
  // The person's ask, and the partner's group of three.
  const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "把 Mac 上的 Prow 日志 MCP 迁到 hel 和 haswell 上，两边都配好并验证能用" : "Move the Prow log MCP from my Mac to hel and haswell, set it up on both and check it works" } });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "jk", text: zh ? "好，我先看 Mac 上怎么配的，再去 hel 和 haswell 上配好。" : "On it: I'll look at how the Mac has it, then set it up on hel and haswell.", replyTo: u.seq } });
  const title = zh ? "在 hel 配置并验证 Prow 日志 MCP" : "Set up and check the Prow log MCP on hel";
  log.append({ stream: "task:t_prow", origin: "partner", kind: "task_open", body: { taskId: "t_prow", title, project: "", place: { kind: "none" }, harness: "claude-code", brief: u.seq ? "Prow log MCP on hel" : "" } });
  core.tasks.setState("t_prow", "working", "hot");
  await Bun.sleep(30);
  // The task's ask_for_key: Ducter found it on the Mac; the task waits on its card in 等你.
  const ask: Bodies["decision"]["copyKey"] = { env, name, from: mac, to: [home], source: "shell", why: zh ? "MCP 的配置读这个变量来登录" : "the MCP config signs in with it", taskIds: ["t_prow"] };
  const q = { id: "copy-key", text: zh ? `把 MacBook 上的 ${env} 复制到 hel？` : `Copy ${env} from MacBook to hel?`, blocking: true, reversible: false, copyKey: ask };
  log.append({ stream: "task:t_prow", origin: "task", kind: "report", body: { taskId: "t_prow", state: "needs_input", summary: `Needs ${env} on hel; it is on MacBook.`, questions: [q], evidence: [] } });
  core.tasks.setState("t_prow", "needs_you", "hot");
  await Bun.sleep(30);
  // The partner's own card, for both servers, under one line.
  const u2 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "不能直接把 mac 上的自动迁移过去么" : "Can't you just move the one on the Mac over?" } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "可以，Mac 上就有，我复制过去。" : "Yes, the Mac has it. I'll copy it over.", replyTo: u2.seq } });
  const both: Bodies["decision"] = { decisionId: "d_copy_both", question: zh ? `把 MacBook 上的 ${env} 复制到 hel 和 haswell？` : `Copy ${env} from MacBook to hel and haswell?`, goLabel: zh ? "复制" : "Copy", holdLabel: zh ? "先不" : "Not now", defaultOption: "hold", reversible: false, copyKey: { env, name, from: mac, to: [home, haswell], source: "shell", why: zh ? "两台上的 Prow 日志 MCP 都要它" : "the Prow log MCP needs it on both" } };
  log.append({ stream: "channel", origin: "system", kind: "decision", body: both });
}
