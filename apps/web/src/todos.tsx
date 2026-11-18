// 设置 › 待办来源 / Settings › To-do sources (D341, design/task-sources.md): the person's to-dos in
// other apps, GitHub issues and PRs assigned to them and Obsidian Tasks lines in a vault on the home,
// which a task can be bound to. The app owns what the to-do is and whether it is open; Ducter owns
// how it gets done. Here: what is added, what happens when a new one comes and when a task is done,
// and what could be added without a step. Also the pieces other views use: the chip a bound task
// shows (its app's mark and "#12" or the note's name) and New task's pick.
import type { ServerFrame, SourceGlance, SourceItem, SourceItemRef, SourcesServerFrame, SourceView, TaskCard, WhenDone, WhenNew } from "@ducter/protocol";
import { BROWSE_PAGE, WHEN_DONE } from "@ducter/protocol";
import { ago, spoken } from "./format.ts";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandMark, BrandTile } from "./brand.tsx";
import { Btn, Chev, DangerButton, Facts, Seg } from "./controls.tsx";
import { SecHead, Tag } from "./set-grid.tsx";
import { GhSignIn } from "./gh-signin.tsx";


const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Frame = Extract<SourcesServerFrame, { t: "sources" }>;

/** What this page knows; the home's frames keep it current. */
export const TS: { frame?: Frame; items?: SourceItem[]; itemsFor?: string; busy: Record<string, boolean>; said?: string } = { busy: {} };

/**
 * D357: On hand's fold of the person's to-dos: open or not, what narrows it, and the pages read so
 * far. The home answers a page at a time (source_items with page).
 */
export interface TodoFoldState {
  open: boolean;
  q: string;
  /** Only this source (two or more). */
  source?: string;
  /** A repository (GitHub) or a top folder (a vault). */
  where?: string;
  /** A vault's tag. */
  tag?: string;
  /** The PRs waiting for the person's review. */
  review?: boolean;
  page: number;
  items: SourceItem[];
  more: boolean;
  wheres: string[];
  tags: string[];
  loading: boolean;
  limited?: boolean;
  failed?: boolean;
  cid: string;
  /** Bring the group into view once (a tap on Settings' count). */
  scroll?: boolean;
}
export const TF: TodoFoldState = { open: false, q: "", page: 0, items: [], more: false, wheres: [], tags: [], loading: false, cid: "" };
/** Hand-overs in flight (by ref: the clientId), and the last one that failed (its words). */
export const HAND: { sending: Record<string, string>; failed: Record<string, string> } = { sending: {}, failed: {} };

/** D357: the first page again (the fold opened, or what narrows it changed). */
export function askFold(page = 1) {
  TF.cid = `fold-${Date.now()}-${page}`;
  TF.loading = true;
  if (page === 1) TF.items = [];
  A.send({ t: "source_items", page, clientId: TF.cid, ...(TF.q.trim() ? { query: TF.q.trim() } : {}), ...(TF.source ? { id: TF.source } : {}), ...(TF.where !== undefined ? { where: TF.where } : {}), ...(TF.tag ? { tag: TF.tag } : {}), ...(TF.review ? { review: true } : {}) });
  A.changed();
}

/** D357: opens On hand at the to-dos (Settings' counts): the fold open, the review list if asked. */
export function seeTodos(o: { source?: string; review?: boolean } = {}) {
  Object.assign(TF, { open: true, q: "", source: (TS.frame?.sources.length ?? 0) > 1 ? o.source : undefined, where: undefined, tag: undefined, review: !!o.review, scroll: true });
  askFold(1);
  A.sheet = null;
  A.go({ name: "onhand" });
}

/** D357: 交给{name} / Hand to {name}: the same path as New task's pick, without the card; the home finds the folder. */
export function handOver(i: SourceItem) {
  if (i.taskId) return A.go({ name: "task", id: i.taskId });
  const cid = `hand-${Date.now()}`;
  HAND.sending[i.ref] = cid;
  delete HAND.failed[i.ref];
  const item: SourceItemRef = { source: i.source, kind: i.kind, ref: i.ref, label: i.label, title: i.title, ...(i.where ? { where: i.where } : {}), ...(i.url ? { url: i.url } : {}), ...(i.pr ? { pr: true } : {}) };
  A.send({ t: "task_new", words: i.title, item, handed: true, clientId: cid });
  A.changed();
}

/** The home's answer to a hand-over: the card moves to the board by itself; a failure says why on the card. */
A.onHanded = (f: Extract<ServerFrame, { t: "task_new_result" }>) => {
  const ref = Object.keys(HAND.sending).find((r) => HAND.sending[r] === f.clientId);
  if (!ref) return false;
  delete HAND.sending[ref];
  if (!f.ok) HAND.failed[ref] = f.reason && ["no_agent", "offline", "not_repo", "ducter_data"].includes(f.reason) ? t(`newtask.err.${f.reason}`) : (f.message ?? t("newtask.err.failed"));
  else TF.items = TF.items.map((x) => (x.ref === ref && f.taskId ? { ...x, taskId: f.taskId } : x));
  A.changed();
  return true;
};

/** D357: the group's name: GitHub's or the vault's own when there is one source, else 你的待办 / Your to-dos. */
export function todoGroupName(sources: SourceView[]): string {
  if (sources.length !== 1) return t("onhand.todos.all");
  const s = sources[0]!;
  return s.kind === "github" ? t("onhand.todos.github") : t("onhand.todos.vault", s.name);
}

/** D357: what the group counts: the open ones in every source that reads (none counted before a look). */
export function todoCounts(sources: SourceView[], glance: SourceGlance[] = []): { open: number; atLeast: boolean; review: number; rest: number } {
  const ok = sources.filter((s) => countOf(s) === "counted");
  const open = ok.reduce((n, s) => n + (s.open ?? 0), 0);
  const review = ok.reduce((n, s) => n + (s.review ?? 0), 0);
  const shown = glance.filter((g) => !g.review).length;
  return { open, atLeast: ok.some((s) => s.openAtLeast), review, rest: Math.max(0, open - shown) };
}

/** D357: one card's second line, each its own fact (D291): why it stands here, where it is, its labels. */
function whyOf(i: SourceItem & { why?: SourceGlance["why"] }): string | undefined {
  if (i.review || i.why === "review") return t("onhand.todos.why.review");
  if (i.why === "mentioned") return t("onhand.todos.why.mentioned");
  if (i.due) return t("todos.pick.due", i.due);
  return undefined;
}

/** D357: the action on a to-do: hand it over, see its task, or (a review request) open it. */
function TodoAct({ i, small }: { i: SourceItem; small?: boolean }) {
  const name = A.S.personaName;
  const app = appOf(i.kind);
  if (i.review) return <Btn kind="secondary" size="sm" label={t("todos.chip.open", app)} about={i.title} onClick={() => i.url && window.open(i.url, "_blank", "noreferrer")} />;
  if (i.taskId) return <Btn kind="text" size="sm" label={t("onhand.todos.doing")} about={i.title} onClick={() => A.go({ name: "task", id: i.taskId! })} />;
  const sending = !!HAND.sending[i.ref];
  return <Btn kind={small ? "text" : "secondary"} size="sm" label={sending ? t("onhand.todos.handing", name) : t("onhand.todos.hand", name)} about={i.title} disabled={sending} onClick={() => handOver(i)} />;
}

/** D357: a to-do as On hand shows it first: a card of the board's own language, the app's mark where a task has its agent's coin. */
export function TodoCard({ i }: { i: SourceGlance }) {
  const why = whyOf(i);
  const app = appOf(i.kind);
  const failed = HAND.failed[i.ref];
  return (
    <div class={`tcard todo-card${i.review ? " review" : ""}`} data-todo={i.ref}>
      <a class="cmain" href={i.url} target="_blank" rel="noreferrer" title={`${i.title}\n${t("todos.chip.open", app)}`}>
        <span class="c1">
          <span class="todo-mark">
            <BrandMark name={i.kind} size={20} />
          </span>
          <span class="t">{i.title}</span>
        </span>
        <span class="c2 todo-c2">
          {why && <span class={`todo-why why-${i.review ? "review" : i.why}`}>{why}</span>}
          <SourceChip src={i} small states={false} plain />
          {i.review && i.author && <span class="todo-by">{t("onhand.todos.by", i.author)}</span>}
          {(i.labels ?? []).slice(0, 2).map((l) => (
            <span key={l} class="todo-label">
              {l}
            </span>
          ))}
        </span>
      </a>
      <div class="c3 todo-foot">
        {failed ? <span class="todo-failed">{failed}</span> : i.updatedAt && <span class="beat">{t("onhand.todos.updated", ago(A.L, i.updatedAt))}</span>}
        <TodoAct i={i} />
      </div>
    </div>
  );
}

/** D357: a to-do in the fold: the low card's language (one line lower), its action at once. */
function TodoRow({ i }: { i: SourceItem }) {
  const why = whyOf(i);
  const failed = HAND.failed[i.ref];
  return (
    <div class="tcompact todo-row-card" data-todo={i.ref}>
      <a class="kmain" href={i.url} target="_blank" rel="noreferrer" title={`${i.title}\n${t("todos.chip.open", appOf(i.kind))}`}>
        <span class="todo-mark small">
          <BrandMark name={i.kind} size={16} />
        </span>
        <span class="ktx">
          <span class="k1">
            <span class="t">{i.title}</span>
          </span>
          <span class="k2">
            {why && <span class={`todo-why why-${i.review ? "review" : "due"}`}>{why}</span>}
            <SourceChip src={i} small states={false} plain />
            {i.review && i.author && <span class="todo-by">{t("onhand.todos.by", i.author)}</span>}
            {(i.labels ?? []).slice(0, 2).map((l) => (
              <span key={l} class="todo-label">
                {l}
              </span>
            ))}
            {failed ? <span class="todo-failed">{failed}</span> : i.updatedAt && <span class="since">{t("onhand.todos.updated", ago(A.L, i.updatedAt))}</span>}
          </span>
        </span>
      </a>
      <span class="tacts on">
        <TodoAct i={i} small />
      </span>
    </div>
  );
}

/** A chip of the fold: one choice of what narrows it, 44 tall to the touch. */
function Chip({ on, label, mark, onPick }: { on: boolean; label: string; mark?: string; onPick: () => void }) {
  return (
    <button class={`pchip todo-chip${on ? " on" : ""}`} aria-pressed={on} onClick={onPick}>
      {mark && <BrandMark name={mark} size={14} />}
      <span>{label}</span>
    </button>
  );
}

/**
 * D357: the fold under the few cards, opened in place: find by title or number, narrow by source,
 * repository or folder, tag, or the PRs waiting for review; a page at a time, newest first.
 */
export function TodoFold({ sources, shown = [] }: { sources: SourceView[]; shown?: string[] }) {
  const [q, setQ] = useState(TF.q);
  useEffect(() => {
    if (q === TF.q) return;
    const h = setTimeout(() => ((TF.q = q), askFold(1)), 400);
    return () => clearTimeout(h);
  }, [q]);
  const only = TF.source ? sources.filter((s) => s.id === TF.source) : sources;
  const gh = only.some((s) => s.kind === "github");
  const vault = only.some((s) => s.kind === "obsidian");
  const review = only.reduce((n, s) => n + (s.review ?? 0), 0);
  const pick = (patch: Partial<TodoFoldState>) => (Object.assign(TF, patch), askFold(1));
  const plain = !TF.where && TF.where !== "" && !TF.tag && !TF.review;
  // The cards above are not said twice while nothing narrows the fold.
  const rows = plain && !TF.q.trim() ? TF.items.filter((i) => !shown.includes(i.ref)) : TF.items;
  return (
    <div class="todo-fold" role="group" aria-label={todoGroupName(sources)}>
      <label class="find todo-find">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
          <circle cx="7" cy="7" r="4.4" />
          <path d="M10.3 10.3 13.5 13.5" />
        </svg>
        <input
          type="search"
          dir="auto"
          enterKeyHint="search"
          autocomplete="off"
          spellcheck={false}
          value={q}
          placeholder={t("onhand.todos.find")}
          aria-label={t("onhand.todos.find")}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.isComposing) (TF.q = q), askFold(1);
            if (e.key === "Escape") e.stopPropagation(), setQ("");
          }}
        />
      </label>
      <div class="todo-chips" role="toolbar" aria-label={t("onhand.todos.filters")}>
        <Chip on={plain && !TF.source} label={t("onhand.todos.chip.all")} onPick={() => pick({ source: undefined, where: undefined, tag: undefined, review: false })} />
        {sources.length > 1 &&
          sources.map((s) => <Chip key={s.id} on={TF.source === s.id && plain} mark={s.kind} label={s.kind === "github" ? "GitHub" : s.name} onPick={() => pick({ source: s.id, where: undefined, tag: undefined, review: false })} />)}
        {gh && review > 0 && <Chip on={!!TF.review} label={t("onhand.todos.chip.review", review)} onPick={() => pick({ review: !TF.review, where: undefined, tag: undefined })} />}
        {TF.wheres.map((w) => (
          <Chip key={`w:${w}`} on={TF.where === w} label={w === "" ? t("onhand.todos.chip.top") : gh && !vault ? (w.split("/")[1] ?? w) : w} onPick={() => pick({ where: TF.where === w ? undefined : w, review: false })} />
        ))}
        {vault &&
          TF.tags.map((g) => <Chip key={`t:${g}`} on={TF.tag === g} label={`#${g}`} onPick={() => pick({ tag: TF.tag === g ? undefined : g, review: false })} />)}
      </div>
      {TF.limited && <p class="small tone-bad">{t("onhand.todos.limited")}</p>}
      {TF.failed && !TF.limited && <p class="small tone-bad">{t("todos.read.failed", only.length === 1 ? appOf(only[0]!.kind) : "GitHub")}</p>}
      {rows.length > 0 && (
        <div class="tcompacts">
          {rows.map((i) => (
            <TodoRow key={i.ref} i={i} />
          ))}
        </div>
      )}
      {TF.loading ? <p class="small muted todo-loading">{t("todos.looking")}</p> : !rows.length && !TF.limited && !TF.failed && <p class="small muted">{t("onhand.todos.none")}</p>}
      {!TF.loading && TF.more && <Btn kind="text" size="sm" class="todo-page" label={t("onhand.todos.page", BROWSE_PAGE)} onClick={() => askFold(TF.page + 1)} />}
    </div>
  );
}

A.onSourcesFrame = (f) => {
  if (f.t === "sources") {
    TS.frame = f;
    // 再试一次 waits for the home's own word that it is looking (or has looked).
    for (const s of f.sources) if (s.looking || s.state !== "error") delete TS.busy[`look:${s.id}`];
  }
  else if (f.t === "source_items_result") {
    if (f.clientId === TS.itemsFor) TS.items = f.items;
    // D357: a page of On hand's fold (only the latest asked counts).
    else if (f.clientId === TF.cid) {
      const page = f.page ?? 1;
      const seen = new Set(page > 1 ? TF.items.map((i) => i.ref) : []);
      TF.items = [...(page > 1 ? TF.items : []), ...f.items.filter((i) => !seen.has(i.ref))];
      Object.assign(TF, { page, more: !!f.more, loading: false, limited: !!f.limited, failed: !!f.errors?.length && !f.items.length });
      if (page === 1 && f.wheres) TF.wheres = f.wheres;
      if (page === 1 && f.tags) TF.tags = f.tags;
    }
  } else if (f.t === "source_result") {
    TS.busy = {};
    TS.said = f.ok ? undefined : f.reason === "missing" ? t("todos.add.missing", A.homeName ?? "") : f.reason === "exists" ? t("todos.add.exists") : f.reason ? t(`todos.state.${f.reason === "unknown" ? "error" : f.reason}`, A.homeName ?? "") : undefined;
  }
  A.changed();
};

const appOf = (kind: string) => (kind === "github" ? "GitHub" : kind === "obsidian" ? "Obsidian" : "Jira");

/** The source's own sub line: whose issues, or which part of the vault. */
function subOf(v: SourceView): string {
  if (v.kind === "github") return v.name && v.name !== "GitHub" ? t("todos.github.sub", v.name) : t("todos.github.sub.none");
  return t("todos.obsidian.sub", v.folder ? v.folder : t("todos.obsidian.all"));
}

function problem(v: SourceView): string | undefined {
  if (v.state === "ok") return undefined;
  // A failed look says so, with the app's name: never a count it didn't read.
  if (v.state === "error") return t("todos.read.failed", appOf(v.kind));
  return t(`todos.state.${v.state}`, A.homeName ?? "");
}

/**
 * The count line's state: counted only after a look that read the list; before one, 正在看… / Looking….
 * (A failed look shows its problem instead, so 0 件没做完 is never a guess.)
 */
export function countOf(v: Pick<SourceView, "state" | "open" | "checkedAt">): "looking" | "counted" | "failed" {
  if (v.state !== "ok") return "failed";
  return v.checkedAt && v.open !== undefined ? "counted" : "looking";
}

/** The counts, each its own fact (D291): open (the true total, or "at least"), being done, PRs waiting for review. */
export function countWords(v: Pick<SourceView, "open" | "openAtLeast" | "taken" | "review">): (string | false)[] {
  const n = v.open ?? 0;
  const open = v.openAtLeast ? t("todos.open.atleast", n) : n === 1 ? t("todos.open.one") : t("todos.open", n);
  const review = (v.review ?? 0) > 0 && (v.review === 1 ? t("todos.review.one") : t("todos.review", v.review));
  return [open, (v.taken ?? 0) > 0 && t("todos.taken", v.taken), review];
}

/**
 * D357: the counts, each its own fact (D291); what can be seen is a link to it on On hand (the open
 * ones, the PRs waiting for review), never a list here.
 */
function CountLinks({ v }: { v: SourceView }) {
  const [open, taken, review] = countWords(v);
  const link = (words: string, o: { review?: boolean }) => (
    <button class="past-link todo-count-link" title={t("todos.see")} aria-label={spoken(A.L, words, t("todos.see"))} onClick={() => seeTodos({ source: v.id, ...o })}>
      <span>{words}</span>
      <Chev />
    </button>
  );
  return <Facts class="todo-counts" items={[open && ((v.open ?? 0) > 0 ? link(open, {}) : open), taken, review && link(review, { review: true })]} />;
}

/** 再试一次 / Try again: asking for the sources again makes the home look now. */
function retry(v: SourceView) {
  TS.busy[`look:${v.id}`] = true;
  A.send({ t: "sources" });
  A.changed();
}

export function TodoSourcesSettings() {
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "sources" });
  }, [A.S.welcomed]);
  const f = TS.frame;
  if (!f) return <div class="small">{t("conn.connecting")}</div>;
  const gh = f.found.github;
  // D345: GitHub is always offered while it isn't added: 连上 signs in (and puts gh there) in place.
  const canGh = !f.sources.some((s) => s.kind === "github");
  const signedIn = gh?.state === "ok";
  const panel = !!A.ghTodo && canGh;
  return (
    <>
      <p class="af-lede">{t("todos.lede", A.S.personaName)}</p>
      {!f.sources.length && <p class="small">{t("todos.empty")}</p>}
      {f.sources.map((v) => (
        <SourceCard key={v.id} v={v} />
      ))}
      <SecHead title={t("todos.add.title")} />
      <section class="set-card chat-app todo-add">
        {canGh && (
          <div class="chat-head">
            <BrandTile name="github" />
            <span class="grow">
              <b>GitHub</b>
              <small>{signedIn ? t("todos.add.github", gh!.computer ?? A.homeName ?? "", gh!.login ?? "") : t("todos.github.row")}</small>
            </span>
            {!panel && (
              <Btn
                kind="secondary"
                size="sm"
                label={t("todos.connect")}
                about="GitHub"
                disabled={TS.busy.github}
                onClick={() => (signedIn ? ((TS.busy.github = true), A.send({ t: "source_add", kind: "github" }), A.changed()) : A.ntGhStart("local", "todos"))}
              />
            )}
          </div>
        )}
        {panel && <GhSignIn which="todos" inline />}
        {f.found.vaults.map((x) => (
          <div class="chat-head" key={x.path}>
            <BrandTile name="obsidian" />
            <span class="grow">
              <b>{x.name}</b>
              <small>{t("todos.add.vault")}</small>
            </span>
            <Btn kind="secondary" size="sm" label={t("todos.add")} about={x.name} disabled={TS.busy[x.path]} onClick={() => ((TS.busy[x.path] = true), A.send({ t: "source_add", kind: "obsidian", path: x.path }), A.changed())} />
          </div>
        ))}
        <VaultPath />
        <div class="chat-head">
          <BrandTile name="jira" faded />
          <span class="grow">
            <b>Jira</b>
            <small>{t("todos.jira.sub")}</small>
          </span>
          <Tag text={t("todos.soon")} />
        </div>
      </section>
      {TS.said && <p class="small tone-bad">{TS.said}</p>}
      <p class="small chats-goes">{t("todos.own", A.S.personaName)}</p>
    </>
  );
}

/** 加上一个 Obsidian 库… / Add an Obsidian vault…: a folder on the home, by its path. */
function VaultPath() {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  if (!open)
    return (
      <div class="chat-head">
        <BrandTile name="obsidian" faded />
        <span class="grow">
          <Btn kind="text" label={t("todos.add.path")} onClick={() => setOpen(true)} />
        </span>
      </div>
    );
  const go = () => {
    if (!path.trim()) return;
    TS.busy.path = true;
    A.send({ t: "source_add", kind: "obsidian", path: path.trim() });
    A.changed();
  };
  return (
    <div class="chat-head todo-path">
      <BrandTile name="obsidian" />
      <input class="field grow" value={path} placeholder={t("todos.add.path.hint")} aria-label={t("todos.add.path")} onInput={(e) => setPath((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <Btn kind="secondary" size="sm" label={t("todos.add.path.go")} disabled={!path.trim() || TS.busy.path} onClick={go} />
    </div>
  );
}

function SourceCard({ v }: { v: SourceView }) {
  const [asking, setAsking] = useState(false);
  const bad = problem(v);
  const count = countOf(v);
  const set =(patch: { whenNew?: WhenNew; whenDone?: WhenDone }) => A.send({ t: "source_set", id: v.id, ...patch });
  const done = (WHEN_DONE as Record<string, readonly WhenDone[]>)[v.kind] ?? [];
  const name = v.kind === "github" ? "GitHub" : v.name;
  return (
    <section class="set-card chat-app todo-src" aria-label={name}>
      <div class="chat-head">
        <BrandTile name={v.kind} />
        <span class="grow">
          <b>{name}</b>
          <small class={bad ? "tone-bad" : v.kind === "github" && A.ghConnected ? "tone-done" : undefined}>{bad ?? (v.kind === "github" && A.ghConnected ? t("todos.connected", A.ghConnected) : subOf(v))}</small>
        </span>
      </div>
      {count === "looking" && <small class="muted todo-counts">{t("todos.looking")}</small>}
      {v.state === "error" && (
        <div class="chat-row todo-failed">
          <small class="muted grow">{v.error}</small>
          {v.looking || TS.busy[`look:${v.id}`] ? <small class="muted">{t("todos.looking")}</small> : <Btn kind="secondary" size="sm" label={t("todos.retry")} about={name} onClick={() => retry(v)} />}
        </div>
      )}
      {v.kind === "github" && bad && A.ghTodo && <GhSignIn which="todos" inline />}
      {count === "counted" && <CountLinks v={v} />}
      <div class="chat-row">
        <span class="grow">
          <b>{t("todos.new")}</b>
          {v.standing?.take && v.whenNew === "take" && <small>{t("todos.standing")}</small>}
        </span>
        <Seg label={t("todos.new")} value={v.whenNew} options={(["tell", "take", "quiet"] as const).map((x) => ({ v: x, label: t(`todos.new.${x}`) }))} onPick={(x) => set({ whenNew: x })} />
      </div>
      <div class="chat-row">
        <span class="grow">
          <b>{t("todos.done")}</b>
          {v.standing?.write && v.whenDone !== "ask" && <small>{t("todos.standing.write")}</small>}
        </span>
        <Seg label={t("todos.done")} value={v.whenDone} options={done.map((x) => ({ v: x, label: t(`todos.done.${x}`) }))} onPick={(x) => set({ whenDone: x })} />
      </div>
      <SourceFilters v={v} />
      <div class="chat-foot">
        <span class="grow">{(v.state === "signed_out" || v.state === "no_tool") && !A.ghTodo && <Btn kind="secondary" size="sm" label={t("todos.signin")} about="GitHub" onClick={() => A.ntGhStart("local", "todos")} />}</span>
        {asking ? (
          <span class="ask-in-place">
            <small>{t("todos.remove.ask", name)}</small>
            <Btn kind="text" size="sm" label={t("todos.remove.no")} onClick={() => setAsking(false)} />
            <DangerButton label={t("todos.remove.yes")} about={name} onClick={() => (A.send({ t: "source_remove", id: v.id }), setAsking(false))} />
          </span>
        ) : (
          <DangerButton quiet label={t("todos.remove")} about={name} onClick={() => setAsking(true)} />
        )}
      </div>
    </section>
  );
}

/** D348: "acme/web, acme/api" → ["acme/web", "acme/api"]: owner/repo, split at commas or spaces (either width). */
export function reposOf(text: string): string[] {
  return [...new Set(text.split(/[\s,，、;；]+/).map((r) => r.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "")).filter(Boolean))];
}

/** D348: which part a source reads, set here: GitHub's repositories; a vault's folder and tag. Saved on Return or leaving the field. */
export function SourceFilters({ v }: { v: SourceView }) {
  const save = (patch: { folder?: string; label?: string; repos?: string[] }) => A.send({ t: "source_set", id: v.id, ...patch });
  const name = v.kind === "github" ? "GitHub" : v.name;
  if (v.kind === "github")
    return (
      <div class="chat-row todo-filters">
        <FilterField id={`${v.id}-repos`} label={t("todos.repos")} about={name} hint={t("todos.repos.hint")} placeholder={t("todos.repos.all")} value={(v.repos ?? []).join(", ")} onSave={(x) => save({ repos: reposOf(x) })} />
      </div>
    );
  return (
    <div class="chat-row todo-filters">
      <FilterField id={`${v.id}-folder`} label={t("todos.folder")} about={name} placeholder={t("todos.folder.all")} value={v.folder ?? ""} onSave={(x) => save({ folder: x.trim().replace(/^[/\\]+|[/\\]+$/g, "") })} />
      <FilterField id={`${v.id}-tag`} label={t("todos.tag")} about={name} placeholder={t("todos.tag.any")} value={v.label ?? ""} onSave={(x) => save({ label: x.trim() })} />
    </div>
  );
}

function FilterField(p: { id: string; label: string; about: string; value: string; placeholder: string; hint?: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(p.value);
  // The home's word wins once it lands (another window, or the save itself, cleaned).
  useEffect(() => setText(p.value), [p.value]);
  const commit = () => text.trim() !== p.value.trim() && p.onSave(text);
  return (
    <label class="acct-field chat-field todo-filter" for={p.id}>
      <span>{p.label}</span>
      <input
        id={p.id}
        dir="auto"
        autocomplete="off"
        autoCapitalize="off"
        spellcheck={false}
        enterKeyHint="done"
        aria-label={`${p.label}, ${p.about}`}
        placeholder={p.placeholder}
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.isComposing) (e.preventDefault(), commit());
          else if (e.key === "Escape") setText(p.value);
        }}
      />
      {p.hint && <small>{p.hint}</small>}
    </label>
  );
}

/** A bound task's chip: its app's mark and "#12" or the note's name; it opens the to-do in its app. */
export function SourceChip({ src, small, states = true, plain }: { src: NonNullable<TaskCard["source"]> | SourceItemRef; small?: boolean; states?: boolean; plain?: boolean }) {
  const s = src as NonNullable<TaskCard["source"]>;
  const word = !states ? undefined : s.state === "closed" && !s.wrote?.includes("tick") ? "todos.chip.closed" : s.state === "gone" ? "todos.chip.gone" : s.wrote?.includes("tick") ? "todos.chip.ticked" : s.wrote?.includes("comment") ? "todos.chip.commented" : undefined;
  const app = appOf(src.kind);
  const label = src.kind === "github" && src.where ? `${src.where.split("/")[1]}${src.label}` : src.label;
  const inner = (
    <>
      <BrandMark name={src.kind} size={small ? 14 : 16} />
      <span class="src-label">{label}</span>
    </>
  );
  return (
    <span class={`src-chip${small ? " small" : ""}`}>
      {src.url && !plain ? (
        <a class="src-link" href={src.url} target="_blank" rel="noreferrer" title={`${src.title}\n${t("todos.chip.open", app)}`} aria-label={`${t("todos.chip.open", app)}: ${src.title}`} onClick={(e) => e.stopPropagation()}>
          {inner}
        </a>
      ) : (
        <span class="src-link" title={src.title}>
          {inner}
        </span>
      )}
      {word && <span class="src-state">{t(word)}</span>}
    </span>
  );
}

/** New task's 从待办里选 / Pick from your to-dos: the open ones, searchable; picking hands back the item. */
export function TodoPick(p: { picked?: SourceItemRef; onPick: (it: SourceItem | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ask = (query: string) => {
    TS.itemsFor = `pick-${Date.now()}`;
    TS.items = undefined;
    A.send({ t: "source_items", query, clientId: TS.itemsFor });
    A.changed();
  };
  useEffect(() => {
    if (open) ask(q);
  }, [open]);
  if (p.picked)
    return (
      <div class="todo-picked">
        <SourceChip src={p.picked} states={false} />
        <span class="grow todo-title">{p.picked.title}</span>
        <Btn kind="text" size="sm" label={t("todos.pick.unpick")} onClick={() => p.onPick(undefined)} />
      </div>
    );
  if (!open) return <Btn kind="text" size="sm" class="todo-pick-btn" label={t("todos.pick")} onClick={() => setOpen(true)} />;
  const items = TS.items;
  return (
    <div class="todo-pick" role="group" aria-label={t("todos.pick")}>
      <input class="field" value={q} placeholder={t("todos.pick.find")} aria-label={t("todos.pick.find")} onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} />
      {!items ? (
        <small class="muted">{t("todos.pick.loading")}</small>
      ) : !items.length ? (
        <small class="muted">{t("todos.pick.none")}</small>
      ) : (
        <ul class="todo-list">
          {items
            .filter((i) => !q.trim() || `${i.title} ${i.where ?? ""} ${i.label}`.toLowerCase().includes(q.trim().toLowerCase()))
            .slice(0, 12)
            .map((i) => (
              <li key={i.ref}>
                <button class="todo-row" onClick={() => (p.onPick(i), setOpen(false))}>
                  <SourceChip src={i} small states={false} />
                  <span class="grow todo-title">{i.title}</span>
                  {i.taskId ? <small class="todo-doing">{t("todos.pick.doing")}</small> : i.due ? <small>{t("todos.pick.due", i.due)}</small> : null}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/** The write-back card's body: the comment whole, as it goes out, and whether it closes too. */
export function SourceCardBody({ src }: { src: NonNullable<import("@ducter/protocol").Bodies["decision"]["src"]> }) {
  return (
    <div class="src-card">
      <SourceChip src={src.item} states={false} />
      {src.kind === "write" && src.text && (
        <>
          <small class="muted">{t("todos.card.says")}</small>
          <blockquote class="src-quote">{src.text}</blockquote>
        </>
      )}
      {src.kind === "write" && src.close && <small class="muted">{t("todos.card.and.close")}</small>}
    </div>
  );
}
