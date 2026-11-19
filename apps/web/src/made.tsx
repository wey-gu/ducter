// D383: 给你做的 / Made for you (design/made.md): Past tasks' middle tab. What the partner and its
// tasks made for the person (files, pictures, tables, charts, lists, links), found by a name, a
// kind, a time or what is in it, each opened with what already opens it: a file or picture in the
// viewer (D206, D356 for a file on a computer), a table drawn again in place, a link in the browser.
import type { MadeItem, MadeKind, MadeQuery, ServerFrame } from "@ducter/protocol";
import { fileBadge, madeExt, sizeWords, thumbPath } from "@ducter/protocol";
import { A } from "./app.ts";
import { Facts } from "./controls.tsx";
import { FileBadge } from "./filecard.tsx";
import { openFile, openFileLink } from "./fileview.tsx";
import { url } from "./media.tsx";
import { RichBlock } from "./rich.tsx";
import { APP_GLYPH, openApp } from "./apps.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Result = Extract<ServerFrame, { t: "made_result" }>;

/** What the tab holds between renders. */
export const M = {
  res: undefined as Result | undefined,
  asked: "",
  n: 0,
  kind: undefined as MadeKind | undefined,
  /** The block opened in place (its id). */
  open: "",
  timer: 0 as unknown as ReturnType<typeof setTimeout> | 0,
};

/** Asks the home for what was made (after a short pause while typing). */
export function askMade(q: string, now = false) {
  if (M.timer) clearTimeout(M.timer);
  const go = () => {
    M.timer = 0;
    M.asked = `m${++M.n}`;
    const query: MadeQuery = { ...(q.trim() ? { q: q.trim() } : {}), ...(M.kind ? { kind: M.kind } : {}) };
    A.send({ t: "made", id: M.asked, query });
  };
  if (now) go();
  else M.timer = setTimeout(go, 120);
}

export function onMadeFrame(f: Result) {
  if (f.id !== M.asked) return;
  M.res = f;
  A.changed();
}

// ---------- the tile: a picture's own thumbnail, a file's badge, a drawn kind ----------

const KIND_G: Record<Exclude<MadeKind, "file" | "picture" | "app">, string> = {
  table: "M4 5.5h12v9H4zM4 8.5h12M4 11.5h12M9 5.5v9",
  chart: "M4.5 15.5h11M6.5 15.5v-4M10 15.5V7M13.5 15.5V9.5",
  list: "M4.5 6.5l1.2 1.2 2-2.2M4.5 11.5l1.2 1.2 2-2.2M10 6.5h5.5M10 11.5h5.5M10 15h5.5",
  link: "M8.6 11.4a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-.9.9M11.4 8.6a3 3 0 0 0-4.2 0L5.1 10.7a3 3 0 0 0 4.2 4.2l.9-.9",
};

export function Tile({ it }: { it: MadeItem }) {
  if (it.kind === "picture" && it.media) {
    return (
      <span class="mtile pic" aria-hidden="true">
        <img src={url(thumbPath(it.media))} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  if (it.kind === "app") {
    return (
      <span class="mtile drawn k-app" aria-hidden="true">
        {APP_GLYPH(22)}
      </span>
    );
  }
  if (it.kind === "file" || it.kind === "picture") {
    const m = it.media ?? { type: "", name: it.title };
    return (
      <span class="mtile file" aria-hidden="true">
        <FileBadge m={m} size={26} />
      </span>
    );
  }
  return (
    <span class={`mtile drawn k-${it.kind}`} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 20 20">
        <path d={KIND_G[it.kind]} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  );
}

/** The words a card says what it is by: a file's own kind (PDF, MD), else the kind's word. */
export function kindWord(it: MadeItem): string {
  if (it.kind === "file") {
    const b = it.media ? fileBadge(it.media) : madeExt(it.title).toUpperCase();
    return b || t("made.k.file");
  }
  if (it.kind === "link" && /\/pull\/\d+/.test(it.url ?? "")) return "PR";
  return t(`made.k.${it.kind}`);
}

// ---------- opening ----------

export function openIt(it: MadeItem, el: HTMLElement | undefined, close: () => void) {
  if (it.app) return void (close(), openApp(it.app.id));
  if (it.media) return openFile(it.media, el);
  if (it.path) return openFileLink(it.path, it.task?.taskId);
  if (it.url) return void window.open(it.url, "_blank", "noopener");
  if (it.block) {
    M.open = M.open === it.id ? "" : it.id;
    A.changed();
  }
  void close;
}

function openTask(it: MadeItem, close: () => void) {
  if (!it.task) return;
  close();
  A.go({ name: "task", id: it.task.taskId });
}

function Card({ it, q, close, mark, dateOf }: { it: MadeItem; q: string; close: () => void; mark: (text: string, q: string) => preact.JSX.Element; dateOf: (iso: string) => string }) {
  const open = M.open === it.id;
  const second = it.hit ? (
    <span class="pl2 hit">
      <b>{t(`made.hit.${it.hit.field}`)}</b>
      <span>{mark(it.hit.text, q)}</span>
    </span>
  ) : it.ask ? (
    <span class="pl2">{t("made.asked", it.ask)}</span>
  ) : it.task?.title ? (
    <span class="pl2">{t("made.from", it.task.title)}</span>
  ) : it.block ? (
    <span class="pl2">{t("made.inconv")}</span>
  ) : null;
  return (
    <div class={`pcard mcard${open ? " open" : ""}`} data-id={it.id}>
      <button class="pmain" onClick={(e) => openIt(it, e.currentTarget as HTMLElement, close)} aria-label={it.title || kindWord(it)} aria-expanded={it.block ? open : undefined}>
        <Tile it={it} />
        <span class="pbody">
          <span class="pl1">
            <span class="pt">{it.title || kindWord(it)}</span>
            {it.pinned && <span class="ptag">{t("made.pinned")}</span>}
          </span>
          {second}
          <span class="pl3">
            <Facts items={[kindWord(it), it.media && it.media.bytes > 0 ? sizeWords(it.media.bytes) : null, dateOf(it.at)]} />
          </span>
        </span>
      </button>
      {it.task && (
        <span class="pacts">
          <button class="linkish mtask" onClick={() => openTask(it, close)}>
            {t("made.task")}
          </button>
        </span>
      )}
      {open && it.block && (
        <div class="mblock">
          <RichBlock b={it.block} at={{ seq: it.seq ?? 0, index: Number(it.id.split(":")[2] ?? 0), live: false }} />
        </div>
      )}
    </div>
  );
}

/** Past's own: the section a date falls in, and a card's date. The section a date falls in (Past's own): today, yesterday, this week, last week, this month, its month. */
type Group = (iso: string) => { key: string; label: string };

export function MadeTab({ q, field, group, dateOf, close, mark }: { q: string; field: preact.JSX.Element; group: Group; dateOf: (iso: string) => string; close: () => void; mark: (text: string, q: string) => preact.JSX.Element }) {
  const r = M.res;
  const items = r?.items ?? [];
  const searching = !!q.trim();
  const secs: { key: string; label: string; items: MadeItem[] }[] = [];
  if (searching) secs.push({ key: "found", label: t("made.n", r?.total ?? items.length), items });
  else
    for (const it of items) {
      const g = group(it.at);
      const last = secs.at(-1);
      if (last?.key === g.key) last.items.push(it);
      else secs.push({ ...g, items: [it] });
    }
  const kinds = r?.kinds ?? [];
  const name = A.defaultName() || "Ducter";
  return (
    <>
      <p class="made-line">{t("made.line", name)}</p>
      {field}
      {(kinds.length > 1 || M.kind) && (
        <div class="pchips" role="radiogroup">
          <button role="radio" aria-checked={!M.kind} class={`pchip${!M.kind ? " on" : ""}`} onClick={() => ((M.kind = undefined), askMade(q, true), A.changed())}>
            {t("made.all")}
          </button>
          {kinds.map((k) => (
            <button key={k.kind} role="radio" aria-checked={M.kind === k.kind} class={`pchip${M.kind === k.kind ? " on" : ""}`} onClick={() => ((M.kind = M.kind === k.kind ? undefined : k.kind), askMade(q, true), A.changed())}>
              {t(`made.c.${k.kind}`)}
            </button>
          ))}
        </div>
      )}
      <div class="past-list">
        {r && !items.length && <p class="past-none">{searching || M.kind ? t("made.none", name) : t("made.empty", name)}</p>}
        {secs.map((s) => (
          <section key={s.key} class="past-sec">
            <h3>{s.label}</h3>
            {s.items.map((it) => (
              <Card key={it.id} it={it} q={q} close={close} mark={mark} dateOf={dateOf} />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
