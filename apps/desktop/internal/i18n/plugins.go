package i18n

// D673 (research/248 phase 1): 插件 / Plugins and 外观 / Looks. The same keys and words as
// the web client (apps/web/src/i18n-plugins.ts); the consent card's two lines are the host's own.

var zhPlugins = Table{
	"settings.tab.plugins":      "插件",
	"settings.list.plugins":     "别人做的外观和页面，装在这里",
	"plugins.lede":              "插件给 Ducter 添上别人做的东西：一套外观、一个页面、一个来源。它们只能在你允许的范围内做事。",
	"plugins.theme.group":       "外观",
	"settings.look.themes":      "外观",
	"settings.look.themes.note": "一套外观只是颜色、圆角和手感；它不读你的任何东西。",
	"settings.look.back":        "换回 Pebble",
	"settings.look.back.note":   "Ducter 自带的外观。",
	"say.plugins.none":          "还没装别人做的外观；现在是 Ducter 自带的 Pebble。",
	"say.plugins.one":           "装了 1 套别人做的外观；现在用的是 %s。",
	"say.plugins.n":             "装了 %s 套别人做的外观；现在用的是 %s。",
	"plugins.none":              "别人做的外观装好以后会在这里，换上之前先问你。",
	"plugins.how":               "怎么装",
	"theme.active":              "正在用",
	"theme.use":                 "用它",
	"theme.install":             "装上",
	"theme.notnow":              "先不",
	"theme.remove":              "删掉这个主题",
	"theme.author":              "%s 做的",
	"theme.reviewed":            "Ducter 查过这个版本。",
	"theme.unreviewed":          "没有人替你检查过。",
	"theme.consent.look":        "它会换掉 Ducter 的颜色、字体、圆角和手感。",
	"theme.consent.layout":      "它不会改每一页怎么排，也不会读你的任何东西。",
	"theme.consent.made":        "%s 做的，不是 Ducter。",
	"theme.broken":              "这套外观读不出来。",
	"theme.needsNewer":          "它需要更新的 Ducter。",
	"theme.contrast":            "它的对比度不够，不能装。",
}

var enPlugins = Table{
	"settings.tab.plugins":      "Plugins",
	"settings.list.plugins":     "Looks and pages other people made, installed here",
	"plugins.lede":              "Plugins add things other people made to Ducter: a look, a page, a source. They can only do what you allow.",
	"plugins.theme.group":       "Looks",
	"settings.look.themes":      "Looks",
	"settings.look.themes.note": "A look is only colours, corners and feel; it reads nothing of yours.",
	"settings.look.back":        "Back to Pebble",
	"settings.look.back.note":   "The look Ducter ships.",
	"say.plugins.none":          "No looks from other people yet; you're on Pebble, the one Ducter ships.",
	"say.plugins.one":           "1 look from someone else is installed; you're using %s.",
	"say.plugins.n":             "%s looks from other people are installed; you're using %s.",
	"plugins.none":              "Looks other people made show up here once added, and ask you before they change anything.",
	"plugins.how":               "How to add one",
	"theme.active":              "In use",
	"theme.use":                 "Use it",
	"theme.install":             "Install",
	"theme.notnow":              "Not now",
	"theme.remove":              "Remove this theme",
	"theme.author":              "Made by %s",
	"theme.reviewed":            "Ducter checked this version.",
	"theme.unreviewed":          "Nobody has checked it for you.",
	"theme.consent.look":        "It changes Ducter's colours, type, corners and feel.",
	"theme.consent.layout":      "It doesn't change how a page is arranged, or read anything of yours.",
	"theme.consent.made":        "Made by %s, not Ducter.",
	"theme.broken":              "This look can't be read.",
	"theme.needsNewer":          "It needs a newer Ducter.",
	"theme.contrast":            "Its contrast is too low to install.",
}

func init() {
	for k, v := range zhPlugins {
		zh[k] = v
	}
	for k, v := range enPlugins {
		en[k] = v
	}
}
