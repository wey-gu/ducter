// D235, 用电脑 / Use the computer: tasks use the apps on a Mac (the home or a worker), gated at
// the effect. Its ⓘ on the card (how it works; added without macOS's two switches, which ones and
// the guide that opens on that Mac), the tasks in its apps under the chips with 停下 / Stop, and
// the opened task's line. The same rules as the Mac's (apps/desktop/internal/views/computeruse.go).
import type { DeviceView } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn } from "./controls.tsx";
import { finished, type Task } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const send = (f: Parameters<typeof A.send>[0]) => A.send(f);
const ACTIVE = ["working", "queued", "needs_you", "blocked"];

/** In 用电脑's ⓘ: how it works when on; the two switches and the guide when they're missing. */
export function ComputerInfo({ dv }: { dv: DeviceView }) {
  const [sent, setSent] = useState(false);
  const ab = dv.abilities.find((a) => a.id === "computer");
  if (!ab) return null;
  if (ab.state === "on") return <div class="small sub">{t("computeruse.where", dv.name)}</div>;
  if (ab.state === "unavailable" && ab.reason === "cua_missing") return <div class="small sub">{t("computeruse.cua_missing")}</div>;
  if (ab.state !== "unavailable" || ab.reason !== "computer_permissions") return null;
  const rows: [string, boolean][] = [
    ["computeruse.perm.accessibility", !!ab.perms?.accessibility],
    ["computeruse.perm.screen", !!ab.perms?.screen],
  ];
  return (
    <>
      <div class="small">{t("computeruse.perms", dv.name)}</div>
      <ul class="cu-perms">
        {rows.map(([k, on]) => (
          <li key={k} class={on ? "on" : "off"}>
            <span>{t(k)}</span>
            <b>{t(on ? "computeruse.perm.on" : "computeruse.perm.off")}</b>
          </li>
        ))}
      </ul>
      <div class="small sub">{t("computeruse.perms.how")}</div>
      {sent ? (
        <div class="small" role="status">{t("computeruse.guide.sent", dv.name)}</div>
      ) : (
        dv.state === "awake" && (
          <div class="btns">
            <Btn kind="secondary" size="sm" label={t("computeruse.guide", dv.name)} onClick={() => (setSent(true), send({ t: "computer_grant", device: dv.id }))} />
          </div>
        )
      )}
      {dv.state === "awake" && <Btn kind="text" size="sm" label={t("computeruse.remove")} about={t("chip.computer")} onClick={() => send({ t: "ability", device: dv.id, ability: "computer", on: false })} />}
    </>
  );
}

/** Under the chips: each task in this Mac's apps now, with 停下 / Stop. */
export function ComputerBlock({ dv }: { dv: DeviceView }) {
  const busy = (A.S.onHand?.tasks ?? []).filter((c) => c.computing?.device === dv.id && ACTIVE.includes(c.attention));
  if (!busy.length) return null;
  return (
    <div class="dev-browsing">
      {busy.map((c) => (
        <div class="dev-site" key={c.taskId}>
          <Coin harness={c.harness} size={20} motion={c.attention === "working" ? "working" : "still"} />
          <div class="dev-site-what">
            <div class="small">{c.computing?.app ? t("computeruse.using", c.title, c.computing.app) : t("computeruse.using.0", c.title)}</div>
          </div>
          <Btn kind="secondary" size="sm" label={t("computeruse.stop")} about={c.title} onClick={() => send({ t: "computer_stop", taskId: c.taskId })} />
        </div>
      ))}
    </div>
  );
}

/** On the opened task: where it is using the person's apps, and 停下 / Stop. */
export function ComputerLine({ task }: { task: Task }) {
  if (finished(task)) return null;
  const cu = A.S.onHand?.tasks.find((c) => c.taskId === task.id)?.computing;
  if (!cu) return null;
  const name = (A.devices ?? []).find((d) => d.id === cu.device)?.name ?? cu.device;
  const line = cu.app ? t("computeruse.task", name, cu.app) : t("computeruse.task.0", name);
  return (
    <div class="outcome watch-row">
      <div class="said">{line}</div>
      <Btn kind="secondary" size="sm" label={t("computeruse.stop")} about={line} onClick={() => send({ t: "computer_stop", taskId: task.id })} />
    </div>
  );
}
