// 开一件事 / New task, the phone's and the browser's sheet (D128, redone by D185;
// design/new-task.md). The words first, then one row of pills: where (recent folders and the
// projects added on the Mac, D186), its branch, the computer when the choice is real (D157),
// who does it, and when it starts (现在 / Now unless set: a time, a schedule, when something
// happens, or keep going until). A pill opens its list in place under the row. ⌘⏎ starts;
// ⇧⌘⏎ starts and keeps the sheet for the next one.
import type { Candidate } from "@ducter/protocol";
import { useEffect, useRef } from "preact/hooks";
import { A, agentKey, effortWord, EVERY_HOURS, parseClock, placeKey, placeLine, tilde } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn, Choice, MenuRow, Pill, Seg } from "./controls.tsx";
import { candName, candReason, Check, coarse } from "./views.tsx";
import { AddPictures, DropHint, Tray, useDropPaste } from "./media.tsx";
import { harnessName } from "./format.ts";
import { computerApart, computerOf, computers, manyComputers } from "./where.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);


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
const Plus = () => (
  <svg class="nt-glyph" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);
const Up = () => (
  <svg class="nt-glyph" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 11.5V3M3.5 6.5 7 3l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
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

const whoLabel = (c: Candidate) => A.ntWhoLabel(c) || candName(c);

/**
 * D202: under the chosen agent, its 模型 / Model row (its own models, Ducter's suggestion tagged
 * 推荐) and 思考深度 / Effort row (that model's levels, its own default tagged 默认; none when the
 * model takes none). One short row each; a choice is remembered for this agent on this client.
 */
function Tune({ c }: { c: Candidate }) {
  const tu = A.ntTune(c);
  if (!tu.models.length) return null;
  const chip = (key: string, on: boolean, label: string, pick: () => void, tag?: "suggested" | "default") => (
    <Choice key={key} label={label} on={on} onClick={pick}>
      {label}
      {tag === "suggested" && <Suggested />}
      {tag === "default" && <small class="nt-dflt">{t("newtask.effort.default")}</small>}
    </Choice>
  );
  return (
    <div class="nt-tune">
      <div class="nt-chips">
        <small>{t("newtask.model")}</small>
        <div class="nt-chip-row" role="radiogroup" aria-label={t("newtask.model")}>
          {tu.models.map((m) => chip(m.id, m.id === tu.model?.id, m.label, () => A.pickTune(c, "model", m.id), m.suggested ? "suggested" : undefined))}
        </div>
      </div>
      {tu.efforts.length > 0 && (
        <div class="nt-chips">
          <small>{t("newtask.effort")}</small>
          <div class="nt-chip-row" role="radiogroup" aria-label={t("newtask.effort")}>
            {!tu.model?.defaultEffort && chip("default", !tu.effort, t("newtask.effort.default"), () => A.pickTune(c, "effort", "default"))}
            {tu.efforts.map((e) => chip(e, e === tu.effort, effortWord(A.L, e), () => A.pickTune(c, "effort", e === tu.model?.defaultEffort ? "default" : e), e === tu.model?.defaultEffort ? "default" : undefined))}
          </div>
        </div>
      )}
    </div>
  );
}

export function NewTaskSheet() {
  const nt = A.nt;
  const close = () => ((A.sheet = null), A.changed());
  const ref = useRef<HTMLTextAreaElement>(null);
  const condRef = useRef<HTMLInputElement>(null);
  // D206: a picture dropped or pasted on the What row goes to the task with the words.
  const what = useRef<HTMLDivElement>(null);
  const dropping = useDropPaste(what, "new");
  const withPics = (A.picks.get("new") ?? []).length > 0;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") return nt.list ? ((nt.list = ""), A.changed()) : close();
      // ⌘⏎ starts wherever the focus is; ⇧⌘⏎ starts and keeps the sheet for the next one.
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
  // D202: the folder list, only one computer's while an agent there waits for a folder.
  // D203: the repos computers reported fill the list after the used and added ones, up to 12
  // rows (all of one computer's while an agent waits there); 找一个文件夹… finds any other.
  const only = nt.placeOnly;
  const all = only ? places.filter((p) => p.place.kind !== "none" && A.placeComputer(p.place) === only) : places;
  const room = Math.max(0, 12 - all.filter((p) => !p.found && p.place.kind !== "none").length);
  const shown = only ? all : all.filter((p) => !p.found || placeKey(p.place) === placeKey(chosen.place) || (room > 0 && all.filter((x) => x.found).indexOf(p) < room));
  // D204: the computers that can look and clone there; an older one says it needs an update instead.
  const finders = only ? A.ntBrowsable().filter((d) => d.id === only) : A.ntBrowsable();
  const olds = only ? A.ntBrowsable(true).filter((d) => d.id === only) : A.ntBrowsable(true);
  const named = finders.length + olds.length > 1 || !!only || manyComputers();
  const onlyName = only ? (computerOf(only)?.name ?? "") : "";
  const folders = shown.filter((p) => p.place.kind !== "none");
  const awayLine = (c: Candidate) => {
    if (chosen.place.kind === "none") return candReason({ ...c, blocked: undefined });
    const name = c.deviceName ?? computerOf(c.device ?? "")?.name ?? "";
    const copy = c.device ? A.ntCopyOn(c.device, chosen) : undefined;
    return copy ? t("newtask.agent.copy", name, placeName(copy)) : t("newtask.agent.needsfolder", name);
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
        <div class="nt-what" ref={what}>
          <DropHint on={dropping} />
          <textarea
            ref={ref}
            id="nt-words"
            rows={4}
            value={nt.words}
            aria-label={t("newtask.what")}
            placeholder={t("newtask.placeholder")}
            onInput={(e) => ((nt.words = (e.target as HTMLTextAreaElement).value), (nt.err = ""), (nt.started = ""), A.changed())}
          />
          <Tray where="new" />
          <div class="nt-what-foot">
            <div class="small sub">{t("newtask.verbatim")}</div>
            <AddPictures where="new" />
          </div>
        </div>
        <div class="nt-pills">
          <Pill label={placeName() ?? ""} about={t("newtask.where")} open={nt.list === "place"} onClick={() => A.togglePlaces()}>
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
          ) : !who && !elsewhere.size ? (
            <span class="nt-wait small sub">{t("newtask.nobody")}</span>
          ) : !who ? (
            <Pill label={t("newtask.pickwho")} about={t("newtask.who")} open={nt.list === "who"} onClick={() => toggle("who")}>
              <b>{t("newtask.pickwho")}</b>
            </Pill>
          ) : (
            <Pill label={whoLabel(who)} about={t("newtask.who")} open={nt.list === "who"} onClick={() => toggle("who")}>
              <b>{whoLabel(who)}</b>
              {!picked && !A.ntSendTune(who).model && !A.ntSendTune(who).effort && <Suggested />}
            </Pill>
          )}
          <Pill label={whenLabel()} about={t("newtask.when")} open={nt.list === "when"} onClick={() => toggle("when")}>
            <Clock />
            <b>{whenLabel()}</b>
          </Pill>
        </div>
        {nt.list === "place" && (
          <div class="nt-list" role="radiogroup" aria-label={t("newtask.where")}>
            <small>{only ? t("newtask.agent.needsfolder", onlyName) : t("newtask.where")}</small>
            {folders.map((p) => (
              <MenuRow key={placeKey(p.place)} label={placeName(p) ?? ""} on={placeKey(p.place) === placeKey(chosen.place)} onClick={() => A.pickPlace(p)}>
                <Folder />
                <span class="mr-t">
                  <b>{placeName(p)}</b>
                  {placeLine(p) && <code>{placeLine(p)}</code>}
                </span>
              </MenuRow>
            ))}
            {/* D203, D204: nothing there yet (a first run): say so, and offer the ways to get one, never No folder alone. */}
            {!folders.length && <div class="nt-empty small sub">{only ? t("newtask.find.empty", onlyName) : t("newtask.empty")}</div>}
            {finders.map((d) => (
              <MenuRow key={`find:${d.id}`} label={named ? `${t("newtask.find")} · ${d.name}` : t("newtask.find")} on={false} onClick={() => A.ntBrowse(d.id)}>
                <Plus />
                <span class="mr-t">
                  <b>{t("newtask.find")}</b>
                  {named && <small>{t("newtask.find.on", d.name)}</small>}
                </span>
              </MenuRow>
            ))}
            {finders.map((d) => (
              <MenuRow key={`clone:${d.id}`} label={named ? `${t("newtask.clone")} · ${d.name}` : t("newtask.clone")} on={false} onClick={() => A.ntCloneOpen(d.id)}>
                <Plus />
                <span class="mr-t">
                  <b>{t("newtask.clone")}</b>
                  {named && <small>{t("newtask.find.on", d.name)}</small>}
                </span>
              </MenuRow>
            ))}
            {olds.map((d) => (
              <MenuRow key={`old:${d.id}`} label={t("newtask.old.row", d.name)} on={false} off why={t("newtask.old.why")} onClick={() => {}}>
                <Plus />
                <span class="mr-t">
                  <b>{t("newtask.old.row", d.name)}</b>
                  <small>{t("newtask.old.why")}</small>
                </span>
              </MenuRow>
            ))}
            {only ? (
              <MenuRow key="none" label={`${t("newtask.nowhere")} · ${onlyName}`} on={false} onClick={() => A.pickPlace({ place: { kind: "none" }, name: "" })}>
                <Folder faint />
                <span class="mr-t">
                  <b>{t("newtask.nowhere")}</b>
                  <small>{t("newtask.agent.elsewhere", onlyName)}</small>
                </span>
              </MenuRow>
            ) : (
              <MenuRow key="none" label={t("newtask.nowhere")} on={chosen.place.kind === "none"} onClick={() => A.pickPlace({ place: { kind: "none" }, name: "" })}>
                <Folder faint />
                <span class="mr-t">
                  <b>{t("newtask.nowhere")}</b>
                </span>
              </MenuRow>
            )}
          </div>
        )}
        {nt.list === "browse" && nt.browse && <FolderBrowser />}
        {nt.list === "clone" && nt.clone && <CloneField />}
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
        {nt.list === "who" && (who || elsewhere.size > 0) && (
          <div class="nt-list" role="radiogroup" aria-label={t("newtask.who")}>
            <small>{t("newtask.who")}</small>
            {whoList.map((c) => {
              const k = agentKey(c);
              const away = elsewhere.has(k);
              const off = !!c.blocked && !away;
              const best = !!top && agentKey(top) === k;
              const on = !off && !!who && k === agentKey(who);
              // D206: with pictures on the card, an agent that can't see them says so.
              const line = withPics && c.noImages && !off ? t("media.noImages") : away ? awayLine(c) : candReason(c);
              const name = harnessName(c.harness);
              return (
                <div key={k} class="nt-agent">
                  <MenuRow label={name} on={on} off={off} why={off ? candReason(c) : undefined} onClick={() => A.pickAgent(c)}>
                    <Coin harness={c.harness} size={28} off={off} />
                    <span class="mr-t">
                      <b>
                        {name} {away && <small>{t("newtask.agent.elsewhere", c.deviceName ?? "")}</small>} {best && <Suggested />}
                      </b>
                      {line && <small>{line}</small>}
                    </span>
                  </MenuRow>
                  {on && <Tune c={c} />}
                </div>
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
            <Check />
            <span>{nt.started}</span>
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

/**
 * D203: 找一个文件夹… / Find a folder…: one computer's folders, one level at a time, from its home
 * folder (~). Repos first, with the branch glyph; tap one to go in; 上一层 / Up one level goes
 * back; 用这个文件夹 / Use this folder adds it there as a project and makes it the card's place.
 */
function FolderBrowser() {
  const nt = A.nt;
  const b = nt.browse!;
  const r = b.res;
  const name = A.ntBrowseName();
  const home = r?.home ?? "";
  const shownPath = (p: string) => (home && (p === home || p.startsWith(home + "/")) ? "~" + p.slice(home.length) : tilde(p));
  const err = r && !r.ok ? (r.reason === "offline" ? t("newtask.find.offline", name) : r.reason === "old" ? t("newtask.old", name) : r.reason === "outside" ? t("newtask.find.outside") : r.reason === "not_found" ? t("newtask.find.missing") : r.message || t("newtask.err.unknown")) : "";
  const atHome = !!r?.ok && r.path === home;
  return (
    <div class="nt-list nt-browse" role="group" aria-label={t("newtask.find.title", name)}>
      <div class="nt-browse-head">
        <small>{t("newtask.find.title", name)}</small>
        {r?.ok && r.path && <code>{shownPath(r.path)}</code>}
      </div>
      {!r && <div class="nt-empty small sub">{t("newtask.find.loading")}</div>}
      {err && <div class="nt-empty nt-err-line small">{err}</div>}
      {r?.ok && r.parent && (
        <MenuRow key="up" label={t("newtask.find.up")} on={false} onClick={() => A.ntBrowse(b.device, r.parent)}>
          <Up />
          <span class="mr-t">
            <b>{t("newtask.find.up")}</b>
          </span>
        </MenuRow>
      )}
      {r?.ok &&
        (r.folders ?? []).map((f) => (
          <MenuRow key={f.path} label={f.name} on={false} onClick={() => A.ntBrowse(b.device, f.path)}>
            {f.repo ? <Branch /> : <Folder />}
            <span class="mr-t">
              <b>{f.name}</b>
            </span>
          </MenuRow>
        ))}
      {r?.ok && !(r.folders ?? []).length && <div class="nt-empty small sub">{t("newtask.find.none")}</div>}
      {r?.ok && r.more && <div class="nt-empty small sub">{t("newtask.find.more", (r.folders ?? []).length)}</div>}
      <div class="nt-browse-foot">
        <Btn kind="text" size="sm" label={t("newtask.find.back")} onClick={() => A.ntBrowseBack()} />
        <Btn kind="primary" size="sm" label={nt.adding ? t("newtask.find.adding") : t("newtask.find.use")} disabled={!r?.ok || atHome || !!nt.adding} onClick={() => A.ntBrowseUse()} />
      </div>
    </div>
  );
}

/**
 * D204: 从 Git 地址加… / Add from a Git address…: the address, where it goes on that computer (its
 * Ducter folder's real path) and with whose git; 克隆 / Clone; while it clones, 在克隆…; a failure
 * in one line. Done, it is the card's place.
 */
function CloneField() {
  const k = A.nt.clone!;
  const name = A.ntComputerName(k.device);
  const folder = A.ntFolder(k.device)?.path;
  const into = folder ? tilde(folder.replace(/\/+$/, "") + "/projects") : "~/ducter/projects";
  const busy = !!k.cid;
  return (
    <div class="nt-list nt-browse nt-clone" role="group" aria-label={t("newtask.clone.title", name)}>
      <div class="nt-browse-head">
        <small>{t("newtask.clone.title", name)}</small>
      </div>
      <input
        class="nt-field"
        type="url"
        inputMode="url"
        autocapitalize="off"
        autocorrect="off"
        spellcheck={false}
        aria-label={t("newtask.clone.title", name)}
        placeholder={t("newtask.clone.placeholder")}
        value={k.address}
        disabled={busy}
        ref={(el) => void (el && !busy && !k.address && !coarse() && el.focus())}
        onInput={(e) => A.ntCloneInput((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && !e.metaKey && !e.ctrlKey && (e.preventDefault(), A.ntCloneGo())}
      />
      <div class="nt-empty small sub">{t("newtask.clone.where", into, name)}</div>
      {busy && (
        <div class="nt-empty small sub nt-cloning" role="status">
          <span class="spin" aria-hidden="true" />
          {t("newtask.clone.busy")}
        </div>
      )}
      {k.err && (
        <div class="nt-empty nt-err-line small" role="status">
          {k.err}
        </div>
      )}
      <div class="nt-browse-foot">
        <Btn kind="text" size="sm" label={t("newtask.find.back")} disabled={busy} onClick={() => A.ntBrowseBack()} />
        <Btn kind="primary" size="sm" label={busy ? t("newtask.clone.going") : t("newtask.clone.go")} disabled={busy || !k.address.trim()} onClick={() => A.ntCloneGo()} />
      </div>
    </div>
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
