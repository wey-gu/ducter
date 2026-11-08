//go:build darwin

package local

import (
	"sync"

	"github.com/ebitengine/purego"
	"github.com/ebitengine/purego/objc"
)

var loadSM = sync.OnceValue(func() bool {
	_, err := purego.Dlopen("/System/Library/Frameworks/ServiceManagement.framework/ServiceManagement", purego.RTLD_GLOBAL|purego.RTLD_NOW)
	return err == nil && objc.GetClass("SMAppService") != 0
})

// backgroundStatus asks macOS (SMAppService, macOS 13+) whether the
// LaunchAgent at plist may run: what System Settings › General › Login
// Items › "Allow in the Background" says for it.
func backgroundStatus(plist string) BackgroundStatus {
	if !loadSM() {
		return BackgroundUnknown
	}
	str := objc.ID(objc.GetClass("NSString")).Send(objc.RegisterName("stringWithUTF8String:"), plist+"\x00")
	url := objc.ID(objc.GetClass("NSURL")).Send(objc.RegisterName("fileURLWithPath:"), str)
	if url == 0 {
		return BackgroundUnknown
	}
	n := objc.Send[int](objc.ID(objc.GetClass("SMAppService")), objc.RegisterName("statusForLegacyURL:"), url)
	switch n {
	case 0:
		return BackgroundNotRegistered
	case 1:
		return BackgroundAllowed
	case 2:
		return BackgroundNeedsApproval
	case 3:
		return BackgroundNotFound
	}
	return BackgroundUnknown
}
