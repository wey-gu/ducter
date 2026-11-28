package protocol

import "encoding/json"

// D655 (research/246 §3.10, §3.11): Settings › 导入 / Import and Past tasks' one line.
// The same frames as packages/protocol/src/imports.ts. One source (Lody) read through the
// person's own signed-in `lody` command; the consent card once; the offer once per computer; a
// removal that hides what the source brought in, never deleting it.

// ImportLast is the source's last run, for the one quiet line where it started.
type ImportLast struct {
	At      string `json:"at"`
	Threads int    `json:"threads"`
	Oldest  string `json:"oldest,omitempty"`
	Skipped int    `json:"skipped"`
	Stopped bool   `json:"stopped,omitempty"`
}

// ImportSourceRow is one source's row in Settings › Import. State: looking | ready | signed_out |
// needs_authorization | missing | failed. Problem: no_lody | signed_out | needs_authorization |
// failed (the row's words, never the CLI's).
type ImportSourceRow struct {
	ID          string      `json:"id"`
	App         string      `json:"app"`
	State       string      `json:"state"`
	Problem     string      `json:"problem,omitempty"`
	Waiting     []string    `json:"waiting,omitempty"`
	Total       *int        `json:"total,omitempty"`
	Imported    int         `json:"imported"`
	ImportedDay string      `json:"importedDay,omitempty"`
	Fresh       *int        `json:"fresh,omitempty"`
	Oldest      string      `json:"oldest,omitempty"`
	Consented   bool        `json:"consented"`
	Last        *ImportLast `json:"last,omitempty"`
	Running     bool        `json:"running,omitempty"`
}

// ImportOffer is Past tasks' one quiet line: a source is here and nothing came in yet.
type ImportOffer struct {
	ID    string `json:"id"`
	App   string `json:"app"`
	Total *int   `json:"total,omitempty"`
}

// ImportsFrame is what an imports or import_answer frame carried, decoded on its own.
type ImportsFrame struct {
	// imports
	Sources []ImportSourceRow `json:"sources"`
	Offer   *ImportOffer      `json:"offer,omitempty"`
	// import_answer
	Op       string `json:"op"`
	OK       bool   `json:"ok"`
	ID       string `json:"id"`
	Threads  int    `json:"threads,omitempty"`
	Messages int    `json:"messages,omitempty"`
	Skipped  int    `json:"skipped,omitempty"`
	Removed  int    `json:"removed,omitempty"`
	Stopped  bool   `json:"stopped,omitempty"`
	Error    string `json:"error,omitempty"`
}

// ImportsReq subscribes to Settings › 导入 / Import and Past tasks' offer.
type ImportsReq struct {
	T string `json:"t"` // "imports"
}

// ImportConsentReq is the consent card's 带进来 / Bring them in: keep the consent, then run.
type ImportConsentReq struct {
	T  string `json:"t"` // "import_consent"
	ID string `json:"id"`
}

// ImportRunReq is 再带一次 / Bring in again.
type ImportRunReq struct {
	T  string `json:"t"` // "import_run"
	ID string `json:"id"`
}

// ImportRemoveReq is 删掉这个来源 / Remove this source: hide what it brought in.
type ImportRemoveReq struct {
	T  string `json:"t"` // "import_remove"
	ID string `json:"id"`
}

// ImportOfferReq answers Past tasks' one line: seen (it fades), decline (先不) or begin (the
// consent card, then the run).
type ImportOfferReq struct {
	T      string `json:"t"` // "import_offer"
	ID     string `json:"id"`
	Action string `json:"action"`
}

// decodeImports reads the imports and import_answer frames on their own.
func decodeImports(data []byte, f ServerFrame) (ServerFrame, error) {
	var raw ImportsFrame
	if err := json.Unmarshal(data, &raw); err != nil {
		return f, err
	}
	f.Imports = &raw
	return f, nil
}
