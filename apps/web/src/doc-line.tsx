// D439: 看过每一页 / Every page checked. What Ducter's page check still found in a document the
// person will send, after the task fixed what it could: its lead in the needs-you ink, then each
// thing on its own line (D291), under the result. Nothing when the pages were clean.
import { A } from "./app.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

export function DocLine({ left }: { left?: string[] }) {
  if (!left?.length) return null;
  return (
    <div class="doc-line" role="note">
      <span class="lead">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 1.8h5.5L12.5 4.8v9.4H4z" />
          <path d="M9.5 1.8v3h3M6 8h4.5M6 10.6h3" />
        </svg>
        {t("doc.lead")}
      </span>
      {left.map((l, i) => (
        <span key={i} class="it" dir="auto">
          {l}
        </span>
      ))}
    </div>
  );
}
