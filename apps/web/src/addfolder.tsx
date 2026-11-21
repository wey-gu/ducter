// 添加文件夹 / Add a folder (D455), from On hand's project column: one sheet, the computer first
// (the home, each reachable computer that does its tasks; the one the latest work was on already
// chosen), then the folder there: chosen in that computer's own folders, listed by that computer
// through Ducter (the browser can't reach a disk, so every computer is looked through the same
// way), cloned there from a Git address, or new. The ways are the New task card's own panels.
import { useEffect } from "preact/hooks";
import { A } from "./app.ts";
import { Choice } from "./controls.tsx";
import { CloneField, FolderBrowser, NewFolderField } from "./newtask.tsx";
import { SheetFrame } from "./sheet-frame.tsx";
import { useSheetMotion } from "./sheetmotion.ts";
import { GhSignIn } from "./gh-signin.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const WAYS = ["choose", "clone", "new"] as const;

export function AddFolderSheet() {
  const { sheet, body, scrim, close } = useSheetMotion(() => A.closeAddFolder());
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const nt = A.nt;
  const ok = A.ntBrowsable();
  const old = A.ntBrowsable(true);
  const d = A.addf.device;
  return (
    <SheetFrame label={t("addfolder.title")} class="newtask addfolder" frame={sheet} body={body} scrim={scrim} onScrim={close}>
      <h2>{t("addfolder.title")}</h2>
      {ok.length + old.length > 1 && (
        <div class="nt-chips af-computers">
          <small>{t("addfolder.computer")}</small>
          <div class="nt-chip-row" role="radiogroup" aria-label={t("addfolder.computer")}>
            {ok.map((c) => (
              <Choice key={c.id} label={c.name} on={c.id === d} onClick={() => A.afPick(c.id)}>
                {c.name}
              </Choice>
            ))}
          </div>
          {old.map((c) => (
            <div key={c.id} class="nt-empty small sub">
              {t("newtask.old", c.name)}
            </div>
          ))}
        </div>
      )}
      <div class="nt-chip-row af-ways" role="radiogroup" aria-label={t("addfolder.title")}>
        {WAYS.map((w) => (
          <Choice key={w} label={t(`addfolder.way.${w}`)} on={A.addf.way === w} onClick={() => A.afWay(w)}>
            {t(`addfolder.way.${w}`)}
          </Choice>
        ))}
      </div>
      <div class="af-body">
        {nt.list === "gh" && nt.ghPanel ? <GhSignIn which="nt" /> : nt.list === "newfolder" && nt.newFolder ? <NewFolderField /> : nt.list === "clone" && nt.clone ? <CloneField /> : nt.browse ? <FolderBrowser /> : null}
        {nt.err && <div class="nt-err" role="status">{nt.err}</div>}
      </div>
    </SheetFrame>
  );
}
