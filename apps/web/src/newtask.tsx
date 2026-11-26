// 开一个任务 / New task, the phone's and the browser's sheet (D128, redone by D185;
// design/new-task.md). The words first, then one row of pills: where (recent folders and the
// projects added on the Mac, D186), its branch, the computer when the choice is real (D157),
// who does it, and when it starts (现在 / Now unless set: a time, a schedule, when something
// happens, or keep going until). A pill opens its list in place under the row. ⌘⏎ starts;
// ⇧⌘⏎ starts and keeps the sheet for the next one.
import type { Candidate } from "@ducter/protocol";
import { useEffect, useRef } from "preact/hooks";
import { useSheetMotion } from "./sheetmotion.ts";
import { SheetFrame } from "./sheet-frame.tsx";
import { A, agentKey, browseNeedle, effortWord, EVERY_HOURS, ntGitHubish, parseClock, placeKey, placeLine, tilde } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Btn, Chev, Choice, CrumbStep, Facts, MenuRow, OptionRow, Pill, Seg, TextLink } from "./controls.tsx";
import { candFacts, candName, candReason, Check, coarse } from "./views.tsx";
import { AddPictures, DropHint, Tray, useDropPaste } from "./media.tsx";
import { ago, harnessName, spoken } from "./format.ts";
import { Fragment } from "preact";
import { SeedChip } from "./past.tsx";
import { computerApart, computerOf, computers, manyComputers } from "./where.ts";
import { TodoPick, TS } from "./todos.tsx";
import { GhSignIn } from "./gh-signin.tsx";

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

/** The when pill's words: 现在 / Now, 明天 9:00, 工作日 9:00, 等某个任务发生. */
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

const whoLabel = (c: Candidate) => A.ntWhoLabel(c);
/** The agent's name, then its model and effort as words of their own (D291). */
const whoParts = (c: Candidate) => A.ntWhoParts(c);

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
  // D341: whether there are to-dos to pick from (the home answers with its sources).
  useEffect(() => {
    if (!TS.frame && A.S.welcomed) A.send({ t: "sources" });
  }, []);
  // D290: the sheet goes back down the way it came; on a phone it follows the finger down.
  const { sheet: sheetEl, body: sheetBody, scrim, close } = useSheetMotion(() => ((A.sheet = null), A.changed()));
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
    if (chosen.place.kind === "none") return <Facts items={candFacts({ ...c, blocked: undefined })} />;
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
    <SheetFrame label={t("newtask.title")} class="newtask" frame={sheetEl} body={sheetBody} scrim={scrim} onScrim={close}>
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
        {/* D285: 带着它开新任务 / New task from this: what that task found goes with the words. */}
        {nt.from && <SeedChip />}
        {/* D341: 从待办里选 / Pick from your to-dos: the task is bound to the to-do picked. */}
        {(nt.item || (TS.frame?.sources.length ?? 0) > 0 || TS.frame?.found.github?.state === "ok") && (
          <TodoPick
            picked={nt.item}
            onPick={(it) => {
              if (it?.taskId) return void ((A.sheet = null), A.openTaskPage(it.taskId), A.changed());
              const before = nt.item?.title;
              nt.item = it ? { source: it.source, kind: it.kind, ref: it.ref, label: it.label, ...(it.where ? { where: it.where } : {}), title: it.title, ...(it.url ? { url: it.url } : {}), ...(it.pr ? { pr: true } : {}) } : undefined;
              if (it && (!nt.words.trim() || nt.words === before)) nt.words = it.title;
              if (!it && nt.words === before) nt.words = "";
              nt.err = "";
              A.changed();
            }}
          />
        )}
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
            <b>{whoParts(who)[0]}</b>
            {whoParts(who)
              .slice(1)
              .map((p) => (
                <span key={p} class="pill-fact">
                  {p}
                </span>
              ))}
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
                {placeLine(p).path && <Facts class="mr-place" items={[<code>{placeLine(p).path}</code>, placeLine(p).computer && <small>{placeLine(p).computer}</small>]} />}
              </span>
            </MenuRow>
          ))}
          {/* D203, D204: nothing there yet (a first run): say so, and offer the ways to get one, never No folder alone. */}
          {!folders.length && <div class="nt-empty small sub">{only ? t("newtask.find.empty", onlyName) : t("newtask.empty")}</div>}
          {/* D272: one 加一个文件夹… per computer that can take one; its three ways open in place. */}
          {finders.map((d) => (
            <MenuRow key={`add:${d.id}`} label={named ? spoken(A.L, t("newtask.add"), t("newtask.find.on", d.name)) : t("newtask.add")} on={false} onClick={() => A.ntAddOpen(d.id)}>
              <Plus />
              <span class="mr-t">
                <b>{t("newtask.add")}</b>
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
            <MenuRow key="none" label={spoken(A.L, t("newtask.nowhere"), t("newtask.agent.elsewhere", onlyName))} on={false} onClick={() => A.pickPlace({ place: { kind: "none" }, name: "" })}>
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
      {nt.list === "add" && nt.add && <AddPanel />}
      {nt.list === "newfolder" && nt.newFolder && <NewFolderField />}
      {nt.list === "gh" && nt.ghPanel && <GhSignIn which="nt" />}
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
            const line = withPics && c.noImages && !off ? t("media.noImages") : away ? awayLine(c) : <Facts items={candFacts(c)} />;
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
        !coarse() && <Facts class="nt-keys small sub" items={[t("newtask.keys", start), t("newtask.keys.more")]} />
      )}
      <div class="btns">
        <Btn kind="primary" grow label={nt.sending ? t("newtask.starting") : start} disabled={!!nt.sending} onClick={() => A.startNewTask()} />
        <Btn kind="text" label={t("newtask.cancel")} onClick={close} />
      </div>
    </SheetFrame>
  );
}

/**
 * D203: 找一个文件夹… / Find a folder…: one computer's folders, one level at a time, from its home
 * folder (~). Repos first, with the branch glyph; tap one to go in; 上一层 / Up one level goes
 * back; 用这个文件夹 / Use this folder adds it there as a project and makes it the card's place.
 * D457: an instrument: where you are as a breadcrumb (each part a step back), the rows walked with
 * up/down and Return, Cmd-up (or Backspace in an empty field) up a level, ⌘⏎ adds; each row says what it is (a repo's
 * origin, when a recent one was last used, that it is already a project); a missing folder, a
 * computer away or an empty folder each says what to do next.
 */
type BrowseRow = { key: string; path: string; name: string; repo?: boolean; line?: string; when?: string; added?: boolean; up?: boolean };

/** The breadcrumb's parts of a path: ~ and what follows inside the home folder, else from /. */
export function crumbsOf(path: string, home: string): { label: string; path: string }[] {
  const h = home.replace(/\/+$/, "");
  const inHome = !!h && (path === h || path.startsWith(h + "/"));
  const out = [{ label: inHome ? "~" : "/", path: inHome ? h : "/" }];
  let at = inHome ? h : "";
  for (const part of (inHome ? path.slice(h.length) : path).split("/").filter(Boolean)) {
    at += "/" + part;
    out.push({ label: part, path: at });
  }
  return out;
}

const Chevron = () => (
  <svg class="adf-chev" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export function FolderBrowser() {
  const nt = A.nt;
  const b = nt.browse!;
  const r = b.res;
  const name = A.ntBrowseName();
  const home = r?.home ?? "";
  const inSheet = A.sheet?.kind === "addfolder";
  const shownPath = (p: string) => (home && (p === home || p.startsWith(home + "/")) ? "~" + p.slice(home.length) : tilde(p));
  const atHome = !!r?.ok && r.path === home;
  // D455: what is typed narrows the list (or names a path), and the recent folders there come first.
  const { needle } = browseNeedle(b.filter ?? "", r?.ok ? (r.path ?? "") : "", home);
  const has = (n: string) => !needle || n.toLowerCase().includes(needle.toLowerCase());
  const folders = r?.ok ? (r.folders ?? []).filter((f) => has(f.name)) : [];
  const atStart = !!r?.ok && (atHome || (!!r.roots?.length && !r.parent));
  const here = A.placeComputer({ kind: "repo", device: b.device, repoPath: "" });
  const placesHere = A.newTaskPlaces().filter((p) => (p.place.kind === "repo" || p.place.kind === "folder") && A.placeComputer(p.place) === here);
  const pathOf = (p: (typeof placesHere)[number]) => (p.place.kind === "repo" ? p.place.repoPath : p.place.kind === "folder" ? p.place.path : "");
  // D457: a folder already a project here says so (adding it again only chooses it).
  const known = new Set(placesHere.filter((p) => !p.found).map(pathOf));
  const recent = atStart ? placesHere.filter((p) => has(p.name)).slice(0, 5) : [];
  const repo = r?.ok ? r.inRepo : undefined;
  const addName = repo?.name ?? (r?.ok && r.path ? r.path.split("/").pop() : "") ?? "";
  // D457: the button says what will happen, and where when there is more than one computer.
  const many = A.ntBrowsable().length + A.ntBrowsable(true).length > 1;
  const useLabel = inSheet && r?.ok && r.path && !atHome ? (many ? t("addfolder.add.on", addName, name) : t("addfolder.add", addName)) : t("newtask.find.use");
  const rows: BrowseRow[] = [
    ...recent.map((p): BrowseRow => ({ key: `recent:${pathOf(p)}`, path: pathOf(p), name: p.name, repo: p.place.kind === "repo", line: p.remote || shownPath(pathOf(p)), when: p.usedAt ? ago(A.L, p.usedAt) : "" })),
    ...(r?.ok && r.parent && !needle ? [{ key: "up", path: r.parent, name: t("newtask.find.up"), up: true }] : []),
    ...folders.map((f): BrowseRow => ({ key: f.path, path: f.path, name: f.name, repo: !!f.repo, line: f.remote, added: known.has(f.path) })),
  ];
  const at = b.at !== undefined && b.at < rows.length ? b.at : -1;
  const go = (path: string) => A.ntBrowse(b.device, path);
  const up = () => r?.ok && r.parent && go(r.parent);
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (mod && e.key === "ArrowUp") return e.preventDefault(), up();
      if (!rows.length) return;
      e.preventDefault();
      const n = e.key === "ArrowDown" ? (at + 1) % rows.length : at <= 0 ? rows.length - 1 : at - 1;
      return A.ntBrowseAt(n);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (mod) return !atHome && r?.ok && A.ntBrowseUse();
      if (at >= 0) return go(rows[at]!.path);
      return folders.length === 1 && go(folders[0]!.path);
    }
    if (e.key === "Backspace" && !(b.filter ?? "")) return e.preventDefault(), up();
  };
  const crumbs = r?.ok && r.path ? crumbsOf(r.path, home) : [];
  const fine = !coarse();
  return (
    <div class="nt-list nt-browse adf-browse" role="group" aria-label={t("newtask.find.title", name)}>
      <div class="adf-at">
        {!inSheet && <small class="adf-at-who">{t("newtask.find.title", name)}</small>}
        <nav class="adf-crumbs" aria-label={t("addfolder.crumbs")} ref={(el) => void (el && (el.scrollLeft = el.scrollWidth))}>
          {crumbs.map((c, i) => (
            <span key={c.path} class="adf-crumb">
              {i > 0 && <i aria-hidden="true">/</i>}
              {i === crumbs.length - 1 ? (
                <b aria-current="location">{c.label}</b>
              ) : (
                <CrumbStep label={c.label} onClick={() => go(c.path)} />
              )}
            </span>
          ))}
          {!crumbs.length && <span class="adf-crumb">{b.lastOk ? shownPath(b.lastOk) : "~"}</span>}
        </nav>
        {repo && repo.root === r?.path && repo.remote && <code class="nt-remote adf-origin">{repo.remote}</code>}
      </div>
      <input
        class="nt-field nt-find-field"
        type="text"
        autocapitalize="off"
        autocorrect="off"
        spellcheck={false}
        aria-label={t("addfolder.filter")}
        placeholder={t("addfolder.filter")}
        value={b.filter ?? ""}
        ref={(el) => void (el && !coarse() && document.activeElement?.tagName !== "INPUT" && el.focus())}
        onInput={(e) => A.ntBrowseFilter((e.target as HTMLInputElement).value)}
        onKeyDown={onKey}
      />
      {r?.ok && (r.roots?.length ?? 0) > 1 && (
        <div class="nt-chip-row nt-roots" role="radiogroup" aria-label={t("addfolder.roots")}>
          {r.roots!.map((root) => (
            <Choice key={root} label={shownPath(root)} on={r.path === root || (r.path ?? "").startsWith(root.replace(/\/+$/, "") + "/")} onClick={() => go(root)}>
              {shownPath(root)}
            </Choice>
          ))}
        </div>
      )}
      <div class="adf-rows" role="listbox" aria-label={t("newtask.find.title", name)}>
        {!r && <div class="adf-wait" aria-busy="true"><span /><span /><span /></div>}
        {r && !r.ok && <BrowseTrouble reason={r.reason} message={r.message} device={b.device} lastOk={b.lastOk} typed={b.path ?? ""} shownPath={shownPath} />}
        {rows.map((row, i) => (
          <Fragment key={row.key}>
            {i === recent.length && recent.length > 0 && <hr class="nt-rule" />}
            {i === 0 && recent.length > 0 && <small class="nt-sub-h">{t("addfolder.recent")}</small>}
            <OptionRow at={i === at} class={`adf-row${row.up ? " up" : ""}`} onClick={() => go(row.path)} onHover={() => fine && i !== at && A.ntBrowseAt(i)}>
              <span class={`adf-mark${row.repo ? " repo" : ""}`}>{row.up ? <Up /> : row.repo ? <Branch /> : <Folder />}</span>
              <span class="adf-t">
                <b>{row.name}</b>
                {row.line && <small class="mono">{row.line}</small>}
              </span>
              {row.when && <small class="adf-when">{row.when}</small>}
              {row.added && <small class="adf-tag">{t("addfolder.added")}</small>}
              {!row.up && <Chevron />}
            </OptionRow>
          </Fragment>
        ))}
        {r?.ok && !(r.folders ?? []).length && <div class="adf-note">{t(atHome ? "newtask.find.none" : "addfolder.empty")}</div>}
        {r?.ok && (r.folders ?? []).length > 0 && !folders.length && (
          <div class="adf-note">
            <span>{t("addfolder.nomatch", needle)}</span>
            {!(b.filter ?? "").trim().startsWith("/") && !(b.filter ?? "").trim().startsWith("~") && <small>{t("addfolder.path.hint")}</small>}
          </div>
        )}
        {r?.ok && r.more && <div class="nt-empty small sub">{t("newtask.find.more", (r.folders ?? []).length)}</div>}
      </div>
      {repo && repo.root !== r?.path && <div class="adf-inrepo">{t("addfolder.inrepo", repo.name)}</div>}
      <div class="nt-browse-foot adf-foot">
        {/* Primary first, on the left; the keys' hints after the room between. */}
        {r?.ok && !atHome ? (
          <Btn kind="primary" size="sm" class="adf-go" label={nt.adding ? t("newtask.find.adding") : useLabel} disabled={!!nt.adding} onClick={() => A.ntBrowseUse()} />
        ) : (
          r?.ok && <small class="adf-pick">{t("addfolder.pick")}</small>
        )}
        <Btn kind="text" size="sm" label={inSheet ? t("addfolder.cancel") : t("newtask.find.back")} onClick={() => A.ntBrowseBack()} />
        <span class="nt-grow" />
        {fine && (
          <span class="adf-keys" aria-hidden="true">
            <span>
              <kbd>
                <Chev cls="k-up" />
              </kbd>
              <kbd>
                <Chev open />
              </kbd>
              {t("addfolder.keys.move")}
            </span>
            <span>
              <kbd>
                <Ret />
              </kbd>
              {t("addfolder.keys.open")}
            </span>
            <span>
              <kbd>
                ⌘<Chev cls="k-up" />
              </kbd>
              {t("addfolder.keys.up")}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

const Ret = () => (
  <svg class="k-ret" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M10 2.5v4H3M5 4.5 3 6.5l2 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** D457: why a folder can't be shown, and the one way on: back to where it last looked, or to the home. */
function BrowseTrouble(p: { reason?: string; message?: string; device: string; lastOk?: string; typed: string; shownPath: (s: string) => string }) {
  const name = A.ntBrowseName();
  const homeDev = A.ntBrowsable().find((d) => d.home);
  if (p.reason === "offline" || p.reason === "old") {
    return (
      <div class="adf-trouble">
        <b>{p.reason === "offline" ? t("newtask.find.offline", name) : t("newtask.old", name)}</b>
        {homeDev && homeDev.id !== p.device && <Btn kind="secondary" size="sm" label={t("addfolder.switch", homeDev.name)} onClick={() => A.afPick(homeDev.id)} />}
      </div>
    );
  }
  const words = p.reason === "outside" ? t("newtask.find.outside") : p.reason === "not_found" ? (p.typed ? t("addfolder.missing", name, p.shownPath(p.typed)) : t("newtask.find.missing")) : p.message || t("newtask.err.unknown");
  return (
    <div class="adf-trouble">
      <b>{words}</b>
      {p.lastOk && <Btn kind="secondary" size="sm" label={t("addfolder.back.to", p.shownPath(p.lastOk))} onClick={() => A.ntBrowse(p.device, p.lastOk, "")} />}
    </div>
  );
}

/**
 * D204: 从 Git 地址加… / Add from a Git address…: the address, where it goes on that computer (its
 * Ducter folder's real path) and with whose git; 克隆 / Clone; while it clones, 在克隆…; a failure
 * in one line. Done, it is the card's place.
 */
export function CloneField() {
  const k = A.nt.clone!;
  const name = A.ntComputerName(k.device);
  const into = A.ntProjectsPath(k.device);
  const busy = !!k.cid;
  // D272: where this computer stands with GitHub, for a GitHub address (or none typed yet).
  const gh = A.ntGh(k.device);
  const hub = ntGitHubish(k.address);
  const signIn = (
    <div class="nt-gh-act">
      <Btn kind="secondary" size="sm" label={t("newtask.gh.signin", name)} disabled={busy} onClick={() => A.ntGhStart(k.device)} />
    </div>
  );
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
      <div class="nt-empty small sub">
        <TextLink class="fd-link" label={t("newtask.clone.where", into, name)} about={t("settings.folder.row")} onClick={() => A.openFolderRow(k.device)} />
      </div>
      {k.signedIn ? (
        <div class="nt-empty small nt-gh-ok" role="status">
          <Check />
          {k.signedIn}
        </div>
      ) : (
        hub &&
        !k.err &&
        gh && (
          <>
            {gh.state === "signed_in" && <div class="nt-empty small sub">{t("newtask.gh.as", name, gh.account ?? "")}</div>}
            {gh.state === "signed_out" && (
              <>
                <div class="nt-empty small sub">{t("newtask.gh.out", name)}</div>
                {signIn}
              </>
            )}
            {gh.state === "no_gh" && gh.install && signIn}
            {gh.state === "no_gh" && !gh.install && (
              <>
                <div class="nt-empty small sub">{t("newtask.gh.nogh", name)}</div>
                <div class="nt-gh-act">
                  <Btn kind="secondary" size="sm" label={t("newtask.gh.recheck")} onClick={() => A.ntGhStatus(k.device)} />
                </div>
              </>
            )}
          </>
        )
      )}
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
      {k.err && k.failedAccess && gh?.state !== "signed_in" && !busy && (gh?.state === "no_gh" ? <div class="nt-empty small sub">{t("newtask.gh.nogh", name)}</div> : signIn)}
      <div class="nt-browse-foot">
        <Btn kind="primary" size="sm" label={busy ? t("newtask.clone.going") : t("newtask.clone.go")} disabled={busy || !k.address.trim()} onClick={() => A.ntCloneGo()} />
        <Btn kind="text" size="sm" label={A.sheet?.kind === "addfolder" ? t("addfolder.cancel") : t("newtask.find.back")} disabled={busy} onClick={() => A.ntBrowseBack()} />
      </div>
    </div>
  );
}

const NewGlyph = () => (
  <svg class="nt-glyph" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 4h4l1.5 1.5H14v7H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M8 7.3v3.8M6.1 9.2h3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  </svg>
);

/**
 * D272: 加一个文件夹… on one computer: the three ways, in this order: a new folder there (the
 * default for people who don't use git), a folder already there (the D203 browser, through the
 * home; the web never opens this device's own picker), and a clone from a Git address.
 */
function AddPanel() {
  const d = A.nt.add!.device;
  const name = A.ntComputerName(d);
  return (
    <div class="nt-list nt-browse nt-add" role="group" aria-label={t("newtask.add.title", name)}>
      <div class="nt-browse-head">
        <small>{t("newtask.add.title", name)}</small>
      </div>
      <MenuRow key="new" label={t("newtask.new", name)} on={false} onClick={() => A.ntNewOpen(d)}>
        <NewGlyph />
        <span class="mr-t">
          <b>{t("newtask.new", name)}</b>
          <small>{t("newtask.new.line", A.ntProjectsPath(d))}</small>
        </span>
      </MenuRow>
      <MenuRow key="choose" label={t("newtask.choose", name)} on={false} onClick={() => A.ntBrowse(d)}>
        <Folder />
        <span class="mr-t">
          <b>{t("newtask.choose", name)}</b>
          <small>{t("newtask.choose.line")}</small>
        </span>
      </MenuRow>
      <MenuRow key="clone" label={t("newtask.clone")} on={false} onClick={() => A.ntCloneOpen(d)}>
        <Branch />
        <span class="mr-t">
          <b>{t("newtask.clone")}</b>
          <small>{t("newtask.clone.line", name)}</small>
        </span>
      </MenuRow>
      <div class="nt-browse-foot">
        <Btn kind="text" size="sm" label={t("newtask.find.back")} onClick={() => ((A.nt.add = undefined), (A.nt.list = "place"), A.changed())} />
        <span class="nt-grow" />
      </div>
    </div>
  );
}

/** D272: 在 {computer} 上新建一个文件夹: a name; it goes in that computer's <Ducter folder>/projects. */
export function NewFolderField() {
  const n = A.nt.newFolder!;
  const name = A.ntComputerName(n.device);
  const into = A.ntProjectsPath(n.device);
  const busy = !!n.cid;
  return (
    <div class="nt-list nt-browse nt-clone" role="group" aria-label={t("newtask.new.title", name)}>
      <div class="nt-browse-head">
        <small>{t("newtask.new.title", name)}</small>
      </div>
      <input
        class="nt-field nt-name"
        autocapitalize="off"
        autocorrect="off"
        spellcheck={false}
        maxLength={80}
        aria-label={t("newtask.new.title", name)}
        placeholder={t("newtask.new.placeholder")}
        value={n.name}
        disabled={busy}
        ref={(el) => void (el && !busy && !n.name && !coarse() && el.focus())}
        onInput={(e) => A.ntNewInput((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && !e.metaKey && !e.ctrlKey && (e.preventDefault(), A.ntNewGo())}
      />
      <div class="nt-empty small sub">{t("newtask.new.where", n.name.trim() ? `${into}/${n.name.trim()}` : into)}</div>
      {n.err && (
        <div class="nt-empty nt-err-line small" role="status">
          {n.err}
        </div>
      )}
      <div class="nt-browse-foot">
        <Btn kind="primary" size="sm" label={busy ? t("newtask.new.going") : t("newtask.new.go")} disabled={busy || !n.name.trim()} onClick={() => A.ntNewGo()} />
        <Btn kind="text" size="sm" label={A.sheet?.kind === "addfolder" ? t("addfolder.cancel") : t("newtask.find.back")} disabled={busy} onClick={() => A.ntAddBack()} />
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
