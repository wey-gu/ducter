// D382: 晚点再问我 / Ask me later on an ask: a quiet text button beside Reply… opens the times
// (今晚 20:00 · 明早 8:00 · 下周一 8:00 · 选个时间…), each its own chip with its own time, and one
// line under them that nothing happens before then. Put off, the card says when it asks again,
// with 现在就定 / Decide now; back, it says so once above its buttons. Shared by the conversation's
// ask, the decision card on On hand and the opened task.
import { laterable, laterChoices, laterRefusal, MORNING_DEFAULT, pickedTime, type LaterChoice } from "@ducter/protocol";
import { A } from "./app.ts";
import { Btn, Choice } from "./controls.tsx";
import { clock, spoken, when } from "./format.ts";
import type { DecisionState } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Whether this open card offers 晚点再问我. */
export const laterOffered = (d: DecisionState) => laterable(d) && !d.later;

/** The morning it offers: the end of the person's quiet hours, else 8:00. */
const morning = () => A.settings?.quiet?.end || MORNING_DEFAULT;

/** A choice's words: "今晚 20:00" / "Tonight, 20:00". */
export function choiceWords(c: LaterChoice): string {
  const at = clock(c.at);
  if (c.key === "tonight") return t("later.tonight", at);
  if (c.key === "morning") return t(c.today ? "later.morning.today" : "later.morning", at);
  return t("later.monday", at);
}

/** The button beside Reply… */
export function LaterButton({ d, about, size, line }: { d: DecisionState; about: string; size?: "sm"; line?: boolean }) {
  if (!laterOffered(d)) return null;
  const on = A.laterOpen.has(d.decisionId);
  // In the conversation it sits on the default's own line: the other way than letting the time run.
  if (line)
    return (
      <button
        class="tb later-tb"
        aria-expanded={on}
        aria-label={spoken(A.L, t("later.ask"), about)}
        onClick={() => {
          on ? A.laterOpen.delete(d.decisionId) : A.laterOpen.add(d.decisionId);
          A.replyOpen.delete(d.decisionId);
          A.changed();
        }}
      >
        {t("later.ask")}
      </button>
    );
  return (
    <Btn
      kind="text"
      size={size}
      label={t("later.ask")}
      about={about}
      expanded={on}
      onClick={() => {
        on ? A.laterOpen.delete(d.decisionId) : A.laterOpen.add(d.decisionId);
        A.replyOpen.delete(d.decisionId);
        A.changed();
      }}
    />
  );
}

/** The times, when the button is open. */
export function LaterTimes({ d }: { d: DecisionState }) {
  if (!laterOffered(d) || !A.laterOpen.has(d.decisionId)) return null;
  const now = new Date();
  const pick = A.laterPick.get(d.decisionId);
  const at = pick ? pickedTime(now, pick.day, pick.clock) : undefined;
  const bad = pick && pick.clock.trim() ? (!at ? "clock" : laterRefusal(at.getTime(), now.getTime())) : "";
  return (
    <div class="later" role="group" aria-label={t("later.ask")}>
      <div class="later-times">
        {laterChoices(now, morning()).map((c) => (
          <button key={c.key} class="nt-chip" onClick={() => A.later(d.decisionId, new Date(c.at))}>
            {choiceWords(c)}
          </button>
        ))}
        <Choice label={t("later.pick")} on={!!pick} onClick={() => (A.laterPick.set(d.decisionId, { day: now.getHours() >= 20 ? 1 : 0, clock: "" }), A.changed())}>
          {t("later.pick")}
        </Choice>
      </div>
      {pick && (
        <div class="later-pick">
          {[0, 1, 2].map((i) => (
            <Choice key={i} label={t(`newtask.day.${i}`)} on={pick.day === i} onClick={() => (A.laterPick.set(d.decisionId, { ...pick, day: i }), A.changed())}>
              {t(`newtask.day.${i}`)}
            </Choice>
          ))}
          <input
            class="later-clock"
            inputMode="numeric"
            aria-label={t("newtask.at")}
            placeholder="9:00"
            value={pick.clock}
            onInput={(e) => (A.laterPick.set(d.decisionId, { ...pick, clock: (e.target as HTMLInputElement).value }), A.changed())}
            onKeyDown={(e) => e.key === "Enter" && at && !bad && A.later(d.decisionId, at)}
          />
          <Btn kind="secondary" size="sm" label={t("later.then")} disabled={!at || !!bad} onClick={() => at && A.later(d.decisionId, at)} />
        </div>
      )}
      <div class="dl later-note">{bad ? t(bad === "far" ? "later.bad.far" : "later.bad.past") : t("later.note")}</div>
    </div>
  );
}

/** Put off: when it asks again, and 现在就定 / Decide now. */
export function LaterAway({ d, about }: { d: DecisionState; about: string }) {
  if (!d.later) return null;
  return (
    <div class="later-away" role="status">
      <span class="dl">{t("later.away", when(A.L, d.later))}</span>
      <Btn kind="text" size="sm" label={t("later.now")} about={about} onClick={() => A.later(d.decisionId, null)} />
    </div>
  );
}

/** Back from being put off: said once on the card, above its buttons. */
export function LaterBack({ d }: { d: DecisionState }) {
  if (!d.backAt || d.later) return null;
  return <div class="later-back">{t("later.back")}</div>;
}
