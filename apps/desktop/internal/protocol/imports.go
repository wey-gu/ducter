package protocol

import "encoding/json"

// D655/D668/D670 (research/246 §3.10, §3.11): Settings › 导入 / Import.
// The same frames as packages/protocol/src/imports.ts. Readers come from plugin repositories: the
// official one and the ones the person adds. The consent card once per read list; a removal that
// hides what the source brought in, never deleting it.

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
// failed, or a plugin's needs_newer | sandbox_unavailable | hash_mismatch | broken | plugin_failed
// (the row's words, never the CLI's).
type ImportSourceRow struct {
	ID          string      `json:"id"`
	App         string      `json:"app"`
	Kind        string      `json:"kind,omitempty"` // builtin | plugin
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
	// D668: an added source's own facts, each shown as its own element on the row's one meta line.
	Added bool `json:"added,omitempty"`
	// Repo is the repository or folder it came from; the full URL is the tooltip and the ⋯ menu.
	Repo string `json:"repo,omitempty"`
	// D670: Official says it came from Ducter's official repository (the row says 官方仓库, never its URL).
	Official bool `json:"official,omitempty"`
	// D670: SourceName is the repository's short name (owner/repo, or a folder name); Repo is the tooltip.
	SourceName string        `json:"sourceName,omitempty"`
	Author     string        `json:"author,omitempty"`
	Reads      []string      `json:"reads,omitempty"`
	Reviewed   bool          `json:"reviewed,omitempty"`
	Unreviewed bool          `json:"unreviewed,omitempty"`
	Update     *ImportUpdate `json:"update,omitempty"`
	// D670: the app's own icon (a data URL), its declared commands, and going online.
	Icon               string      `json:"icon,omitempty"`
	Uses               []ImportUse `json:"uses,omitempty"`
	Online             bool        `json:"online,omitempty"`
	NeedsOnlineConsent bool        `json:"needsOnlineConsent,omitempty"`
}

// ImportUse is one command a reader starts, with the literal words its consent card shows.
type ImportUse struct {
	Command string    `json:"command"`
	Online  bool      `json:"online,omitempty"`
	Why     ImportWhy `json:"why"`
}

// ImportWhy is the manifest's own sentence, in both languages.
type ImportWhy struct {
	En string `json:"en"`
	Zh string `json:"zh,omitempty"`
}

// ImportRepository is a plugin repository Ducter knows (the official one, or one the person added).
type ImportRepository struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Official bool   `json:"official,omitempty"`
	State    string `json:"state"`
	Problem  string `json:"problem,omitempty"`
	Plugins  *int   `json:"plugins,omitempty"`
}

// ImportAvailable is one plugin a repository lists and the person can bring in.
type ImportAvailable struct {
	ID         string      `json:"id"`
	App        string      `json:"app"`
	Name       string      `json:"name"`
	Version    string      `json:"version"`
	Commit     string      `json:"commit"`
	Hash       string      `json:"hash"`
	Source     string      `json:"source"`
	SourceURL  string      `json:"sourceUrl"`
	SourceName string      `json:"sourceName,omitempty"`
	Official   bool        `json:"official,omitempty"`
	Reads      []string    `json:"reads,omitempty"`
	Uses       []ImportUse `json:"uses,omitempty"`
	Online     bool        `json:"online,omitempty"`
	Detected   bool        `json:"detected,omitempty"`
	Reviewed   bool        `json:"reviewed,omitempty"`
	Icon       string      `json:"icon,omitempty"`
}

// ImportUpdate is a newer pinned commit or content for an added source.
type ImportUpdate struct {
	Version string `json:"version,omitempty"`
	Commit  string `json:"commit,omitempty"`
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
	// D670: the repositories and the quiet Available list under the installed rows.
	Repositories []ImportRepository `json:"repositories,omitempty"`
	Available    []ImportAvailable  `json:"available,omitempty"`
	Offer        *ImportOffer       `json:"offer,omitempty"`
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
	// D668: the update widened the read list, so the consent card is owed again.
	NeedsConsent bool   `json:"needsConsent,omitempty"`
	Widened      bool   `json:"widened,omitempty"`
	UpToDate     bool   `json:"upToDate,omitempty"`
	Detail       string `json:"detail,omitempty"`
	// D670: source_add names the repository it added.
	SourceID string `json:"sourceId,omitempty"`
	URL      string `json:"url,omitempty"`
}

// ImportsReq subscribes to Settings › 导入 / Import and Past tasks' offer.
type ImportsReq struct {
	T string `json:"t"` // "imports"
}

// ImportConsentReq is the consent card's 带进来 / Bring them in: keep the consent, then run.
// Online is the second, explicit line an unreviewed online reader's card makes them tick.
type ImportConsentReq struct {
	T      string `json:"t"` // "import_consent"
	ID     string `json:"id"`
	Online bool   `json:"online,omitempty"`
}

// ImportSourceAddReq is 加一个插件仓库 / Add a plugin repository.
type ImportSourceAddReq struct {
	T   string `json:"t"` // "import_source_add"
	URL string `json:"url"`
}

// ImportSourceRemoveReq removes a repository the person added.
type ImportSourceRemoveReq struct {
	T  string `json:"t"` // "import_source_remove"
	ID string `json:"id"`
}

// ImportInstallReq is Bring them in on an Available row: install at the index's pin, then the card.
type ImportInstallReq struct {
	T      string `json:"t"` // "import_install"
	Source string `json:"source"`
	ID     string `json:"id"`
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

// ImportUpdateReq is 更新 / Update an added source to its newer pinned commit.
type ImportUpdateReq struct {
	T  string `json:"t"` // "import_update"
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
