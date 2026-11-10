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
        if base != c.base { Keychain.token = nil }
        base = c.base
        defaults.set(c.base.absoluteString, forKey: "base")
        entry = c.code.map { var u = URLComponents(url: c.base.appendingPathComponent("pair"), resolvingAgainstBaseURL: false)!; u.fragment = "c=\($0)"; return u.url! } ?? c.base.appendingPathComponent("app")
    }

    /// Back to the connect screen (another Ducter, or this one was unreachable).
    func forget() {
        base = nil
        entry = nil
        Keychain.token = nil
        defaults.removeObject(forKey: "base")
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

    var locale: String {
        get { defaults.string(forKey: "locale") ?? (Locale.preferredLanguages.first?.hasPrefix("zh") == true ? "zh" : "en") }
        set { defaults.set(newValue, forKey: "locale") }
    }
}

/// Where to connect: a base URL and, from a `ducter pair` link, its one-time code.
struct PairTarget: Equatable {
    var base: URL
    var code: String?

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
        return PairTarget(base: base, code: code?.isEmpty == true ? nil : code)
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
