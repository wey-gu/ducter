package i18n

import (
	"regexp"
	"testing"
)

// D434: no counter noun 件 anywhere in the Chinese UI. A count says the
// thing's own noun (个任务, 个待办, 条) or just 个, or no count at all; 件
// stays only inside words where it is not a counter (文件, 邮件, 附件, 条件,
// 软件, 事件, 组件, 插件, 证件…).
var counterJian = regexp.MustCompile(`(^|[^文邮附条软事组插证套收发原硬控取稿])件`)

func TestNoCounterJian(t *testing.T) {
	for key, s := range Tables()[ZH] {
		if counterJian.MatchString(s) {
			t.Errorf("%s: %q counts with 件 (D434)", key, s)
		}
	}
}
