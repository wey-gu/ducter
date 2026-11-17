// D272/D345: 在 {computer} 上登录 GitHub / Sign in to GitHub on {computer}, one panel for both places
// that ask for it: New task's clone (any computer) and Settings › 待办来源's 连上 GitHub (the home).
// That computer's gh runs GitHub's device flow: the link opens on this device and the code is
// copied; it waits until the person approves it on GitHub. No gh on the home: one tap puts it
// there (said first: how and where), with its progress, and the sign-in goes on by itself. Every
// failure says why in one sentence with one next step; the fallback is a token pasted here (a link
// makes one on GitHub with its permissions filled in), sent once to that computer's gh, never kept.
import { TOKEN_NEW_URL } from "@ducter/protocol";
import { A, tilde, type GhWhich } from "./app.ts";
import { Btn } from "./controls.tsx";
import { coarse } from "./views.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

export function GhSignIn({ which, inline }: { which: GhWhich; inline?: boolean }) {
  const g = A.ghp(which);
  if (!g) return null;
  const name = which === "todos" ? (A.homeName ?? "") : A.ntComputerName(g.device);
  const url = g.url ?? "https://github.com/login/device";
  const offer = g.nogh && g.install && !g.installing && !g.err;
  // 再试一次 tries what failed again: the install (no gh yet), else the sign-in.
  const again = () => (g.via === "install" && g.reason !== "expired" && g.reason !== "denied" && g.reason !== "bad_token" ? A.ntGhInstall(which) : A.ntGhStart(g.device, which));
  return (
    <div class={`nt-list nt-browse nt-gh${inline ? " gh-in" : ""}`} role="group" aria-label={t("newtask.gh.title", name)}>
      {!inline && (
        <div class="nt-browse-head">
          <small>{t("newtask.gh.title", name)}</small>
        </div>
      )}
      {g.token ? (
        <>
          <a class="nt-gh-make" href={TOKEN_NEW_URL} target="_blank" rel="noreferrer">
            {t("newtask.gh.key.make")}
          </a>
          <input
            class="nt-field nt-token"
            type="password"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            aria-label={t("newtask.gh.key")}
            placeholder="github_pat_… / ghp_…"
            value={g.tokenText ?? ""}
            disabled={g.sending}
            ref={(el) => void (el && !g.tokenText && !coarse() && el.focus())}
            onInput={(e) => A.ntGhTokenInput((e.target as HTMLInputElement).value, which)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), A.ntGhTokenGo(which))}
          />
          <div class="nt-empty small sub">{t("newtask.gh.key.line", name)}</div>
        </>
      ) : g.installing ? (
        <div class="nt-gh-installing" role="status">
          <div class="nt-empty small sub nt-cloning">
            <span class="spin" aria-hidden="true" />
            {g.installing.how === "brew" ? t("newtask.gh.installing.brew") : t("newtask.gh.installing", g.installing.progress ?? 0)}
          </div>
          {g.installing.how === "release" && (
            <div class="nt-gh-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(4, g.installing.progress ?? 0)}%` }} />
            </div>
          )}
        </div>
      ) : offer ? (
        <div class="nt-empty small sub">{g.install!.how === "brew" ? t("newtask.gh.install.brew", name) : t("newtask.gh.install.release", name, tilde(g.install!.where))}</div>
      ) : g.code ? (
        <>
          <div class="nt-gh-step">
            <span class="nt-gh-n">1</span>
            <span class="nt-gh-what">
              <small>{t("newtask.gh.step1")}</small>
              <code class="nt-gh-url">{url.replace(/^https:\/\//, "")}</code>
            </span>
            <Btn kind="secondary" size="sm" label={t("newtask.gh.open")} onClick={() => A.ntGhOpen(which)} />
          </div>
          <div class="nt-gh-step">
            <span class="nt-gh-n">2</span>
            <span class="nt-gh-what">
              <small>{t("newtask.gh.step2")}</small>
              <code class="nt-gh-code">{g.code}</code>
            </span>
            <Btn kind="secondary" size="sm" label={g.copied ? t("newtask.gh.copied") : t("newtask.gh.copy")} onClick={() => void A.ntGhCopy(which)} />
          </div>
          <div class="nt-empty small sub nt-cloning" role="status">
            <span class="spin" aria-hidden="true" />
            {t("newtask.gh.waiting")}
          </div>
        </>
      ) : (
        !g.err && (
          <div class="nt-empty small sub nt-cloning" role="status">
            <span class="spin" aria-hidden="true" />
            {t("newtask.gh.starting")}
          </div>
        )
      )}
      {g.err && (
        <div class={`nt-empty small ${g.nogh ? "sub" : "nt-err-line"}`} role="status">
          {g.err}
        </div>
      )}
      {/* While gh is being put there nothing can be stopped or chosen: no foot. */}
      {!g.installing && (
      <div class="nt-browse-foot">
        {g.token ? (
          <>
            <Btn kind="text" size="sm" label={t("newtask.find.back")} onClick={() => A.ntGhTokenMode(false, which)} />
            <span class="nt-grow" />
            <Btn kind="primary" size="sm" label={t("newtask.gh.key.go")} disabled={!(g.tokenText ?? "").trim() || g.sending} onClick={() => A.ntGhTokenGo(which)} />
          </>
        ) : (
          <>
            <Btn kind="text" size="sm" label={t("newtask.gh.key")} onClick={() => A.ntGhTokenMode(true, which)} />
            <span class="nt-grow" />
            <Btn kind="text" size="sm" label={t("newtask.gh.cancel")} onClick={() => A.ntGhCancel(which)} />
            {offer && <Btn kind="primary" size="sm" label={t("newtask.gh.install.go")} onClick={() => A.ntGhInstall(which)} />}
            {g.err && <Btn kind="primary" size="sm" label={g.nogh ? t("newtask.gh.recheck") : t("newtask.gh.again")} onClick={again} />}
          </>
        )}
      </div>
      )}
    </div>
  );
}
