# 231. Nowledge Mem Artifacts: what Ducter can keep there, and how (D566)

The author's idea (2026-11-25): when Nowledge Mem is on, let the person keep what Ducter made (a
task's report, a PDF, a table) in Mem's Artifacts, from the file card or as a Settings default.
This report records the real interface, learned **read-only** on this Mac on 2026-11-25 with
`nmem 0.10.123` (the Nowledge Mem app's own copy, against Mem Cloud). Nothing was added, updated,
deleted, moved or made in a folder against the real Mem: the write shapes below come from the
CLI's help and its own strings (the binary read as a file, the way research/226 read 0.10.123),
and the test fake (`packages/partner/eval/fake-artifacts-nmem.ts`) copies them as GUESSES.

Tags: **VERIFIED** (seen in a real answer here), **DOCUMENTED** (help text or Mem's docs),
**INFERRED** (reasoned from strings or shapes; not seen working).

## 1. The commands

- `nmem artifacts` (aliases `artifact`, `library`, `lib`, `l`, `s`, `sources`, the old names kept
  forever) has `list` (default), `add`, `save-attachment`, `show`, `read`, `search`, `delete`,
  `update`, `history`, `move`, `extract`, `search-chunks`, `analyze`, `download`, `folders`.
  DOCUMENTED (`nmem artifacts --help`).
- `add <TARGET>...`: file paths or URLs; `-c/--comment`, `-l/--label` (repeatable), `--space` /
  `--space-id`, `--folder <id or path>` ("Without --space the folder's Space is used. An unknown
  folder is refused before upload"), `--pdf-render-scale`. No `--agent-id` and no source-app flag:
  an artifact records its member (`created_by_member_id`) and, on a version, an agent key
  (`created_by_agent_key_id`), not an AI Identity. DOCUMENTED; the fields VERIFIED in `history`.
- `update <ID> --base <BASE> (--content | --edit OLD=NEW | --edits | --file PATH)`: "Save a new
  version of an artifact, guarded by the version you read"; `--base` is "Refused when a newer
  version exists"; `--file` takes any type, PDFs included; `--space` is a guard ("the artifact
  must be in this Space"). DOCUMENTED.
- `history <ID>`: versions, newest first, `-n` 1–100, `--cursor`. DOCUMENTED; shape VERIFIED (§2).
- `folders` (`ls` default, `mk`, `rename`, `mv`, `rm` = dissolve, documents move up, none
  deleted). `mk <NAME> [--parent] [--id <UUID>]`: "Client-chosen folder id (UUID); repeating the
  same call is then safe". DOCUMENTED.
- `read <ID>`: `--offset`, `--limit` (the server refuses a limit outside 100–50000:
  `limit must be in [100, 50000]`, VERIFIED), `--latest`, `--revision`.
- `nmem resources get nowledgemem://source/<id>` resolves Mem's stable reference for an artifact
  (`canonical_uri`, `kind: "source"`, a front-mattered body). VERIFIED. The Nowledge Mem Mac app
  registers the `nowledgemem` URL scheme (`CFBundleURLSchemes: ["nowledgemem"]` in its
  Info.plist, and the Tauri deep-link plugin in its binary). VERIFIED. That opening
  `nowledgemem://source/<id>` lands on that artifact in the app: INFERRED (not tried; opening it
  at least brings the app forward).
- Mem on the web: `nmem status` says `backend: "cloud"`, `api_url:
  "https://cloud.nowledge.co/remote-api"` (VERIFIED); the web app is `<origin>/app` (the connect
  link's own page, research/141, VERIFIED). A deep link to one artifact on the web: not found.

## 2. The read shapes (VERIFIED, `packages/core/test/fixtures/mem-artifacts.json`)

- `list --json`: `{ sources: [...], total }`. Each item: `id` (`src_` + 12 hex), `source_type`
  (`file` | `url` | `wiki_page`), `original_name`, `mime_type`, `sha256`, `size_bytes`,
  `space_id`, `lifecycle_state` (`parsed`, `extracted`, …), `chunk_count`, `memory_count`,
  `folder_id` (null at the Space root), `document_id` (equal to `id` for a first version),
  `revision`, `latest_revision`, `is_latest`, `superseded_by`, `revision_count`, `label_ids`,
  `metadata` (`{}` on every one of 198), `created_by_member_id`, times.
- On this account (198 artifacts): 132 PDFs, 43 Markdown, 9 HTML, 6 DOCX, 2 XLSX, 2 JSON, 1 PPTX,
  3 octet-stream; 194 `parsed`, 4 `extracted`; none in a folder; none with a second version; the
  largest 17.2 MB. Spaces seen: `default` (185), `all` (8), the personal Space (3), two named.
- `show --json`: `{ source, memories, revisions }`. (The human `show` printed empty fields on this
  CLI: a display bug in 0.10.123, VERIFIED; Ducter reads only `--json`.)
- `history --json`: `{ document_id, latest_revision, revisions: [{ source_id, revision, sha256,
  size_bytes, origin, created_by_member_id, created_by_agent_key_id, created_at }], next_cursor }`.
- `folders ls --json`: `{ folders: [], next_cursor, folder_view: "tree" }` (empty here).
- `read --json`: `{ source_id, original_name, offset, returned_length, total_length, has_more,
  content }`.

## 3. Versions, dedupe, folders (from the CLI's strings: INFERRED unless said)

- A version's origin is one of `upload`, `replace`, `edit`, `restore`, `refetch`, `connector`,
  `ai_now_save`, `import`, `legacy_fold`, `legacy_filename_match`. `update` answers an
  `ArtifactRevisionOutcome` of `created` or `unchanged` with `document_id`, `source_id`,
  `sha256`, `size_bytes`, `created_at` and the revision fields. So the same bytes saved again as a
  version are `unchanged`, not a new version. INFERRED (strings).
- A stale `--base` is refused with "{n} is now current, not {base}; nothing was changed. Re-read
  it (nmem artifacts read … --latest) and retry with its --base." INFERRED (strings; the number's
  place in the sentence read from the format pieces).
- Whether `add` of a file already in Mem (same bytes or same name) makes a second artifact: not
  found in help or strings. `legacy_filename_match` suggests an old fold by name, not today's
  `add`. Treated as **a second artifact** (INFERRED); so Ducter never re-adds a file it saved: it
  keeps the artifact's id and updates it.
- A folder `mk` with an id of the caller's choosing is idempotent (DOCUMENTED). An existing
  top-level folder of the same name in that Space is found with `folders ls` first.

## 4. Limits and parsing

- Parsed (DOCUMENTED, mem.nowledge.co/docs/library): PDF (text, scanned pages by a vision model),
  Word `.docx`, `.pptx`, spreadsheets `.xlsx`/`.csv` (to Markdown tables), Markdown, URLs; plain
  text (`.txt`, `.org`) and code (`.py .js .ts .rs .go .java .c .cpp .rb .swift`) indexed as is.
  Pictures, sound, video, archives: not listed (stored, not read; INFERRED).
- Size: no limit documented or found for `add`. A 17.2 MB PDF is in this account (VERIFIED);
  Ducter's own store caps a shown file at 25 MB (D206), so nothing larger reaches this path.
  Mem's refusal, whatever it is, is said in Mem's words.
- Signed out: Mem answers 401 / "Invalid or missing API key" (the shape research/141 and D563
  read); unreachable: a connection error. Both said from these facts, never guessed.

## 5. Spaces

- An artifact lives in one Space (`space_id`); `add --space` or the folder's Space chooses it.
  Without either, Mem's own default applies (`default` here; INFERRED from where 185 landed).
- Ducter's persona is bound to a Space only when the person's own `NMEM_SPACE` was (D141,
  `persona.mem.space`). D566 passes `--space` exactly then, else nothing: never a guessed Space.

## Implications for Ducter

1. **One artifact per file, a version per change.** Key a saved file by (its task, its name);
   save again with `update --base <rev> --file`. Never `add` twice.
2. **One 「Ducter」 folder** at the root of the persona's Space, found or made with a fixed id.
3. **Offer only what Mem reads** (documents, sheets, slides, PDFs, Markdown, text, code); the
   Settings default keeps only reports and documents.
4. **Say Mem's reason**: signed out, unreachable, or its own words.
5. **Link to it** with Mem's own `nowledgemem://source/<id>` where the Mem app is (the Mac); on
   the web, Mem's Cloud page. Verify that the app's deep link lands on the artifact (todo).
6. **Never trust a guessed shape.** Count a save only once `list` (a VERIFIED shape) shows the
   file; log each write's raw answer so the first real one shows the true shape.
7. **Provenance** rides a label (`ducter`) and a comment naming the task; Mem has no source-app
   field for artifacts.

## Summary

`nmem 0.10.123` gives Ducter everything it needs to keep files in the person's Mem with no
duplicates: `add --folder --space -l -c`, `update --base --file` (versions, `unchanged` for the
same bytes), `history` for the current version, idempotent `folders mk --id`, and a stable
`nowledgemem://source/<id>` the Mem app opens. The read shapes are VERIFIED and kept as fixtures;
the write shapes are inferred from the CLI's strings and stand in a fake until the author's first
real save.
