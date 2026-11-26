// 添加文件夹 / Add a folder (D455), from Tasks's project column: one sheet, the computer first
// (the home, each reachable computer that does its tasks; the one the latest work was on already
// chosen), then the folder there: chosen in that computer's own folders, listed by that computer
// through Ducter (the browser can't reach a disk, so every computer is looked through the same
// way), cloned there from a Git address, or new. The ways are the New task card's own panels.
// D457: each computer is its own small clay (its drawn device, its name, its state), home first;
// the ways are one segmented track; the browser is an instrument (breadcrumb, keys); the button
// says what will happen, on which computer.
import { useEffect } from "preact/hooks";
import type { DeviceView } from "@ducter/protocol";
import { A } from "./app.ts";
import { Seg } from "./controls.tsx";
import { CloneField, FolderBrowser, NewFolderField } from "./newtask.tsx";
import { SheetFrame } from "./sheet-frame.tsx";
import { useSheetMotion } from "./sheetmotion.ts";
import { GhSignIn } from "./gh-signin.tsx";
import { deviceArt } from "./devcard.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const WAYS = ["choose", "clone", "new"] as const;

/** A computer's one state word in the sheet: the home says Ducter runs there; the others awake or asleep. */
export function afStateWord(d: DeviceView): string {
  if (d.home) return t("addfolder.dev.home", A.S.personaName || "Ducter");
  return t(d.state === "asleep" ? "device.state.asleep" : "device.state.awake");
}

/** D457: the computers a folder can go on, home first, then as the home lists them. */
export function afOrder(cs: DeviceView[]): DeviceView[] {
  return [...cs.filter((c) => c.home), ...cs.filter((c) => !c.home)];
}

function DeviceTile({ d, on }: { d: DeviceView; on: boolean }) {
  return (
    <button class={`adf-dev${on ? " on" : ""}`} role="radio" aria-checked={on} aria-label={`${d.name}, ${afStateWord(d)}`} onClick={() => !on && A.afPick(d.id)}>
      <img class="adf-dev-art" src={deviceArt(d)} alt="" aria-hidden="true" draggable={false} />
      <span class="adf-dev-t">
        <b>{d.name}</b>
        <small>{afStateWord(d)}</small>
      </span>
    </button>
  );
}

export function AddFolderSheet() {
  const { sheet, body, scrim, close } = useSheetMotion(() => A.closeAddFolder());
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const nt = A.nt;
  const ok = afOrder(A.ntBrowsable());
  const old = A.ntBrowsable(true);
  const d = A.addf.device;
  // D472: opened from a task that couldn't start: the folder chosen here is where it starts.
  const forTask = A.addf.forTask ? A.S.tasks.get(A.addf.forTask) : undefined;
  const head = forTask ? t("cant.pick.title") : t("addfolder.title");
  return (
    <SheetFrame label={head} class="newtask addfolder" frame={sheet} body={body} scrim={scrim} onScrim={close}>
      <h2>{head}</h2>
      {forTask && <p class="adf-for">{t("cant.pick.sub", forTask.card?.title ?? "")}</p>}
      {ok.length + old.length > 1 && (
        <div class="adf-computers">
          <small class="adf-h">{t("addfolder.computer")}</small>
          <div class="adf-devs" role="radiogroup" aria-label={t("addfolder.computer")}>
            {ok.map((c) => (
              <DeviceTile key={c.id} d={c} on={c.id === d} />
            ))}
          </div>
          {old.map((c) => (
            <div key={c.id} class="nt-empty small sub">
              {t("newtask.old", c.name)}
            </div>
          ))}
        </div>
      )}
      <div class="adf-ways">
        <Seg label={t("addfolder.title")} value={A.addf.way} options={WAYS.map((w) => ({ v: w, label: t(`addfolder.way.${w}`) }))} onPick={(w) => A.afWay(w)} />
      </div>
      <div class="af-body">
        {nt.list === "gh" && nt.ghPanel ? <GhSignIn which="nt" /> : nt.list === "newfolder" && nt.newFolder ? <NewFolderField /> : nt.list === "clone" && nt.clone ? <CloneField /> : nt.browse ? <FolderBrowser /> : null}
        {nt.err && <div class="nt-err" role="status">{nt.err}</div>}
      </div>
    </SheetFrame>
  );
}
