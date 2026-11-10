// Checks HomeVersion (apps/ios/Ducter/HomeVersion.swift, D200) against the cases the Android
// app's HomeVersionTest also runs. Run by apps/ios/scripts/check-home-version.sh.
import Foundation

var failed = 0
func check(_ ok: Bool, _ what: String) {
    if !ok { failed += 1; print("FAIL: \(what)") }
}

check(HomeVersion.core("0.0.9") == [0, 0, 9], "core 0.0.9")
check(HomeVersion.core("v0.2.0-beta.1") == [0, 2, 0], "core v0.2.0-beta.1")
check(HomeVersion.core("0.0.14-dev") == [0, 0, 14], "core -dev")
check(HomeVersion.core("1.2") == nil, "core 1.2")
check(HomeVersion.core("dev") == nil, "core dev")
check(HomeVersion.core("1.x.3") == nil, "core 1.x.3")

check(HomeVersion.older(app: "0.0.15", home: "0.0.9"), "0.0.9 < 0.0.15")
check(HomeVersion.older(app: "0.0.10", home: "0.0.9"), "numeric, not text")
check(HomeVersion.older(app: "0.1.0", home: "0.0.99"), "minor wins")
check(!HomeVersion.older(app: "0.0.15", home: "0.0.15"), "same")
check(!HomeVersion.older(app: "0.0.15", home: "0.0.16"), "home newer")
check(!HomeVersion.older(app: "0.2.0", home: "0.2.0-beta.1"), "a beta home and the TestFlight build of it")
check(HomeVersion.older(app: "0.0.15", home: nil), "no version: a home from before D200")
check(!HomeVersion.older(app: "0.0.0", home: nil), "a CI build says nothing")
check(!HomeVersion.older(app: "0.0.15", home: "dev"), "not a version: say nothing")
check(!HomeVersion.older(app: "nonsense", home: "0.0.9"), "app not a version")

let base = "https://ducter.example.com/"
check(HomeVersion.shouldShow(app: "0.0.15", home: "0.0.9", base: base, dismissed: nil), "shows")
let k = HomeVersion.key(base: base, home: "0.0.9", app: "0.0.15")
check(!HomeVersion.shouldShow(app: "0.0.15", home: "0.0.9", base: base, dismissed: k), "Got it holds")
check(HomeVersion.shouldShow(app: "0.0.15", home: "0.0.12", base: base, dismissed: k), "home updated, still behind: once more")
check(HomeVersion.shouldShow(app: "0.0.16", home: "0.0.9", base: base, dismissed: k), "app updated: once more")
check(HomeVersion.shouldShow(app: "0.0.15", home: "0.0.9", base: "https://other.example/", dismissed: k), "another home")

if failed > 0 { print("\(failed) failed"); exit(1) }
print("home-version: ok")
