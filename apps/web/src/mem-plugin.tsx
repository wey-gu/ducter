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

const answerFor = (dv: DeviceView, h: DeviceHarness) => (A.memAnswer?.device === dv.id && A.memAnswer.harness === h.harness ? A.memAnswer.reason : undefined);

/**
 * D169: the action under an agent's Nowledge Mem line in its coin detail. A computer that is away,
 * or an agent not signed in there, shows the line alone.
 */
export function MemAction({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const [asking, setAsking] = useState(false);
  if (!h.mem || !h.installed || !h.loggedIn) return null;
  const w = memWords(A.L, h.mem);
  if (!w.action || dv.state !== "awake") return null;
  const about = spoken(A.L, harnessName(h.harness), "Nowledge Mem");
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
      if (m.state === "update" || (m.state === "review" && m.why === "multiple")) out.push({ dv, h });
    }
  return out;
}

/** One agent on one computer: its coin, who and where, the line, its one action asked in place. */
function MemPluginRow({ dv, h }: { dv: DeviceView; h: DeviceHarness }) {
  const [asking, setAsking] = useState(false);
  const agent = harnessName(h.harness);
  const w = memWords(A.L, h.mem!, agent);
  const can = !!w.action && h.loggedIn && dv.state === "awake";
  const answer = answerFor(dv, h);
  return (
    <>
      <GRow tile={<Tile><Coin harness={h.harness} size={36} /></Tile>} title={t("memp.row", agent, shownDeviceName(dv.name))} line={w.line}>
        {can && !asking && <Btn kind="secondary" size="sm" label={w.action!} about={spoken(A.L, agent, "Nowledge Mem")} onClick={() => setAsking(true)} />}
      </GRow>
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
