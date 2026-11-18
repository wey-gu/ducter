// D377: the person's own AI agents' records on a computer for tasks, as one row on its card: the
// agents that kept records there (their coins), whether the partner may read them, what is read,
// and the one thing to do (读它们留下的记录 / Read what they keep, or 别再看了 / Stop looking). The
// yes is saved on that computer itself (core worker-records.ts). Shown only while looking is on at
// the home and the computer has records or said yes (DeviceView.records). The Mac's is
// apps/desktop/internal/views/workerrecords.go.
import type { DeviceView } from "@ducter/protocol";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { Coin } from "./coin.tsx";
import { harnessName } from "./format.ts";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The agents as words: "Claude Code和Codex" / "Claude Code and Codex". */
export function recordsAgents(ids: string[]): string {
  const names = ids.map(harnessName);
  if (names.length <= 1) return names[0] ?? "";
  return t("wrec.and", names.slice(0, -1).join(t("wrec.comma")), names.at(-1)!);
}

export function RecordsOnDevice({ dv }: { dv: DeviceView }) {
  const r = dv.records;
  if (!r) return null;
  const awake = dv.state === "awake";
  const agents = r.agents.map((a) => a.agent);
  const words = recordsAgents(agents);
  const name = A.defaultName();
  const on = r.state === "on";
  const answer = A.recordsAnswer?.device === dv.id ? A.recordsAnswer.reason : undefined;
  return (
    <div class={`ag-row wrec ${r.state}`}>
      <div class="ag-head">
        <span class="wrec-coins" aria-hidden="true">
          {(agents.length ? agents : ["claude-code"]).slice(0, 3).map((h) => (
            <span class="ag-coin" key={h}>
              <Coin harness={h} size={36} off={!on} />
            </span>
          ))}
        </span>
        <span class="ag-t">
          <b>{t("wrec.title")}</b>
          <small class={on ? "ok" : ""}>{t(`wrec.${r.state}`)}</small>
        </span>
      </div>
      <p class="wmem-why">{on ? t("wrec.why.on", name, dv.name, words) : t("wrec.why", dv.name, words, name)}</p>
      <p class="wmem-why soft">{t("wrec.scope")}</p>
      {/* The one thing to do, under what it means (the card's column is narrow for a long label). */}
      <div class="wrec-go">
        <Btn kind={on ? "secondary" : "primary"} size="sm" label={t(on ? "wrec.stop" : "wrec.allow")} about={t("wrec.title")} disabled={!awake} onClick={() => A.recordsAllow(dv.id, !on)} />
      </div>
      {answer && <div class="ag-answer warn">{t(answer === "away" ? "wrec.away" : "wrec.old", dv.name)}</div>}
    </div>
  );
}
