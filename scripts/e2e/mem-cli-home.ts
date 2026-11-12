// D225's check on a Linux home like hel, inside a container (never hel itself): the real core with a
// silent partner, and Settings › 伙伴 › 你的其他 AI driven over the socket as the clients do.
//
//   bun scripts/e2e/mem-cli-home.ts serve                 # the home (DUCTER_DATA_DIR, DUCTER_PORT)
//   bun scripts/e2e/mem-cli-home.ts view                  # print the row's state, as JSON
//   bun scripts/e2e/mem-cli-home.ts install               # tap 装上 / 更新; print each state it passes
//   bun scripts/e2e/mem-cli-home.ts sign-in <link>        # paste a connect link; print each state
//
// The steps around it (a home with no nmem, then pipx, then an old pip copy as on hel) are run by
// the caller with `docker exec`; research/66 §6 records a run. Nothing here reaches Mem except what
// the row itself runs (`nmem --version`, `status`, and on the tap the official install).
import type { ServerFrame } from "../../packages/protocol/src/index.ts";

const [mode, arg] = process.argv.slice(2);
const port = Number(process.env.DUCTER_PORT || 7795);

if (mode === "serve") {
  const { startCore, stubRunner } = await import("../../packages/core/src/index.ts");
  const core = startCore({
    persona: { id: "default", name: "Ducter", identity: "" },
    port,
    deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "server" },
  });
  core.setRunner(stubRunner(core));
  core.setPartner({ onTrigger() {} });
  // As main.ts: Mem put in or signed in from the row → connected (the identity is bound there).
  core.bridgeLink.onMemReady(() => core.settings.setMemState("connected"));
  console.log(`[mem-cli-home] up on ${core.url} (data: ${core.dataDir})`);
} else {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const seen: string[] = [];
  let last: ServerFrame | undefined;
  const done = new Promise<void>((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    ws.onmessage = (m) => {
      const f = JSON.parse(String(m.data)) as ServerFrame;
      if (f.t !== "settings" || !f.bridge) return;
      last = f;
      const line = JSON.stringify(f.bridge);
      if (seen.at(-1) !== line) {
        seen.push(line);
        console.log(line);
      }
      const busy = ["installing", "updating", "signing_in", "connecting"].includes(f.bridge.state);
      if (quiet) clearTimeout(quiet);
      if (mode === "view" || (!busy && seen.length > 1)) quiet = setTimeout(resolve, mode === "view" ? 10 : 1500);
    };
  });
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  ws.send(JSON.stringify({ t: "settings" }));
  await Bun.sleep(1500);
  if (mode === "install") ws.send(JSON.stringify({ t: "bridge_mem_install" }));
  if (mode === "sign-in") ws.send(JSON.stringify({ t: "bridge_mem_sign_in", link: arg ?? "" }));
  if (mode === "connect") ws.send(JSON.stringify({ t: "bridge_connect" }));
  await Promise.race([done, Bun.sleep(12 * 60_000)]);
  ws.close();
  process.exit(last ? 0 : 1);
}
