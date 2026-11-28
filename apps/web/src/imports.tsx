// D655 (research/246 §3.10, §3.11): Settings › 导入 / Import, its consent card, its one line
// in Past tasks, and removal. One row per source: its picture and name, its state, its action and
// a ⋯ menu. The card says every fact literally, once; the offer costs a glance and fades. What it
// brings in lives only in Past tasks, read only.
import type { ImportsServerFrame, ImportSourceId, ImportSourceRow, ServerFrame } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { A } from "./app.ts";
import { BrandTile } from "./brand.tsx";
import { Btn, DangerButton, MoreButton } from "./controls.tsx";
import { Waiting } from "./set-grid.tsx";
import { Menu, MenuItem, MenuSep } from "./menu.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** What Settings › Import and Past tasks know; the home's frames keep it current. */
export const IM: {
  frame?: Extract<ImportsServerFrame, { t: "imports" }>;
  /** A bring-in in flight (per source), until its answer or the next frame says otherwise. */
  busy: Record<string, boolean>;
  /** An update in flight (per source). */
  updating: Record<string, boolean>;
  /** The consent card open (per source), and the row's read list. */
  consent: Record<string, boolean>;
  read: Record<string, boolean>;
  more: Record<string, boolean>;
  /** 删掉这个来源 asked in place (per source). */
  remove: Record<string, boolean>;
  /** The last failure's words (per source). */
  err: Record<string, string>;
  /** A consent card opened from Past tasks' offer: the pane shows it as it opens. */
  opening?: ImportSourceId;
} = { busy: {}, updating: {}, consent: {}, read: {}, more: {}, remove: {}, err: {} };

function onImportsFrame(f: ImportsServerFrame) {
  if (f.t === "imports") {
    IM.frame = f;
    for (const s of f.sources) if (!s.running) delete IM.busy[s.id];
    // A card opened from the offer: open its consent once the row is there.
    if (IM.opening) {
      IM.consent[IM.opening] = true;
      IM.opening = undefined;
    }
    return A.changed();
  }
  delete IM.busy[f.id];
  delete IM.updating[f.id];
  if (f.op === "update") {
    if (f.ok) {
      A.toast(f.upToDate ? t("imports.update.upToDate") : t("imports.updated"));
      // A widened read list puts the consent card back before anything runs.
      if (f.needsConsent) IM.consent[f.id] = true;
    } else IM.err[f.id] = f.error && A.L.t(`imports.error.${f.error}`) !== `imports.error.${f.error}` ? t(`imports.error.${f.error}`) : t("imports.error.update_failed");
    A.changed();
    return;
  }
  if (f.op === "remove") {
    if (f.ok) {
      A.toast(t("imports.removed"));
    } else IM.err[f.id] = t("imports.error.failed");
  } else if (!f.ok) {
    IM.err[f.id] = f.error && A.L.t(`imports.error.${f.error}`) !== `imports.error.${f.error}` ? t(`imports.error.${f.error}`) : t("imports.error.failed");
  } else delete IM.err[f.id];
  A.changed();
}

// Past tasks imports this module too; app.ts is still building its one A as this file loads.
queueMicrotask(() => {
  A.onImportsFrame = onImportsFrame;
});

/** Opens Settings › Import with a source's consent card, the way Past tasks' offer leads there. */
export function openImportConsent(id: ImportSourceId) {
  IM.opening = id;
  IM.consent[id] = false;
  A.sheet = { kind: "settings", page: "import" };
  A.changed();
}

function dayWords(day: string | undefined): string {
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return A.L.date(new Date(y, m - 1, d), { month: "short", day: "numeric" });
}

/** The row's state in the person's words: how many, brought in when, or what's new. */
export function stateWords(r: ImportSourceRow): string {
  if (IM.updating[r.id]) return t("imports.updating");
  if (r.running) return t("imports.bringing");
  if (r.state === "looking") return t("imports.state.looking");
  if (r.state !== "ready") return t(`imports.problem.${r.problem ?? "failed"}`);
  if (r.fresh && r.fresh > 0) return t(r.fresh === 1 ? "imports.state.fresh.one" : "imports.state.fresh", r.fresh);
  if (r.imported > 0) return t("imports.state.brought", dayWords(r.importedDay ?? r.oldest));
  if (r.kind === "plugin") return t("imports.state.plugin");
  if (r.total !== undefined) return t(r.total === 1 ? "imports.state.total.one" : "imports.state.total", r.total);
  return t("imports.state.looking");
}

/** The consent card's lines, all literal; `go` absent when it is only being read. */
function ReadList({ go, no, reads, added, author }: { go?: () => void; no?: () => void; reads?: string[]; added?: boolean; author?: string }) {
  return (
    <div class="import-read">
      <b>{t("imports.consent.title")}</b>
      {reads?.length ? (
        <>
          {reads.map((p, i) => (
            <p key={i} class="import-read-path">
              {p}
            </p>
          ))}
          <p>{t("imports.consent.nonet")}</p>
        </>
      ) : (
        <>
          <p>{t("imports.consent.path")}</p>
          <p>{t("imports.consent.command")}</p>
        </>
      )}
      <p>{t("imports.consent.past")}</p>
      <small>{added ? t("imports.consent.made.plugin", author ?? "") : t("imports.consent.made")}</small>
      {go && (
        <div class="btns import-consent-go">
          <Btn kind="primary" label={t("imports.consent.go")} onClick={go} />
          <Btn kind="text" label={t("imports.consent.no")} onClick={no!} />
        </div>
      )}
      {go && <small class="import-once">{t("imports.consent.once")}</small>}
    </div>
  );
}

/** One source's row. */
function ImportRow({ r }: { r: ImportSourceRow }) {
  const moreAt = useRef<HTMLSpanElement>(null);
  const more = !!IM.more[r.id];
  const consent = !!IM.consent[r.id];
  const read = !!IM.read[r.id];
  const asking = !!IM.remove[r.id];
  const busy = !!IM.busy[r.id] || !!r.running;
  const updating = !!IM.updating[r.id];
  const err = IM.err[r.id];
  const canBring = r.state === "ready" && !busy;
  const bring = () => {
    IM.err[r.id] = "";
    if (!r.consented) {
      IM.consent[r.id] = true;
      A.changed();
      return;
    }
    IM.busy[r.id] = true;
    A.send({ t: "import_run", id: r.id });
    A.changed();
  };
  const yes = () => {
    IM.consent[r.id] = false;
    IM.busy[r.id] = true;
    A.send({ t: "import_consent", id: r.id });
    A.changed();
  };
  const remove = () => {
    IM.remove[r.id] = false;
    A.send({ t: "import_remove", id: r.id });
    A.changed();
  };
  const askRemove = t(r.imported === 0 ? "imports.remove.ask.none" : r.imported === 1 ? "imports.remove.ask.one" : "imports.remove.ask", r.imported);
  return (
    <section class="set-card chat-app import-src" aria-label={r.app} data-source={r.id}>
      <div class="chat-head">
        <BrandTile name={r.app} />
        <span class="grow">
          <b>{r.app}</b>
          <small class={r.state !== "ready" && r.state !== "looking" ? "tone-bad" : undefined}>{stateWords(r)}</small>
        </span>
        <span class="import-acts">
          {r.update && !consent && !asking && !busy && !updating && (
            <Btn
              kind="secondary"
              size="sm"
              label={t("imports.update")}
              about={r.app}
              onClick={() => {
                IM.updating[r.id] = true;
                IM.err[r.id] = "";
                A.send({ t: "import_update", id: r.id });
                A.changed();
              }}
            />
          )}
          {canBring && !consent && !asking && !busy && !updating && (
            <Btn kind={r.imported > 0 ? "secondary" : "primary"} size="sm" label={r.imported > 0 ? t("imports.again") : t("imports.bring")} about={r.app} disabled={busy} onClick={bring} />
          )}
          {r.state === "failed" && <Btn kind="secondary" size="sm" label={t("imports.retry")} about={r.app} onClick={() => A.send({ t: "imports" })} />}
          <span class={`import-more${more ? " open" : ""}`} ref={moreAt}>
            <MoreButton label={t("imports.more")} open={more} onClick={() => ((IM.more[r.id] = !more), A.changed())} />
            {more &&
              createPortal(
                <Menu class="pmenu" label={r.app} anchor={moreAt} onClose={() => ((IM.more[r.id] = false), A.changed())}>
                  <MenuItem onClick={() => ((IM.more[r.id] = false), (IM.read[r.id] = !read), A.changed())}>{t(read ? "imports.details.close" : "imports.what")}</MenuItem>
                  <MenuSep />
                  <MenuItem danger onClick={() => ((IM.more[r.id] = false), (IM.remove[r.id] = true), A.changed())}>
                    {t("imports.remove")}
                  </MenuItem>
                </Menu>,
                document.body,
              )}
          </span>
        </span>
      </div>
      {(r.added || r.repo || r.unreviewed || r.reviewed || r.update) && (
        <div class="import-meta">
          {r.added && <p class="small muted import-added">{t("imports.added")}</p>}
          {r.added && r.author && <p class="small muted import-author">{t("imports.author", r.author)}</p>}
          {r.repo && <p class="small muted import-repo">{r.repo}</p>}
          {r.unreviewed && <p class="small import-unreviewed">{t("imports.unreviewed")}</p>}
          {r.reviewed && <p class="small muted import-reviewed">{t("imports.reviewed")}</p>}
          {r.update && <p class="small muted import-update">{r.update.version ? t("imports.state.update", r.update.version) : t("imports.state.updateReady")}</p>}
        </div>
      )}
      {r.state === "ready" && !!r.waiting?.length && <p class="small muted import-waiting">{t("imports.waiting", r.waiting.join(t("acct.sep")))}</p>}
      {read && <ReadList reads={r.reads} added={r.added} author={r.author} />}
      {consent && (
        <div class="import-consent" role="group" aria-label={t("imports.consent.title")}>
          <ReadList reads={r.reads} added={r.added} author={r.author} go={yes} no={() => ((IM.consent[r.id] = false), A.changed())} />
        </div>
      )}
      {err && <p class="small tone-bad">{err}</p>}
      {r.last && !r.running && (
        <div class="import-last">
          <p>{r.last.threads === 0 ? t("imports.last.none") : t(r.last.threads === 1 ? "imports.last.one" : "imports.last", r.last.threads, dayWords(r.last.oldest ?? r.oldest))}</p>
          {r.last.skipped > 0 && <p>{t(r.last.skipped === 1 ? "imports.last.skipped.one" : "imports.last.skipped", r.last.skipped)}</p>}
          {r.last.stopped && <p>{t("imports.last.stopped")}</p>}
        </div>
      )}
      {asking && (
        <div class="chat-row import-remove-ask">
          <small class="grow">{askRemove}</small>
          <Btn kind="text" size="sm" label={t("imports.remove.no")} onClick={() => ((IM.remove[r.id] = false), A.changed())} />
          <DangerButton label={t("imports.remove.yes")} about={r.app} onClick={remove} />
        </div>
      )}
    </section>
  );
}

/** Settings › 导入 / Import: the lede, then one row per source. */
export function ImportSettings() {
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "imports" });
  }, [A.S.welcomed]);
  const f = IM.frame;
  if (!f) return <Waiting text={t("imports.state.looking")} />;
  return (
    <section class="set imports">
      <p class="small sub import-lede">{t("imports.lede")}</p>
      <p class="small muted import-where">{t("imports.where")}</p>
      {f.sources.map((r) => (
        <ImportRow key={r.id} r={r} />
      ))}
    </section>
  );
}

/** The offer as it stands now (Past tasks asks whether its section has a line at all). */
export const importOffer = () => IM.frame?.offer;

/** Past tasks' one quiet line: a source is here, nothing was brought in yet. It fades (D453). */
export function ImportOfferLine() {
  const offer = IM.frame?.offer;
  useEffect(() => {
    if (offer) A.send({ t: "import_offer", id: offer.id, action: "seen" });
  }, [offer?.id]);
  if (!offer) return null;
  const words = offer.total === 1 ? t("imports.offer.one") : offer.total ? t("imports.offer", offer.total) : t("imports.offer.none");
  return (
    <div class="past-import-offer" data-source={offer.id}>
      <span class="past-import-offer-words">{words}</span>
      <span class="past-import-offer-acts">
        <Btn kind="text" size="sm" label={t("imports.offer.go")} onClick={() => openImportConsent(offer.id)} />
        <Btn
          kind="text"
          size="sm"
          label={t("imports.offer.no")}
          onClick={() => {
            A.send({ t: "import_offer", id: offer.id, action: "decline" });
            if (IM.frame?.offer) delete IM.frame.offer;
            A.changed();
          }}
        />
      </span>
    </div>
  );
}
