import CryptoKit
import Foundation
import Security

/// What the app remembers: which Ducter it talks to (UserDefaults), and the paired device token
/// (Keychain), which the page hands over after it pairs so notification buttons work without
/// opening the app. The page keeps its own copy in its storage; the server is the authority.
@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    /// The Ducter's base URL ("https://ducter.example.com/"), or nil before the first pairing.
    @Published private(set) var base: URL?
    /// The first URL the web view loads: the pairing link once, then base/app.
    @Published private(set) var entry: URL?
    /// A notification was tapped: where the page should go (relative to base, e.g. "app#d=…").
    @Published var open: String?

    private let defaults = UserDefaults.standard

    private init() {
        if let s = defaults.string(forKey: "base"), let u = URL(string: s) {
            base = u
            entry = u.appendingPathComponent("app")
        }
        mirror()
        #if DEBUG
        // Simulator runs: `xcrun simctl launch booted <bundle id> -pairLink '<link from ducter pair>'`.
        if let link = UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)["pairLink"] as? String, let t = PairTarget.parse(link) {
            connect(t)
        }
        // …and `-open 'app#onhand'` starts on a route, as a tapped notification would.
        if let path = UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)["open"] as? String, let b = base {
            entry = URL(string: path, relativeTo: b)?.absoluteURL
        }
        #endif
    }

    /// Connect to a Ducter: from a pairing link (…/pair#c=CODE) the page pairs itself.
    func connect(_ c: PairTarget) {
        if base != c.base {
            Keychain.token = nil
            // D293: another pairing: the new home says its own ways; a link names its key.
            ways = []
            fp = c.fp
        }
        base = c.base
        defaults.set(c.base.absoluteString, forKey: "base")
        Paired.base = c.base
        entry = c.code.map { var u = URLComponents(url: c.base.appendingPathComponent("pair"), resolvingAgainstBaseURL: false)!; u.fragment = "c=\($0)"; return u.url! } ?? c.base.appendingPathComponent("app")
    }

    // MARK: D293, following the home to its best way

    /// The home's ways and key fingerprint, as the page last handed them over.
    var ways: [Way] {
        get { (defaults.data(forKey: "ways")).flatMap { try? JSONDecoder().decode([Way].self, from: $0) } ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "ways"); Paired.ways = newValue }
    }

    var fp: String? {
        get { defaults.string(forKey: "fp") }
        set { defaults.set(newValue, forKey: "fp"); Paired.fp = newValue }
    }

    /// D537: the share sheet (an extension) sends as this device: what it needs goes to the app
    /// group (the token is already in the shared keychain group). At launch for an app paired
    /// before D537, then on every change.
    private func mirror() {
        Paired.base = base
        Paired.ways = ways
        Paired.fp = fp
        Paired.locale = locale
        Paired.personaName = personaName
    }

    /// What the page needs on another origin to be the same device (the token is in the Keychain).
    var deviceId: String? {
        get { defaults.string(forKey: "deviceId") }
        set { defaults.set(newValue, forKey: "deviceId") }
    }

    var deviceName: String? {
        get { defaults.string(forKey: "deviceName") }
        set { defaults.set(newValue, forKey: "deviceName") }
    }

    /// Opens the same home at another of its ways: the token and the device stay (no pairing).
    func follow(_ url: String) {
        guard let u = URL(string: url.hasSuffix("/") ? url : url + "/"), u != base else { return }
        base = u
        defaults.set(u.absoluteString, forKey: "base")
        Paired.base = u
        entry = u.appendingPathComponent("app")
    }

    private let keeper = Keeper()

    /// D293: at launch and on coming to the front (up: moving to a better way is fine, the page
    /// reloads anyway), and every 30 s while open (only leaving a way that stopped answering).
    func lookForBetterWay(up: Bool) async {
        guard let fp, let base, ways.count > 1 else { return }
        let current = base.absoluteString.hasSuffix("/") ? String(base.absoluteString.dropLast()) : base.absoluteString
        let next: String?
        if up, entry == base.appendingPathComponent("app") || entry == nil {
            next = await Reach.race(ways + [Way(kind: "domain", url: current)], pinned: fp)
        } else {
            next = await keeper.tick(ways: ways, current: current, pinned: fp, up: up)
        }
        if let next, next.lowercased() != current.lowercased() { follow(next) }
    }

    /// Back to the connect screen (another Ducter, or this one was unreachable).
    func forget() {
        base = nil
        entry = nil
        Keychain.token = nil
        defaults.removeObject(forKey: "base")
        for k in ["ways", "fp", "deviceId", "deviceName"] { defaults.removeObject(forKey: k) }
        defaults.removeObject(forKey: "apnsToken")
        defaults.set(false, forKey: "pushOn")
        // D537: shares still waiting were for the Ducter left behind: they go nowhere now.
        Paired.clear()
        ShareOutbox.dropAll()
        // D159: the Ducter left behind can neither push to this phone nor read what comes next.
        PushKey.rotate()
        Task { await Relay.drop() }
    }

    var pushOn: Bool {
        get { defaults.bool(forKey: "pushOn") }
        set { defaults.set(newValue, forKey: "pushOn") }
    }

    var apnsToken: String? {
        get { defaults.string(forKey: "apnsToken") }
        set { defaults.set(newValue, forKey: "apnsToken") }
    }

    /// The partner's name, as the page last said it: the ⌘K menu item reads "Talk to {name}".
    @Published var personaName: String = UserDefaults.standard.string(forKey: "personaName") ?? "Ducter" {
        didSet { defaults.set(personaName, forKey: "personaName"); Paired.personaName = personaName }
    }

    var locale: String {
        get { defaults.string(forKey: "locale") ?? (Locale.preferredLanguages.first?.hasPrefix("zh") == true ? "zh" : "en") }
        set { defaults.set(newValue, forKey: "locale"); Paired.locale = newValue }
    }
}

/// Where to connect: a base URL and, from a `ducter pair` link, its one-time code.
struct PairTarget: Equatable {
    var base: URL
    var code: String?
    /// D293: the home's key fingerprint from the link (…#c=…&k=<fp>), pinned at pairing.
    var fp: String?

    /// Accepts the whole link ("https://h/pair#c=K7QM-4XPA"), an address ("h", "h:7880",
    /// "http://10.0.0.5:7880"), and a code typed separately.
    static func parse(_ input: String, code typed: String = "") -> PairTarget? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty, !s.contains(" ") else { return nil }
        if !s.contains("://") {
            let host = s.split(separator: "/").first.map(String.init) ?? s
            let local = host.hasPrefix("127.") || host.hasPrefix("localhost") || host.hasPrefix("10.") || host.hasPrefix("192.168.") || host.hasSuffix(".local") || host.contains(":")
            s = (local ? "http://" : "https://") + s
        }
        guard var u = URLComponents(string: s), let scheme = u.scheme?.lowercased(), scheme == "http" || scheme == "https", let host = u.host, !host.isEmpty else { return nil }
        var code: String?
        if let f = u.fragment, let r = f.range(of: #"(?:^|&)c=([A-Za-z0-9-]+)"#, options: .regularExpression) {
            code = String(f[r]).replacingOccurrences(of: "&", with: "").replacingOccurrences(of: "c=", with: "").uppercased()
        }
        var fp: String?
        if let f = u.fragment, let r = f.range(of: #"(?:^|&)k=([A-Za-z0-9_-]{16,64})"#, options: .regularExpression) {
            fp = String(f[r]).replacingOccurrences(of: "&", with: "").replacingOccurrences(of: "k=", with: "")
        }
        let t = typed.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if !t.isEmpty { code = t }
        u.fragment = nil
        u.query = nil
        // The directory of the page: /pair, /app and / all mean the base.
        var path = u.path
        for tail in ["/pair", "/app", "/app/"] where path.hasSuffix(tail) { path = String(path.dropLast(tail.count)) }
        if !path.hasSuffix("/") { path += "/" }
        u.path = path
        guard let base = u.url else { return nil }
        return PairTarget(base: base, code: code?.isEmpty == true ? nil : code, fp: fp)
    }
}

/// The 30-second look while the app is open.
actor Keeper {
    private var streak = [String: Int]()

    /// The base to move to, or nil to stay. Moving up is only allowed when `up` (the app just came to the front).
    func tick(ways: [Way], current: String, pinned: String, up: Bool) async -> String? {
        let list = Reach.ranked(ways)
        let at = list.firstIndex { same($0.url, current) }
        let look = at.map { Array(list[...$0]) } ?? list + [Way(kind: "domain", url: current)]
        var answers = [Bool]()
        for w in look { answers.append(await Reach.proves(w.url, pinned: pinned)) }
        for (i, w) in look.enumerated() {
            let s = streak[w.url] ?? 0
            streak[w.url] = answers[i] ? max(s, 0) + 1 : min(s, 0) - 1
        }
        if up, let at {
            for w in list[..<at] where (streak[w.url] ?? 0) >= 2 { return w.url }
        }
        if (streak[at.map { list[$0].url } ?? current] ?? 0) <= -2 {
            for (i, w) in look.enumerated() where answers[i] && !same(w.url, current) { return w.url }
            if let at { for w in list[(at + 1)...] where await Reach.proves(w.url, pinned: pinned) { return w.url } }
        }
        return nil
    }

    private func same(_ a: String, _ b: String) -> Bool {
        a.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased() == b.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
    }
}
