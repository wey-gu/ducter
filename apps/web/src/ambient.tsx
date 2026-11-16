// D306: at a glance, without opening the app. In the iPhone and Android apps an opened task offers
// 在锁屏上显示 / Show on the Lock Screen (iPhone, a Live Activity) or 在通知栏显示 / Show in
// notifications (Android, an ongoing notification): the person chooses what to keep in sight; never
// every task. A call that goes live while the app is open shows by itself (it is in their name and
// short). The app draws the phase only (packages/protocol/src/ambient.ts); the title stays on the
// phone. While the page is alive it keeps each one true itself; on the iPhone the home's push does
// the rest (core/src/ambient.ts).
import { ambientEnded, ambientWords, callPhase, taskPhase, type AmbientKind, type AmbientPhase } from "@ducter/protocol/src/ambient.ts";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { inApp, nativeCall, nativeInfo } from "./native.ts";
import { attention, finished, title, type Task } from "./store.ts";

type Key = `${AmbientKind}:${string}`;

/** What the app can do, and what it shows now (asked once per page, then kept here). */
const st = {
  asked: false,
  on: false,
  shown: new Map<Key, AmbientPhase>(),
  /** Calls already shown once by themselves (a call the person removed isn't put back). */
  autoCalls: new Set<string>(),
};

const now = () => Math.floor(Date.now() / 1000);
const words = () => ambientWords(A.L.locale);

async function ask() {
  if (st.asked || !inApp()) return;
  st.asked = true;
  const r = await nativeCall<{ on?: boolean; shown?: { kind: AmbientKind; id: string }[] }>({ t: "glance.shown" });
  st.on = !!r?.on;
  for (const s of r?.shown ?? []) st.shown.set(`${s.kind}:${s.id}`, "working");
  A.changed();
}

/** Show or take away one thing. */
export async function setShown(kind: AmbientKind, id: string, name: string, phase: AmbientPhase, on: boolean) {
  const k: Key = `${kind}:${id}`;
  if (!on) {
    st.shown.delete(k);
    A.changed();
    await nativeCall({ t: "glance.end", kind, id });
    return;
  }
  st.shown.set(k, phase);
  A.changed();
  const r = await nativeCall<{ ok?: boolean }>({ t: "glance.start", kind, id, title: name, phase, since: now() });
  if (!r?.ok) {
    st.shown.delete(k);
    A.changed();
  }
}

/** After each frame: every shown thing's phase, said to the app when it changed; live calls shown. */
export function syncAmbient() {
  if (!st.on) return;
  for (const [k, was] of st.shown) {
    const [kind, id] = k.split(":") as [AmbientKind, string];
    let phase: AmbientPhase | undefined;
    if (kind === "task") {
      const t = A.S.tasks.get(id);
      if (t) phase = taskPhase(attention(t));
    } else {
      const c = A.S.onHand?.calls?.find((x) => x.callId === id);
      if (c) phase = callPhase(c.state);
    }
    if (!phase || phase === was) continue;
    void nativeCall({ t: "glance.update", kind, id, phase, since: now() });
    if (ambientEnded(phase)) st.shown.delete(k);
    else st.shown.set(k, phase);
  }
  for (const c of A.S.onHand?.calls ?? []) {
    const phase = callPhase(c.state);
    if (!phase || ambientEnded(phase) || st.autoCalls.has(c.callId)) continue;
    st.autoCalls.add(c.callId);
    void setShown("call", c.callId, c.plan.name || c.plan.to, phase, true);
  }
}

/** The switch in an opened task (the app only, and only while the task is under way). */
export function AmbientLine({ task }: { task: Task }) {
  void ask();
  if (!st.on || finished(task)) return null;
  const w = words();
  const ios = nativeInfo()?.platform === "ios";
  const on = st.shown.has(`task:${task.id}`);
  const label = on ? (ios ? w.hideIos : w.hideAndroid) : ios ? w.showIos : w.showAndroid;
  return (
    <div class="outcome watch-row ambient-line">
      {!on && <div class="said small sub">{w.note}</div>}
      <Btn kind="secondary" size="sm" label={label} about={title(task)} onClick={() => void setShown("task", task.id, title(task), taskPhase(attention(task)), !on)} />
    </div>
  );
}

/** For tests: forget what this page knew. */
export function resetAmbient(on = false) {
  st.asked = on;
  st.on = on;
  st.shown.clear();
  st.autoCalls.clear();
}

A.onAmbient = syncAmbient;
