// D655/D668/D670 (research/246 §3.10, §3.11): Settings › 导入 / Import.
//
// One row per installed reader. Readers come from plugin repositories: Ducter's official one and
// the ones the person adds. Under the rows, a quiet Available list shows what a repository lists
// (its app icon, its app name, from which source), detected apps first; Bring them in installs at
// the index's pinned commit and then shows the same literal consent card. The card names every
// declared read and every command the reader starts, says when it goes online, and makes an
// unreviewed online reader tick a second, explicit line. What comes in lives only in Past tasks,
// read only.
import type { ImportsServerFrame, ImportSourceId, ImportSourceRow, ImportAvailable, ImportRepository, ServerFrame } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { words } from "@ducter/protocol/src/lang.ts";
import { A } from "./app.ts";
import { BrandTile } from "./brand.tsx";
import { Btn, DangerButton, Field, MoreButton, Toggle } from "./controls.tsx";
import { Waiting } from "./set-grid.tsx";
import { Menu, MenuHead, MenuItem, MenuSep } from "./menu.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** What Settings › Import and Past tasks know; the home's frames keep it current. */
export const IM: {
  frame?: Extract<ImportsServerFrame, { t: "imports" }>;
  /** A bring-in in flight (per source), until its answer or the next frame says otherwise. */
  busy: Record<string, boolean>;
  /** An install from an Available row in flight (per plugin). */
  installing: Record<string, boolean>;
  /** An update in flight (per source). */
  updating: Record<string, boolean>;
  /** The consent card open (per source), and the row's read list. */
  consent: Record<string, boolean>;
  read: Record<string, boolean>;
  more: Record<string, boolean>;
  /** 删掉这个来源 asked in place (per source). */
  remove: Record<string, boolean>;
  /** The second, explicit online line ticked (per source). */
  online: Record<string, boolean>;
  /** The last failure's words (per source). */
  err: Record<string, string>;
  /** What the last removal or update did, said under the sources where it happened (D296, D666: never a toast). */
  notice?: string;
  /** What the last repository change did, said under the repositories (D666: never a toast). */
  repoNotice?: string;
  /** An install finished: open its consent card when the installed row arrives. */
  pendingConsent: Record<string, boolean>;
  /** 加一个插件仓库 open, its typed URL, and a repository's in-place removal. */
  addRepo: boolean;
  adding: boolean;
  repoUrl: string;
  removeRepo: Record<string, boolean>;
  /** A consent card opened from Past tasks' offer: the pane shows it as it opens. */
  opening?: ImportSourceId;
} = { busy: {}, installing: {}, updating: {}, consent: {}, read: {}, more: {}, remove: {}, online: {}, err: {}, pendingConsent: {}, addRepo: false, adding: false, repoUrl: "", removeRepo: {} };

function onImportsFrame(f: ImportsServerFrame) {
  if (f.t === "imports") {
    IM.frame = f;
    for (const s of f.sources) {
      if (!s.running) delete IM.busy[s.id];
      if (IM.pendingConsent[s.id]) {
        IM.pendingConsent[s.id] = false;
        IM.consent[s.id] = true;
      }
    }
    // A card opened from the offer: open its consent once the row is there.
    if (IM.opening) {
      IM.consent[IM.opening] = true;
      IM.opening = undefined;
    }
    return A.changed();
  }
  delete IM.busy[f.id];
  delete IM.updating[f.id];
  delete IM.installing[f.id];
  if (f.op === "install") {
    if (f.ok) {
      IM.pendingConsent[f.id] = true;
      delete IM.online[f.id];
      delete IM.err[f.id];
    } else IM.err[f.id] = f.error && A.L.t(`imports.error.${f.error}`) !== `imports.error.${f.error}` ? t(`imports.error.${f.error}`) : t("imports.error.install_failed");
    A.changed();
    return;
  }
  if (f.op === "source_add") {
    IM.adding = false;
    if (f.ok) {
      IM.addRepo = false;
      IM.repoUrl = "";
      IM.repoNotice = t("imports.repo.added");
    } else {
      IM.repoNotice = undefined;
      IM.err["source"] = f.error && A.L.t(`imports.error.${f.error}`) !== `imports.error.${f.error}` ? t(`imports.error.${f.error}`) : t("imports.error.repo_failed");
    }
    A.changed();
    return;
  }
  if (f.op === "source_remove") {
    if (f.ok) {
      delete IM.removeRepo[f.id];
      IM.repoNotice = t("imports.repo.removed");
    } else {
      IM.repoNotice = undefined;
      IM.err["source"] = t("imports.error.repo_failed");
    }
    A.changed();
    return;
  }
  if (f.op === "update") {
    if (f.ok) {
      IM.notice = f.upToDate ? t("imports.update.upToDate") : t("imports.updated");
      // A widened read list puts the consent card back before anything runs.
      if (f.needsConsent) {
        delete IM.online[f.id];
        IM.consent[f.id] = true;
      }
    } else IM.err[f.id] = f.error && A.L.t(`imports.error.${f.error}`) !== `imports.error.${f.error}` ? t(`imports.error.${f.error}`) : t("imports.error.update_failed");
    A.changed();
    return;
  }
  if (f.op === "remove") {
    if (f.ok) {
      IM.notice = t("imports.removed");
      delete IM.err[f.id];
    } else IM.err[f.id] = t("imports.error.failed");
  } else if (!f.ok) {
    IM.err[f.id] = f.error && A.L.t(`imports.error.${f.error}`) !== `imports.error.${f.error}` ? t(`imports.error.${f.error}`) : t("imports.error.failed");
  } else {
    delete IM.err[f.id];
    // A run or a consent that went through is newer than the removal: its line no longer stands.
    IM.notice = undefined;
  }
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

/** An app's icon from its plugin in the shared clay tile; the letter stays the fallback (D622). */
function ImportTile({ app, icon, faded }: { app: string; icon?: string; faded?: boolean }) {
  if (!icon) return <BrandTile name={app} faded={faded} />;
  return (
    <span class={`g-tile mark brand import-tile${faded ? " faded" : ""}`} aria-hidden="true">
      <img class="brand-icon import-icon" src={icon} width={40} height={40} alt="" />
    </span>
  );
}

/** The words a use says in the person's language; the manifest wrote both. */
function whyWords(why: { en: string; zh?: string }): string {
  const tables: { en: string; zh?: string } = { en: why.en };
  if (why.zh) tables.zh = why.zh;
  return words(tables, A.L.lang);
}

/** The consent card's lines, all literal; `go` absent when it is only being read. */
function ReadList({
  go,
  no,
  reads,
  uses,
  needsOnlineConsent,
  ticked,
  onTick,
  added,
  author,
}: {
  go?: () => void;
  no?: () => void;
  reads?: string[];
  uses?: ImportSourceRow["uses"];
  needsOnlineConsent?: boolean;
  ticked?: boolean;
  onTick?: (v: boolean) => void;
  added?: boolean;
  author?: string;
}) {
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
        </>
      ) : null}
      {uses?.length ? (
        <div class="import-uses">
          {uses.map((u, i) => (
            <div key={i} class="import-use">
              <p class="import-use-command">{u.command}</p>
              <p>{whyWords(u.why)}</p>
              {!u.online && <p class="import-use-offline">{t("imports.consent.nonet")}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p>{t("imports.consent.nonet")}</p>
      )}
      <p>{t("imports.consent.past")}</p>
      {needsOnlineConsent && (
        <div class="import-online-ask">
          <Toggle label={t("imports.consent.online.unreviewed")} checked={!!ticked} onChange={(v) => onTick?.(v)} />
        </div>
      )}
      <small>{added ? t("imports.consent.made.plugin", author ?? "") : t("imports.consent.made.official")}</small>
      {go && (!needsOnlineConsent || ticked) && (
        <div class="btns import-consent-go">
          <Btn kind="primary" label={t("imports.consent.go")} onClick={go} />
          <Btn kind="text" label={t("imports.consent.no")} onClick={no!} />
        </div>
      )}
      {go && (!needsOnlineConsent || ticked) && <small class="import-once">{t("imports.consent.once")}</small>}
      {go && needsOnlineConsent && !ticked && (
        <div class="btns import-consent-go">
          <Btn kind="text" label={t("imports.consent.no")} onClick={no!} />
        </div>
      )}
    </div>
  );
}

/** One installed source's row. */
function ImportRow({ r }: { r: ImportSourceRow }) {
  const moreAt = useRef<HTMLSpanElement>(null);
  const more = !!IM.more[r.id];
  const consent = !!IM.consent[r.id];
  const read = !!IM.read[r.id];
  const asking = !!IM.remove[r.id];
  const busy = !!IM.busy[r.id] || !!r.running;
  const updating = !!IM.updating[r.id];
  const err = IM.err[r.id];
  const ticked = !!IM.online[r.id];
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
    A.send({ t: "import_consent", id: r.id, ...(r.online ? { online: true } : {}) });
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
        <ImportTile app={r.app} icon={r.icon} faded={r.state !== "ready"} />
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
                IM.notice = undefined;
                A.send({ t: "import_update", id: r.id });
                A.changed();
              }}
            />
          )}
          {canBring && !consent && !asking && !busy && !updating && (
            <Btn kind={r.imported > 0 ? "secondary" : "primary"} size="sm" label={r.imported > 0 ? t("imports.again") : t("imports.bring")} about={r.app} disabled={busy} onClick={bring} />
          )}
          {r.state !== "ready" && r.state !== "looking" && <Btn kind="secondary" size="sm" label={t("imports.retry")} about={r.app} onClick={() => A.send({ t: "imports" })} />}
          <span class={`import-more${more ? " open" : ""}`} ref={moreAt}>
            <MoreButton label={t("imports.more")} open={more} onClick={() => ((IM.more[r.id] = !more), A.changed())} />
            {more &&
              createPortal(
                <Menu class="pmenu import-menu" label={r.app} anchor={moreAt} onClose={() => ((IM.more[r.id] = false), A.changed())}>
                  {r.repo && (
                    <MenuHead>
                      <span class="import-avail-url">{r.repo}</span>
                    </MenuHead>
                  )}
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
      {(r.repo || r.added || r.unreviewed || r.reviewed) && (
        <div class="import-meta">
          <span class="import-source" title={r.repo}>
            {r.official ? t("imports.avail.official") : r.sourceName}
          </span>
          {r.added && <span class="import-added">{t("imports.added")}</span>}
          {r.unreviewed && <span class="import-unreviewed">{t("imports.unreviewed")}</span>}
          {r.reviewed && <span class="import-reviewed">{t("imports.reviewed")}</span>}
        </div>
      )}
      {r.state === "ready" && !!r.waiting?.length && <p class="small muted import-waiting">{t("imports.waiting", r.waiting.join(t("acct.sep")))}</p>}
      {read && <ReadList reads={r.reads} uses={r.uses} added={r.added} author={r.author} />}
      {consent && (
        <div class="import-consent" role="group" aria-label={t("imports.consent.title")}>
          <ReadList
            reads={r.reads}
            uses={r.uses}
            needsOnlineConsent={r.needsOnlineConsent}
            ticked={ticked}
            onTick={(v) => ((IM.online[r.id] = v), A.changed())}
            added={r.added}
            author={r.author}
            go={yes}
            no={() => ((IM.consent[r.id] = false), A.changed())}
          />
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

/** One Available row: two lines — the app (its version and a detected tag) and its source and
 *  review state. The full URL is the tooltip and the ⋯. */
function AvailableRow({ a }: { a: ImportAvailable }) {
  const moreAt = useRef<HTMLSpanElement>(null);
  const more = !!IM.more[a.id];
  const busy = !!IM.installing[a.id];
  const bring = () => {
    IM.installing[a.id] = true;
    delete IM.err[a.id];
    A.send({ t: "import_install", source: a.source, id: a.id });
    A.changed();
  };
  return (
    <div class="import-avail" data-plugin={a.id}>
      <ImportTile app={a.app} icon={a.icon} />
      <span class="import-avail-main">
        <span class="import-avail-name">
          <b>{a.app}</b>
          <small class="import-avail-version">{t("imports.avail.version", a.version)}</small>
          {a.detected && <span class="ptag import-avail-detected">{t("imports.avail.detected")}</span>}
        </span>
        <span class="import-avail-meta">
          <span class="import-avail-source" title={a.sourceUrl}>
            {a.official ? t("imports.avail.official") : a.sourceName}
          </span>
          <span class={a.reviewed ? "muted" : "import-avail-unreviewed"}>{t(a.reviewed ? "imports.reviewed" : "imports.unreviewed")}</span>
        </span>
      </span>
      <span class="import-avail-acts">
        <Btn kind="secondary" size="sm" label={busy ? t("imports.avail.installing") : t("imports.bring")} about={a.app} busy={busy} disabled={busy} onClick={bring} />
        <span class={`import-more${more ? " open" : ""}`} ref={moreAt}>
          <MoreButton label={t("imports.more")} open={more} onClick={() => ((IM.more[a.id] = !more), A.changed())} />
          {more &&
            createPortal(
              <Menu class="pmenu import-menu" label={a.app} anchor={moreAt} onClose={() => ((IM.more[a.id] = false), A.changed())}>
                <MenuHead>
                  <span class="import-avail-url">{a.sourceUrl}</span>
                </MenuHead>
              </Menu>,
              document.body,
            )}
        </span>
      </span>
      {IM.err[a.id] && <p class="small tone-bad import-avail-err">{IM.err[a.id]}</p>}
    </div>
  );
}

/** 加一个插件仓库: the person's own sources, and the one field that adds another. */
function Repositories() {
  const repos = IM.frame?.repositories ?? [];
  const add = IM.addRepo;
  return (
    <section class="import-repos" aria-label={t("imports.repo.title")}>
      <div class="import-repos-head">
        <span class="grow">
          <b>{t("imports.repo.title")}</b>
          <small class="muted">{t("imports.repo.lede")}</small>
        </span>
        <Btn kind="text" size="sm" label={t(add ? "imports.repo.close" : "imports.repo.add")} onClick={() => ((IM.addRepo = !add), (IM.err["source"] = ""), A.changed())} />
      </div>
      {add && (
        <div class="import-repo-add">
          <Field value={IM.repoUrl} label={t("imports.repo.field")} placeholder="https://github.com/you/your-plugins" onInput={(v) => ((IM.repoUrl = v), A.changed())} onKeyDown={(e) => e.key === "Enter" && IM.repoUrl.trim() && (A.send({ t: "import_source_add", url: IM.repoUrl.trim() }), A.changed())} />
          <div class="btns">
            <Btn
              kind="primary"
              label={t("imports.repo.submit")}
              busy={IM.adding}
              disabled={!IM.repoUrl.trim()}
              onClick={() => {
                IM.adding = true;
                A.send({ t: "import_source_add", url: IM.repoUrl.trim() });
                A.changed();
              }}
            />
          </div>
        </div>
      )}
      {repos.map((r) =>
        r.official ? (
          <div class="import-repo-row import-repo-official" key={r.id}>
            <span class="import-repo-name">{t("imports.repo.official")}</span>
            <span class="import-repo-url">{r.url}</span>
            <span class="import-repo-count">{r.state === "failed" ? t("imports.repo.unread") : r.plugins === undefined ? t("imports.repo.looking") : t(r.plugins === 1 ? "imports.repo.count.one" : "imports.repo.count", r.plugins)}</span>
          </div>
        ) : (
          <div class="import-repo-row" key={r.id}>
            <span class="import-repo-name">{r.url}</span>
            <span class="import-repo-count">{r.state === "failed" ? t("imports.repo.unread") : r.plugins === undefined ? t("imports.repo.looking") : t(r.plugins === 1 ? "imports.repo.count.one" : "imports.repo.count", r.plugins)}</span>
            {IM.removeRepo[r.id] ? (
              <span class="import-repo-ask">
                <small>{t("imports.repo.remove.ask")}</small>
                <Btn kind="text" size="sm" label={t("imports.remove.no")} onClick={() => ((IM.removeRepo[r.id] = false), A.changed())} />
                <DangerButton
                  label={t("imports.remove.yes")}
                  about={r.url}
                  onClick={() => {
                    A.send({ t: "import_source_remove", id: r.id });
                    A.changed();
                  }}
                />
              </span>
            ) : (
              <Btn kind="text" size="sm" label={t("imports.repo.remove")} about={r.url} onClick={() => ((IM.removeRepo[r.id] = true), A.changed())} />
            )}
          </div>
        ),
      )}
      {IM.repoNotice && (
        <p class="small muted import-notice" role="status">
          {IM.repoNotice}
        </p>
      )}
      {IM.err["source"] && <p class="small tone-bad">{IM.err["source"]}</p>}
    </section>
  );
}

/** Settings › 导入 / Import: the lede, installed rows, the quiet Available list, the sources. */
export function ImportSettings() {
  useEffect(() => {
    // A removal's line belongs to the visit it happened in; a later visit starts from what is true now.
    IM.notice = undefined;
    IM.repoNotice = undefined;
    if (A.S.welcomed) A.send({ t: "imports" });
  }, [A.S.welcomed]);
  const f = IM.frame;
  if (!f) return <Waiting text={t("imports.state.looking")} />;
  const available = f.available ?? [];
  return (
    <section class="set imports">
      <p class="small sub import-lede">{t("imports.lede")}</p>
      <p class="small muted import-where">{t("imports.where")}</p>
      {f.sources.map((r) => (
        <ImportRow key={r.id} r={r} />
      ))}
      {IM.notice && (
        <p class="small muted import-notice" role="status">
          {IM.notice}
        </p>
      )}
      {available.length > 0 && (
        <section class="import-available" aria-label={t("imports.avail.title")}>
          <p class="small sub import-avail-title">{t("imports.avail.title")}</p>
          <p class="small muted import-avail-lede">{t("imports.avail.lede")}</p>
          <div class="import-avail-card">
            {available.map((a) => (
              <AvailableRow key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}
      <Repositories />
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
