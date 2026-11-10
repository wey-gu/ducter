// 开一件事 / New task, the phone's and the browser's sheet (D128, redone by D185;
// design/new-task.md). The words first, then one row of pills: where (recent folders and the
// projects added on the Mac, D186), its branch, the computer when the choice is real (D157),
// who does it, and when it starts (现在 / Now unless set: a time, a schedule, when something
// happens, or keep going until). A pill opens its list in place under the row. ⌘↩ starts;
// ⇧⌘↩ starts and keeps the sheet for the next one.
import type { Candidate } from "@ducter/protocol";
import { useEffect, useRef } from "preact/hooks";
import { A, candKey, EVERY_HOURS, parseClock, placeKey } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn, MenuRow, Pill, Seg } from "./controls.tsx";
import { candName, candReason, coarse } from "./views.tsx";
import { computerApart, computerOf, computers, manyComputers } from "./where.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** A home path as ~/…: shorter, and no user name on screen. */
const tilde = (p: string) => p.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, "~");

const WHEN_KINDS = ["", "at", "every", "when", "until"] as const;

const Folder = ({ faint }: { faint?: boolean }) => (
  <svg class={`nt-glyph${faint ? " faint" : ""}`} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 4h4l1.5 1.5H14v7H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
  </svg>
);
const Branch = () => (
  <svg class="nt-glyph" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M4 2v10M10 4.5V6L4 9.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    <circle cx="10" cy="3.2" r="1.8" fill="currentColor" />
    <circle cx="4" cy="12" r="1.8" fill="currentColor" />
  </svg>
);
const Clock = () => (
  <svg class="nt-glyph" viewBox="0 0 14 14" aria-hidden="true">
    <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M7 4v3.2l2 1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

/** The when pill's words: 现在 / Now, 明天 9:00, 工作日 9:00, 等某件事发生. */
function whenLabel(): string {
  const nt = A.nt;
  const clock = (parseClock(nt.atTime) || (nt.atTime ?? "").trim()).replace(/^0(\d)/, "$1");
  switch (nt.when) {
    case "at":
      return `${t(`newtask.day.${nt.atDay ?? 1}`)} ${clock}`;
    case "every":
      return nt.every === 1
        ? t("newtask.pill.weekdays", clock)
        : nt.every === 2
          ? t("newtask.pill.weekly", t(`newtask.weekday.${nt.weekday ?? 1}`), clock)
          : nt.every === 3
            ? t("newtask.pill.hours", EVERY_HOURS[nt.hours ?? 1])
            : t("newtask.pill.daily", clock);
    case "when":
    case "until":
      return t(`newtask.when.${nt.when}`);
  }
  return t("newtask.when.now");
}

const Suggested = () => <small class="suggested">{t("newtask.suggested")}</small>;

export function NewTaskSheet() {
  const nt = A.nt;
  const close = () => ((A.sheet = null), A.changed());
  const ref = useRef<HTMLTextAreaElement>(null);
  const condRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") return nt.list ? ((nt.list = ""), A.changed()) : close();
      // ⌘↩ starts wherever the focus is; ⇧⌘↩ starts and keeps the sheet for the next one.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.preventDefault(), A.startNewTask(e.shiftKey);
    };
    addEventListener("keydown", k);
    // The words are focused where a keyboard is at hand; a phone's would cover the sheet.
    if (!coarse()) ref.current?.focus();
    return () => removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (!nt.started) return;
    if (!coarse()) ref.current?.focus();
  }, [nt.started]);
  const toggle = (name: string) => ((nt.list = nt.list === name ? "" : name), (nt.branchOpen = nt.computerOpen = false), A.changed());
  const opts = A.newTaskOptions;
  const places = A.newTaskPlaces();
  const chosen = A.chosenPlace(places);
  const placeName = (p = chosen) => (p.place.kind === "repo" || p.place.kind === "folder" ? p.name || (p.place.kind === "repo" ? p.place.repoPath : p.place.path).split("/").pop() : t("newtask.nowhere"));
  const pathOf = (p = chosen) => (p.place.kind === "repo" ? p.place.repoPath : p.place.kind === "folder" ? p.place.path : "");
  const branch = chosen.place.kind === "repo" ? nt.branch || chosen.defaultBranch || "" : "";
  const { c: who, picked } = A.chosenCandidate();
  // D157: the computer of No folder, only when the choice is real.
  const { list: whoList, elsewhere } = A.ntCands();
  const multi = (opts?.candidates ?? []).some((c) => c.device) && manyComputers();
  const compId = multi && chosen.place.kind === "none" ? A.ntComputer() : "";
  const comp = compId ? computerOf(compId) : undefined;
  const suggested = multi ? (opts?.candidates ?? []).find((c) => !c.blocked && !c.waits && c.device)?.device : undefined;
  const top = whoList.find((x) => !x.blocked);
  const scheduled = nt.when === "at" || nt.when === "every";
  const start = scheduled ? t("newtask.schedule") : t("newtask.start");
  const pickCand = (c: Candidate) => {
    const best = !!top && candKey(top) === candKey(c);
    if (elsewhere.has(candKey(c)) && c.device) nt.computer = c.device;
    A.pickWho(best && !elsewhere.has(candKey(c)) ? "" : candKey(c));
  };
  const setWhen = (k: (typeof WHEN_KINDS)[number]) => {
    nt.when = k;
    nt.list = "";
    nt.err = "";
    A.changed();
    if (k === "when" || k === "until") requestAnimationFrame(() => condRef.current?.focus());
  };
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="sheet newtask" role="dialog" aria-modal="true" aria-label={t("newtask.title")}>
        <div class="grab" />
        <h2>{t("newtask.title")}</h2>
        <div class="nt-what">
          <textarea
            ref={ref}
            id="nt-words"
            rows={4}
            value={nt.words}
            aria-label={t("newtask.what")}
            placeholder={t("newtask.placeholder")}
            onInput={(e) => ((nt.words = (e.target as HTMLTextAreaElement).value), (nt.err = ""), (nt.started = ""), A.changed())}
          />
          <div class="small sub">{t("newtask.verbatim")}</div>
        </div>
        <div class="nt-pills">
          <Pill label={placeName() ?? ""} about={t("newtask.where")} open={nt.list === "place"} onClick={() => toggle("place")}>
            <Folder />
            <b>{placeName()}</b>
          </Pill>
          {branch && (
            <Pill label={branch} about={t("newtask.branch.title")} open={!!nt.branchOpen} onClick={() => ((nt.list = ""), (nt.computerOpen = false), (nt.branchOpen = !nt.branchOpen), A.changed())}>
              <Branch />
              <code>{branch}</code>
            </Pill>
          )}
          {comp && (
            <Pill label={comp.name} about={t("newtask.computer")} open={!!nt.computerOpen} onClick={() => ((nt.list = ""), (nt.branchOpen = false), (nt.computerOpen = !nt.computerOpen), A.changed())}>
              <b>{comp.name}</b>
            </Pill>
          )}
          {!opts ? (
            <span class="nt-wait small sub">{t("newtask.loading")}</span>
          ) : !who ? (
            <span class="nt-wait small sub">{t("newtask.nobody")}</span>
          ) : (
            <Pill label={candName(who)} about={t("newtask.who")} open={nt.list === "who"} onClick={() => toggle("who")}>
              <Coin harness={who.harness} size={22} off={false} />
              <b>{candName(who)}</b>
              {!picked && <Suggested />}
            </Pill>
          )}
          <Pill label={whenLabel()} about={t("newtask.when")} open={nt.list === "when"} onClick={() => toggle("when")}>
            <Clock />
            <b>{whenLabel()}</b>
          </Pill>
        </div>
        {nt.list === "place" && (
          <div class="nt-list" role="radiogroup" aria-label={t("newtask.where")}>
            <small>{t("newtask.where")}</small>
            {places.map((p) => (
              <MenuRow key={placeKey(p.place)} label={placeName(p) ?? ""} on={placeKey(p.place) === placeKey(chosen.place)} onClick={() => A.pickPlace(p)}>
                <Folder faint={p.place.kind === "none"} />
                <span class="mr-t">
                  <b>{placeName(p)}</b>
                  {pathOf(p) && <code>{tilde(pathOf(p))}</code>}
                </span>
              </MenuRow>
            ))}
          </div>
        )}
        {nt.branchOpen && chosen.branches && (
          <div class="nt-list" role="radiogroup" aria-label={t("newtask.branch.title")}>
            <small>{t("newtask.branch.title")}</small>
            {chosen.branches.map((b) => (
              <MenuRow key={b} label={b} on={b === branch} onClick={() => ((nt.branch = b === chosen.defaultBranch ? "" : b), (nt.branchOpen = false), A.changed())}>
                <code class="grow">{b}</code>
                {b === chosen.defaultBranch && <small>{t("newtask.branch.default")}</small>}
              </MenuRow>
            ))}
          </div>
        )}
        {nt.computerOpen && comp && (
          <div class="nt-list" role="radiogroup" aria-label={t("newtask.computer")}>
            <small>{t("newtask.computer")}</small>
            {computers().map((d) => (
              <MenuRow key={d.id} label={d.name} on={d.id === compId} off={d.state === "unreachable"} onClick={() => ((nt.computer = d.id === suggested ? "" : d.id), (nt.computerOpen = false), (nt.pick = ""), A.changed())}>
                <span class="mr-t">
                  <b>
                    {d.name} {d.id === suggested && <Suggested />}
                  </b>
                  <small>{computerApart(d)}</small>
                </span>
              </MenuRow>
            ))}
          </div>
        )}
        {nt.list === "who" && who && (
          <div class="nt-list" role="radiogroup" aria-label={t("newtask.who")}>
            <small>{t("newtask.who")}</small>
            {whoList.map((c) => {
              const off = !!c.blocked;
              const best = !!top && candKey(top) === candKey(c);
              const away = elsewhere.has(candKey(c));
              return (
                <MenuRow key={candKey(c)} label={candName(c)} on={!off && candKey(c) === candKey(who)} off={off} why={off ? candReason(c) : undefined} onClick={() => pickCand(c)}>
                  <Coin harness={c.harness} size={28} off={off} />
                  <span class="mr-t">
                    <b>
                      {candName(c)} {away && <small>{t("newtask.agent.elsewhere", c.deviceName ?? "")}</small>} {best && <Suggested />}
                    </b>
                    {candReason(c) && <small>{candReason(c)}</small>}
                  </span>
                </MenuRow>
              );
            })}
          </div>
        )}
        {nt.list === "when" && (
          <div class="nt-list" role="radiogroup" aria-label={t("newtask.when")}>
            <small>{t("newtask.when")}</small>
            {WHEN_KINDS.map((k) => (
              <MenuRow key={k || "now"} label={t(`newtask.when.${k || "now"}`)} on={(nt.when ?? "") === k} onClick={() => setWhen(k)}>
                <span class="mr-t">
                  <b>{t(`newtask.when.${k || "now"}`)}</b>
                  <small>{t(`newtask.when.${k || "now"}.help`)}</small>
                </span>
              </MenuRow>
            ))}
          </div>
        )}
        {nt.when === "at" && (
          <div class="nt-detail">
            <Seg label={t("newtask.when.at")} value={nt.atDay ?? 1} options={[0, 1, 2].map((v) => ({ v, label: t(`newtask.day.${v}`) }))} onPick={(v) => ((nt.atDay = v), A.changed())} />
            <TimeField />
          </div>
        )}
        {nt.when === "every" && (
          <div class="nt-detail">
            <Seg label={t("newtask.when.every")} value={nt.every ?? 0} options={["day", "weekday", "week", "hours"].map((k, v) => ({ v, label: t(`newtask.every.${k}`) }))} onPick={(v) => ((nt.every = v), A.changed())} />
            {nt.every === 2 && (
              <Seg label={t("newtask.every.week")} value={nt.weekday ?? 1} options={[1, 2, 3, 4, 5, 6, 0].map((v) => ({ v, label: t(`newtask.weekday.short.${v}`) }))} onPick={(v) => ((nt.weekday = v), A.changed())} />
            )}
            {nt.every === 3 ? (
              <Seg label={t("newtask.every.hours")} value={nt.hours ?? 1} options={EVERY_HOURS.map((h, v) => ({ v, label: t("newtask.hours", h) }))} onPick={(v) => ((nt.hours = v), A.changed())} />
            ) : (
              <TimeField />
            )}
          </div>
        )}
        {(nt.when === "when" || nt.when === "until") && (
          <label class="nt-detail nt-cond">
            <span>{t(`newtask.cond.label.${nt.when}`)}</span>
            <input
              ref={condRef}
              class="nt-field"
              value={nt.condition ?? ""}
              placeholder={t(`newtask.cond.${nt.when}`)}
              onInput={(e) => ((nt.condition = (e.target as HTMLInputElement).value), (nt.err = ""), A.changed())}
              onKeyDown={(e) => e.key === "Enter" && !e.metaKey && !e.ctrlKey && (e.preventDefault(), A.startNewTask())}
            />
          </label>
        )}
        {A.newTaskError() ? (
          <div class="nt-err" role="status">
            {A.newTaskError()}
          </div>
        ) : nt.started ? (
          <div class="nt-started" role="status">
            <span>✓ {nt.started}</span>
            {nt.startedTask && <Btn kind="text" size="sm" label={t("newtask.open")} about={nt.started} onClick={() => ((A.sheet = null), A.go({ name: "task", id: nt.startedTask! }))} />}
          </div>
        ) : (
          !coarse() && <div class="nt-keys small sub">{t("newtask.keys", start)}</div>
        )}
        <div class="btns">
          <Btn kind="text" label={t("newtask.cancel")} onClick={close} />
          <Btn kind="primary" grow label={nt.sending ? t("newtask.starting") : start} disabled={!!nt.sending} onClick={() => A.startNewTask()} />
        </div>
      </div>
    </>
  );
}

/** The time of a start or a schedule, as typed (9, 9:00, 21:30). */
function TimeField() {
  const nt = A.nt;
  return (
    <input
      class="nt-field nt-time"
      inputMode="numeric"
      aria-label={t("newtask.at")}
      value={nt.atTime ?? ""}
      placeholder="9:00"
      onInput={(e) => ((nt.atTime = (e.target as HTMLInputElement).value), (nt.err = ""), A.changed())}
    />
  );
}
