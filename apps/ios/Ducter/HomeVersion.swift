import Foundation

/// D200: is the home this app is paired with running an older Ducter than the app? The page the
/// app shows is the home's own, so an older home means an older page, and nothing in it can say
/// so. Plain logic, Foundation only: `apps/ios/scripts/check-home-version.sh` compiles it as is,
/// and the Android app's HomeVersion (Core.kt) answers the same cases.
enum HomeVersion {
    /// major.minor.patch, without a leading v, a pre-release or build part ("v0.2.0-beta.1" →
    /// [0, 2, 0]); nil when it isn't a version. Only these three count: an App Store build carries
    /// digits only (0.2.0-beta.1 ships to TestFlight as 0.2.0), so a pre-release would otherwise
    /// read as older than the very app built from it.
    static func core(_ v: String) -> [Int]? {
        var s = v.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("v") { s.removeFirst() }
        let head = s.split(whereSeparator: { $0 == "-" || $0 == "+" }).first.map(String.init) ?? ""
        let parts = head.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        var out: [Int] = []
        for p in parts {
            guard !p.isEmpty, p.allSatisfy({ $0.isASCII && $0.isNumber }), let n = Int(p) else { return nil }
            out.append(n)
        }
        return out
    }

    /// The home is older than the app. home == nil: the home answered /api/me without a version,
    /// which every home from before D200 does, so it is older than any app that asks. An app that
    /// isn't a real version (0.0.0, a CI build) never says it.
    static func older(app: String, home: String?) -> Bool {
        guard let a = core(app), a != [0, 0, 0] else { return false }
        guard let home else { return true }
        guard let h = core(home) else { return false }
        return h.lexicographicallyPrecedes(a)
    }

    /// What "Got it" remembers: this home, at this version, against this app. A new pair of
    /// versions (the home updated but still behind, or the app updated again) shows the line once more.
    static func key(base: String, home: String?, app: String) -> String {
        "\(base)|\(home ?? "-")|\(app)"
    }

    static func shouldShow(app: String, home: String?, base: String, dismissed: String?) -> Bool {
        older(app: app, home: home) && dismissed != key(base: base, home: home, app: app)
    }
}
