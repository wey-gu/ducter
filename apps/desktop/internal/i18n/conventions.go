package i18n

// D573: the standard Mac menu bar's own words (File, Edit › Find, View's
// Back, Forward and zoom, Help's keys), in the words macOS itself uses in
// each language, so the menus read as every other Mac app's.

var zhConventions = Table{
	"menu.file":         "文件",
	"menu.edit":         "编辑",
	"menu.close":        "关闭窗口",
	"menu.find":         "查找",
	"menu.find.find":    "查找…",
	"menu.find.next":    "查找下一个",
	"menu.find.prev":    "查找上一个",
	"menu.view.back":    "后退",
	"menu.view.forward": "前进",
	"menu.zoom.reset":   "实际大小",
	"menu.zoom.in":      "放大",
	"menu.zoom.out":     "缩小",
	"menu.help.keys":    "键盘快捷键",
	"menu.speech":       "语音",
	"menu.view.apps":    "你的小应用",
	"menu.float":        "小窗",
	"menu.fullscreen":   "进入全屏幕",
	"menu.fullscreen.x": "退出全屏幕",
}

var enConventions = Table{
	"menu.file":         "File",
	"menu.edit":         "Edit",
	"menu.close":        "Close Window",
	"menu.find":         "Find",
	"menu.find.find":    "Find…",
	"menu.find.next":    "Find Next",
	"menu.find.prev":    "Find Previous",
	"menu.view.back":    "Back",
	"menu.view.forward": "Forward",
	"menu.zoom.reset":   "Actual Size",
	"menu.zoom.in":      "Zoom In",
	"menu.zoom.out":     "Zoom Out",
	"menu.help.keys":    "Keyboard Shortcuts",
	"menu.speech":       "Speech",
	"menu.view.apps":    "Your Apps",
	"menu.float":        "Mini Window",
	"menu.fullscreen":   "Enter Full Screen",
	"menu.fullscreen.x": "Exit Full Screen",
}

func init() {
	for k, v := range zhConventions {
		zh[k] = v
	}
	for k, v := range enConventions {
		en[k] = v
	}
}
