package views

import "testing"

func TestAutospace(t *testing.T) {
	for in, want := range map[string]string{
		"升级tokio到1.41":       "升级 tokio 到 1.41",
		"升级 tokio 到 1.41":    "升级 tokio 到 1.41",  // spaces already there
		"用`checkpoint`的测试":   "用`checkpoint`的测试", // code spans are left alone
		"Plain English text": "Plain English text",
		"hawdb-net 有 3 个测试":  "hawdb⁠-⁠net 有 3 个测试",
	} {
		if got := autospace(in); got != want {
			t.Errorf("autospace(%q) = %q, want %q", in, got, want)
		}
		if back := unautospace(autospace(in)); back != in {
			t.Errorf("unautospace(autospace(%q)) = %q", in, back)
		}
	}
}

func TestHeadline(t *testing.T) {
	for in, want := range map[string][2]string{
		"tokio 1.41 没升成：3 个测试超时。看起来是调度变了。":             {"tokio 1.41 没升成：3 个测试超时。", "看起来是调度变了。"},
		"Rebased; CI is green. The cause was a sleep.": {"Rebased; CI is green.", "The cause was a sleep."},
		"Version 1.41 shipped": {"Version 1.41 shipped", ""},
	} {
		h, r := headline(in)
		if h != want[0] || r != want[1] {
			t.Errorf("headline(%q) = %q, %q", in, h, r)
		}
	}
}

func TestHeadSize(t *testing.T) {
	if headSize("修 CI", 34) != 32 || headSize("Fix CI", 34) != 34 || headSize("设置", 20) != 19 {
		t.Error("zh headings are one step down, Latin ones are not")
	}
	if headTracking("修 CI", 34) != 0 || headTracking("Fix CI", 34) != -0.5 {
		t.Error("Chinese is never tightened")
	}
}
