// D410: 你的小应用 / Your apps (design/apps.md). The place the person's apps live: a shelf of clay
// tiles (each its mark and tint, its name, the one line it says of itself, when it changed, which
// routine keeps it current), pinned first; a tap opens it; its 「⋯」 renames, changes by talking,
// undoes a change, pins, stops a routine, deletes (asked first, 撤销 after). While there are none,
// a warm empty shelf with what the person could say, drawn from what the home knows. A phone gets
// the whole screen. Facts are separate elements (D291), never joined.
import { useState } from "preact/hooks";
import type { AppMeta } from "@ducter/protocol";
import { A } from "./app.ts";
import { stamp } from "./format.ts";
import { AP, AppFace, AppMenu, StateLine, openApp, shelfOrder, stateAction } from "./apps.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

function close() {
  A.sheet = null;
  A.changed();
}

/** One app on the shelf: tap to open; its 「⋯」 beside it. */
function Tile({ m }: { m: AppMeta }) {
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState<string | undefined>(undefined);
  // D422: the headline is what the app says of itself (its total, what's left), big; under it its state.
  const act = stateAction(m);
  const save = () => {
    const v = (name ?? "").trim();
    if (v && v !== m.name) A.send({ t: "app_set", id: m.id, name: v });
    setName(undefined);
  };
  return (
    <li class={`shelf-tile${m.pinned ? " pinned" : ""}${menu ? " menu-open" : ""}${act ? " has-act" : ""}`}>
      {name !== undefined ? (
        <div class="shelf-open renaming">
          <AppFace m={m} size={56} />
          <input
            class="app-rename"
            value={name}
            aria-label={t("apps.m.rename")}
            ref={(el) => void (el && document.activeElement !== el && (el.focus(), el.select()))}
            onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Escape") return e.stopPropagation(), setName(undefined);
              if (e.key === "Enter" && !e.isComposing) save();
            }}
          />
        </div>
      ) : (
        <button type="button" class="shelf-open" onClick={() => openApp(m.id)} aria-label={m.name}>
          <AppFace m={m} size={56} />
          <span class="shelf-words">
            <span class="shelf-name">{m.name}</span>
            {m.summary ? <span class="shelf-head">{m.summary}</span> : !m.opened && <span class="shelf-line">{t("apps.never")}</span>}
            <span class="shelf-meta">
              {m.pinned && <span class="shelf-pin">{t("apps.pinned")}</span>}
              <StateLine m={m} />
            </span>
          </span>
        </button>
      )}
      {act && name === undefined && (
        <button type="button" class="btn sm secondary shelf-act" onClick={act.run}>
          <span class="lbl">{act.label}</span>
        </button>
      )}
      <button type="button" class={`more-btn shelf-more${menu ? " open" : ""}`} aria-label={t("apps.more", m.name)} aria-expanded={menu} onClick={() => setMenu(!menu)}>
        ⋯
      </button>
      {menu && <AppMenu m={m} close={() => setMenu(false)} rename={() => setName(m.name)} />}
    </li>
  );
}

/** While there are none: what the shelf is for, and a few things to say (a tap says it). */
function Empty() {
  const partner = A.defaultName() || "Ducter";
  // The home's words in both languages, read through the UI's own (D292: no inline branch).
  const w = (x: { zh: string; en: string }) => (x as Record<string, string>)[A.L.lang.slice(0, 2)] || x.en;
  const say = (text: string) => {
    A.send({ t: "send", text, clientId: `p${Date.now().toString(36)}idea` });
    close();
    A.go({ name: "conv" });
  };
  return (
    <div class="shelf-empty">
      <div class="shelf-ghosts" aria-hidden="true">
        <span class="app-face tinted tint-sand ghost" />
        <span class="app-face tinted tint-sage ghost" />
        <span class="app-face tinted tint-mist ghost" />
      </div>
      <h3>{t("apps.empty.h", partner)}</h3>
      <p>{t("apps.empty.body")}</p>
      {AP.ideas.length > 0 && (
        <>
          <div class="shelf-try">{t("apps.empty.try")}</div>
          <ul class="shelf-ideas">
            {AP.ideas.map((i) => (
              <li key={i.say.en}>
                <button type="button" class="shelf-idea" onClick={() => say(w(i.say))}>
                  <AppFace m={{ id: i.say.en, icon: i.icon }} size={34} />
                  <span class="shelf-idea-words">
                    <span class="shelf-idea-say">{w(i.say)}</span>
                    {i.why && <span class="shelf-idea-why">{w(i.why)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The shelf's sheet (the whole screen on a phone). */
export function AppsShelf() {
  const list = shelfOrder(AP.list);
  const partner = A.defaultName() || "Ducter";
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault(), e.stopPropagation();
    close();
  };
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="past-sheet apps-shelf" role="dialog" aria-modal="true" aria-label={t("apps.title")} onKeyDown={keys}>
        <div class="past-head shelf-head">
          <h2>{t("apps.title")}</h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        {list.length > 0 && <p class="shelf-sub">{t("apps.sub", partner)}</p>}
        <div class="shelf-body">
          {list.length ? (
            <ul class="shelf-grid">
              {list.map((m) => (
                <Tile key={m.id} m={m} />
              ))}
            </ul>
          ) : AP.seen ? (
            <Empty />
          ) : (
            <p class="past-none">{t("app.opening")}</p>
          )}
        </div>
      </div>
    </>
  );
}

/** D410: pinned apps, at the top of the conversation beside D381's pins: one tap opens each. */
export function PinnedApps() {
  const pins = A.showsDefault() ? shelfOrder(AP.list).filter((m) => m.pinned) : [];
  if (!pins.length) return null;
  return (
    <div class="pin-apps" role="list">
      {pins.slice(0, 4).map((m) => (
        <button type="button" role="listitem" key={m.id} class="pin-app" aria-label={t("board.open", m.name)} onClick={() => openApp(m.id)}>
          <AppFace m={m} size={22} />
          <span class="pin-app-name">{m.name}</span>
          {m.summary && <span class="pin-app-line">{m.summary}</span>}
        </button>
      ))}
    </div>
  );
}
