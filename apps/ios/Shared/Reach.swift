import CryptoKit
import Foundation
import Security

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
