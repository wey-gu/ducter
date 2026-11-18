// 设置 › 待办来源 / Settings › To-do sources (D341, design/task-sources.md): the person's to-dos in
// other apps, GitHub issues and PRs assigned to them and Obsidian Tasks lines in a vault on the home,
// which a task can be bound to. The app owns what the to-do is and whether it is open; Ducter owns
// how it gets done. Here: what is added, what happens when a new one comes and when a task is done,
// and what could be added without a step. Also the pieces other views use: the chip a bound task
// shows (its app's mark and "#12" or the note's name) and New task's pick.
import type { SourceItem, SourceItemRef, SourcesServerFrame, SourceView, TaskCard, WhenDone, WhenNew } from "@ducter/protocol";
import { WHEN_DONE } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandMark, BrandTile } from "./brand.tsx";
import { Btn, DangerButton, Facts, Seg } from "./controls.tsx";
import { SecHead, Tag } from "./set-grid.tsx";
import { GhSignIn } from "./gh-signin.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Frame = Extract<SourcesServerFrame, { t: "sources" }>;

/** What this page knows; the home's frames keep it current. */
export const TS: { frame?: Frame; items?: SourceItem[]; itemsFor?: string; busy: Record<string, boolean>; said?: string } = { busy: {} };

A.onSourcesFrame = (f) => {
  if (f.t === "sources") {
    TS.frame = f;
    // 再试一次 waits for the home's own word that it is looking (or has looked).
    for (const s of f.sources) if (s.looking || s.state !== "error") delete TS.busy[`look:${s.id}`];
  }
  else if (f.t === "source_items_result") {
    if (f.clientId === TS.itemsFor) TS.items = f.items;
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
      {count === "counted" && (
        <Facts class="todo-counts" items={[v.open === 1 ? t("todos.open.one") : t("todos.open", v.open), (v.taken ?? 0) > 0 && t("todos.taken", v.taken)]} />
      )}
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
