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
        entry = c.code.map { var u = URLComponents(url: c.base.appendingPathComponent("pair"), resolvingAgainstBaseURL: false)!; u.fragment = "c=\($0)"; return u.url! } ?? c.base.appendingPathComponent("app")
    }

    // MARK: D293, following the home to its best way

    /// The home's ways and key fingerprint, as the page last handed them over.
    var ways: [Way] {
        get { (defaults.data(forKey: "ways")).flatMap { try? JSONDecoder().decode([Way].self, from: $0) } ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "ways") }
    }

    var fp: String? {
        get { defaults.string(forKey: "fp") }
        set { defaults.set(newValue, forKey: "fp") }
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
        didSet { defaults.set(personaName, forKey: "personaName") }
    }

    var locale: String {
        get { defaults.string(forKey: "locale") ?? (Locale.preferredLanguages.first?.hasPrefix("zh") == true ? "zh" : "en") }
        set { defaults.set(newValue, forKey: "locale") }
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

enum Keychain {
    private static let service = (Bundle.main.bundleIdentifier ?? "co.nowledge.ducter.ios") + ".device"

    /// Readable after the first unlock, so Go / Hold on a notification work on a locked phone
    /// (iOS asks for Face ID first: the actions are marked authenticationRequired).
    static var token: String? {
        get {
            var out: AnyObject?
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "token", kSecReturnData as String: true]
            guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
            return String(data: d, encoding: .utf8)
        }
        set {
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "token"]
            SecItemDelete(q as CFDictionary)
            guard let v = newValue, let d = v.data(using: .utf8) else { return }
            var add = q
            add[kSecValueData as String] = d
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}


/// D293: the home's ways to be reached and its key. The page hands them over (ways frame); the app
/// opens the home at the best way that proves it is the home (it signs a fresh nonce with the key
/// pinned at pairing), and moves without pairing again. The rules are packages/protocol/src/reach.ts:
/// nearest first (same network, tailnet, domain, tunnel); while open, leave a way only after two
/// misses in a row, and move up only after a better way answered twice in a row. A move reloads
/// the page, so moving up waits for the app to come to the front.
struct Way: Codable, Equatable {
    var kind: String
    var url: String
    var primary: Bool?
}

enum Reach {
    static let rank = ["lan": 0, "tailnet": 1, "domain": 2, "tunnel": 3]

    static func ranked(_ ways: [Way]) -> [Way] {
        ways.enumerated().sorted { a, b in
            let ra = rank[a.element.kind] ?? 9, rb = rank[b.element.kind] ?? 9
            if ra != rb { return ra < rb }
            if (a.element.primary ?? false) != (b.element.primary ?? false) { return a.element.primary ?? false }
            return a.offset < b.offset
        }.map(\.element)
    }

    /// SHA-256 of the raw key, first 16 bytes, base64url without padding.
    static func fingerprint(_ raw: Data) -> String {
        b64u(Data(SHA256.hash(data: raw).prefix(16)))
    }

    static func b64u(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    static func unb64u(_ s: String) -> Data? {
        var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while t.count % 4 != 0 { t += "=" }
        return Data(base64Encoded: t)
    }

    /// The answer counts only when its key is the pinned one and it signed this nonce.
    static func check(key: String, sig: String, nonce: String, pinned: String) -> Bool {
        guard let raw = unb64u(key), raw.count == 32, fingerprint(raw) == pinned, let s = unb64u(sig),
              let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: raw) else { return false }
        return pub.isValidSignature(s, for: Data("ducter-home\n\(nonce)".utf8))
    }

    /// Asks base to prove it is the home with this fingerprint.
    static func proves(_ base: String, pinned: String) async -> Bool {
        var bytes = [UInt8](repeating: 0, count: 18)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let nonce = b64u(Data(bytes))
        let root = base.hasSuffix("/") ? String(base.dropLast()) : base
        guard let u = URL(string: "\(root)/.well-known/ducter-home?n=\(nonce)") else { return false }
        var req = URLRequest(url: u)
        req.timeoutInterval = 4
        guard let (data, res) = try? await URLSession.shared.data(for: req), (res as? HTTPURLResponse)?.statusCode == 200,
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let key = j["key"] as? String, let sig = j["sig"] as? String else { return false }
        return check(key: key, sig: sig, nonce: nonce, pinned: pinned)
    }

    /// The best way that proves it is the home: each tried 250 ms after the one before; a better
    /// one still pending gets 300 ms more once a worse one answered. nil when none does.
    static func race(_ ways: [Way], pinned: String) async -> String? {
        let list = ranked(ways)
        guard !list.isEmpty else { return nil }
        return await withTaskGroup(of: (Int, Bool).self) { g in
            for (i, w) in list.enumerated() {
                g.addTask {
                    try? await Task.sleep(nanoseconds: UInt64(i) * 250_000_000)
                    return (i, await proves(w.url, pinned: pinned))
                }
            }
            var got = [Int: Bool]()
            var graceStarted = false, graceOver = false
            for await (i, ok) in g {
                if i < 0 { graceOver = true } else { got[i] = ok }
                if ok, !graceStarted {
                    graceStarted = true
                    g.addTask {
                        try? await Task.sleep(nanoseconds: 300_000_000)
                        return (-1, false)
                    }
                }
                if let best = got.filter(\.value).keys.min(), graceOver || (0..<best).allSatisfy({ got[$0] != nil }) {
                    g.cancelAll()
                    return list[best].url
                }
            }
            return got.filter(\.value).keys.min().map { list[$0].url }
        }
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
