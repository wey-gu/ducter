// D169, D466: Nowledge Mem in the person's own AI agents. The action on an agent's Mem line (in its
// coin detail, and in Settings › 记忆 for the ones worth a tap) asks in place first: what the tap
// does (install, update from one version to the next, keep one of several copies, sort it out),
// what it changes and where; only then one task on that computer follows Mem's own guide.
import type { DeviceHarness, DeviceView } from "@ducter/protocol";
import { MEM_CONNECT_TOOLS } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn } from "./controls.tsx";
import { harnessName, memAsk, memWords, shownDeviceName, spoken } from "./format.ts";
import { GBlock, GRow, Tile } from "./set-grid.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/**
 * D552: the line as this window knows it: from the tap until the home answers, busy (the button reads
 * 更新中… at once, so a second tap has nothing to press).
 */
export function memLine(dv: DeviceView, h: DeviceHarness) {
  const m = h.mem!;
  // The home's own word (its task, its busy, or the line moved on) ends this window's.
  if (m.taskId || m.busy || m.updated || m.fresh || m.state === "installed") {
    A.memSent.delete(`${dv.id}:${h.harness}`);
    return m;
  }
  return A.memSending(dv.id, h.harness) ? { ...m, busy: true as const } : m;
}

/** The ask in place: one bold question, what changes and where, then its button and Cancel. */
export function MemAsk({ dv, h, onDone }: { dv: DeviceView; h: DeviceHarness; onDone: () => void }) {
  const agent = harnessName(h.harness);
  const about = spoken(A.L, agent, "Nowledge Mem");
  // D375: Mem's own command first where it has one for this agent and the plugin isn't there.
  const w = memAsk(A.L, h.mem!, agent, dv.name, !!MEM_CONNECT_TOOLS[h.harness] && h.mem!.state === "absent");
  return (
    <div class="dev-cut">
      <div class="dev-cut-q">{w.ask}</div>
      <div class="small sub">{w.means}</div>
      <div class="btns">
        <Btn kind="secondary" size="sm" label={w.ok} about={about} onClick={() => (A.installMem(dv.id, h.harness), onDone())} />
        <Btn kind="text" size="sm" label={t("memp.cancel")} about={about} onClick={onDone} />
      </div>
    </div>
  );
}

/**
 * D569: whether an update (or any setup) can run on that computer from here, as the home runs it
 * (core mem-plugins.ts openSetup): the computer awake and any AI signed in there, not only the one
 * whose plugin it is (a worker's Claude Code signed out there hid the button while its Codex could
 * do it). "" when it can; else why not, said under the row, and nothing offers an update.
 */
export function memCant(dv: DeviceView): "" | "away" | "no_agent" {
  if (dv.state !== "awake") return "away";
  return (dv.harnesses ?? []).some((x) => x.installed && x.loggedIn) ? "" : "no_agent";
}

const answerFor = (dv: DeviceView, h: DeviceHarness) => (A.memAnswer?.device === dv.id && A.memAnswer.harness === h.harness ? A.memAnswer.reason : undefined);

/**
 * D169: the action under an agent's Nowledge Mem line in its coin detail. A computer that is away,
 * or an agent not signed in there, shows the line alone.
 */
export function MemAction({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const [asking, setAsking] = useState(false);
  if (!h.mem || !h.installed) return null;
  const w = memWords(A.L, memLine(dv, h), harnessName(h.harness), h.harness);
  const about = spoken(A.L, harnessName(h.harness), "Nowledge Mem");
  if (w.busy)
    return (
      <div class="btns">
        <Btn kind="secondary" size="sm" label={w.busy} about={about} busy onClick={() => {}} />
      </div>
    );
  if (!w.action || memCant(dv)) return null;
  const answer = answerFor(dv, h);
  return (
    <>
      {asking ? (
        <MemAsk dv={dv} h={h} onDone={() => setAsking(false)} />
      ) : (
        <div class="btns">
          <Btn kind="secondary" size="sm" label={w.action} about={about} onClick={() => setAsking(true)} />
        </div>
      )}
      {answer && <div class="ln warn">{t(`memp.why.${answer}`)}</div>}
    </>
  );
}

/** D466: the agents whose Mem is worth a tap (a newer version out, several copies), or being seen to now. */
export function memPluginRows(devices: DeviceView[] | undefined): { dv: DeviceView; h: DeviceHarness }[] {
  const out: { dv: DeviceView; h: DeviceHarness }[] = [];
  const list = [...(devices ?? [])].sort((a, b) => Number(b.home) - Number(a.home));
  for (const dv of list)
    for (const h of dv.harnesses ?? []) {
      const m = h.mem;
      if (!m || !h.installed) continue;
      // D552: and one that just updated, so its row says the version it reached before it goes.
      if (m.state === "update" || (m.state === "review" && m.why === "multiple") || m.updated) out.push({ dv, h });
    }
  return out;
}

/** One agent on one computer: its coin, who and where, the line, its one action asked in place. */
function MemPluginRow({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const [asking, setAsking] = useState(false);
  const agent = harnessName(h.harness);
  const w = memWords(A.L, memLine(dv, h), agent, h.harness);
  const cant = w.action ? memCant(dv) : "";
  const can = !!w.action && !cant;
  const answer = answerFor(dv, h);
  return (
    <>
      <GRow tile={<Tile><Coin harness={h.harness} size={36} /></Tile>} title={t("memp.row", agent, shownDeviceName(dv.name))} line={w.line}>
        {w.busy ? <Btn kind="secondary" size="sm" label={w.busy} about={spoken(A.L, agent, "Nowledge Mem")} busy onClick={() => {}} /> : can && !asking && <Btn kind="secondary" size="sm" label={w.action!} about={spoken(A.L, agent, "Nowledge Mem")} onClick={() => setAsking(true)} />}
      </GRow>
      {cant && (
        <GBlock>
          <small class="mem-why">{t(`memp.cant.${cant}`, shownDeviceName(dv.name))}</small>
        </GBlock>
      )}
      {can && asking && (
        <GBlock>
          <MemAsk dv={dv} h={h} onDone={() => setAsking(false)} />
        </GBlock>
      )}
      {answer && (
        <GBlock>
          <small class="mem-why">{t(`memp.why.${answer}`)}</small>
        </GBlock>
      )}
    </>
  );
}

/** D466: in Settings › 记忆's Nowledge Mem group, one row per agent per computer worth a tap; none when nothing is. */
export function MemPluginRows() {
  const rows = memPluginRows(A.devices);
  return (
    <>
      {rows.map(({ dv, h }) => (
        <MemPluginRow key={`${dv.id}:${h.harness}`} dv={dv} h={h} />
      ))}
    </>
  );
}
