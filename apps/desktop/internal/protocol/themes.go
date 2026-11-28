// research/248 phase 1 (D673): Settings › 外观和声音 / Look and sound's themes.
// The same frames as packages/protocol/src/themes.ts: the installed themes (one token file each),
// the active theme, and the answers to a set, consent or remove.
package protocol

import "encoding/json"

// ThemeName is a theme's own name, both languages.
type ThemeName struct {
	En string `json:"en"`
	Zh string `json:"zh,omitempty"`
}

// ThemeStateColors is a semantic state's mark, surface and ink.
type ThemeStateColors struct {
	Dot     string `json:"dot"`
	Surface string `json:"surface"`
	Ink     string `json:"ink"`
}

// ThemeModeTokens is one paper's colours (the theme.json schema).
type ThemeModeTokens struct {
	Bg              string           `json:"bg"`
	Surface         string           `json:"surface"`
	SurfaceRaised   string           `json:"surfaceRaised"`
	Ink             string           `json:"ink"`
	InkMuted        string           `json:"inkMuted"`
	Accent          string           `json:"accent"`
	OnAccent        string           `json:"onAccent"`
	Line            string           `json:"line"`
	UserBubble      string           `json:"userBubble"`
	OnUserBubble    string           `json:"onUserBubble"`
	PartnerBubble   string           `json:"partnerBubble"`
	OnPartnerBubble string           `json:"onPartnerBubble"`
	Decide          ThemeStateColors `json:"decide"`
	Progress        ThemeStateColors `json:"progress"`
	Wait            ThemeStateColors `json:"wait"`
	Ok              ThemeStateColors `json:"ok"`
	Fail            ThemeStateColors `json:"fail"`
}

// ThemeTokens is both papers of one theme.
type ThemeTokens struct {
	Light ThemeModeTokens `json:"light"`
	Dark  ThemeModeTokens `json:"dark"`
}

// ThemeManifest is the resolved theme.json (missing tokens already fell back to Pebble).
type ThemeManifest struct {
	Name   ThemeName   `json:"name"`
	Tokens ThemeTokens `json:"tokens"`
}

// ThemeRow is one installed theme's row.
type ThemeRow struct {
	ID         string         `json:"id"`
	Name       ThemeName      `json:"name"`
	Author     string         `json:"author,omitempty"`
	Version    string         `json:"version"`
	Consented  bool           `json:"consented"`
	Active     bool           `json:"active"`
	Reviewed   bool           `json:"reviewed"`
	Unreviewed bool           `json:"unreviewed"`
	Problem    string         `json:"problem,omitempty"`
	Detail     string         `json:"detail,omitempty"`
	Theme      *ThemeManifest `json:"theme,omitempty"`
}

// ThemesFrame is what a themes or theme_answer frame carried, decoded on its own.
type ThemesFrame struct {
	Active string     `json:"active"`
	Themes []ThemeRow `json:"themes"`
	// theme_answer
	Op     string `json:"op"`
	OK     bool   `json:"ok"`
	ID     string `json:"id"`
	Error  string `json:"error,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// ThemesReq subscribes to Look and sound's themes.
type ThemesReq struct {
	T string `json:"t"` // "themes"
}

// ThemeSetReq is 换回 Pebble / Back to Pebble or the tap that applies an installed theme.
type ThemeSetReq struct {
	T  string `json:"t"` // "theme_set"
	ID string `json:"id"`
}

// ThemeConsentReq is the consent card's 装上 / Install: consent, then apply.
type ThemeConsentReq struct {
	T  string `json:"t"` // "theme_consent"
	ID string `json:"id"`
}

// ThemeRemoveReq is 删掉这个主题 / Remove this theme.
type ThemeRemoveReq struct {
	T  string `json:"t"` // "theme_remove"
	ID string `json:"id"`
}

// decodeThemes reads the themes and theme_answer frames on their own.
func decodeThemes(data []byte, f ServerFrame) (ServerFrame, error) {
	var raw ThemesFrame
	if err := json.Unmarshal(data, &raw); err != nil {
		return f, err
	}
	f.Themes = &raw
	return f, nil
}
