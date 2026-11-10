import CryptoKit
import Foundation
import Security

/// The phone's notification key (D159), shared by the app and its Notification Service Extension
/// through one keychain access group. The app makes it once and gives it to its home when it
/// subscribes; the home seals every notification with it (packages/core/src/push-relay.ts), so
/// neither the notification relay nor Apple ever sees the words. Foundation, CryptoKit and
/// Security only: the extension and `apps/ios/scripts/check-push-vector.sh` compile it as is.
enum PushCrypto {
    static let aad = Data("ducter-push-v1".utf8)

    /// Opens what the home sealed: base64url of nonce ‖ ciphertext ‖ tag (AES-256-GCM).
    static func open(_ sealed: String, key: Data) -> Data? {
        guard key.count == 32, let raw = base64url(sealed), raw.count > 28,
              let box = try? AES.GCM.SealedBox(combined: raw) else { return nil }
        return try? AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: aad)
    }

    /// The notification as the home sent it (title, body, url, tag, decisionId).
    struct Message: Decodable {
        var title: String
        var body: String
        var url: String?
        var tag: String?
        var decisionId: String?
    }

    static func message(_ sealed: String, key: Data) -> Message? {
        guard let plain = open(sealed, key: key) else { return nil }
        return try? JSONDecoder().decode(Message.self, from: plain)
    }

    static func base64url(_ s: String) -> Data? {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        return Data(base64Encoded: b)
    }
}

/// The key in the keychain, readable after the first unlock (a notification may arrive on a
/// locked phone), in the access group both targets list in their entitlements.
enum PushKey {
    private static let service = "ducter.push"
    private static let account = "key"

    /// `$(AppIdentifierPrefix)$(DUCTER_BUNDLE_ID).shared`, written into each target's Info.plist.
    static var group: String? {
        (Bundle.main.object(forInfoDictionaryKey: "DucterKeychainGroup") as? String).flatMap { $0.isEmpty || $0.hasPrefix("$(") ? nil : $0 }
    }

    private static func query(_ group: String?) -> [String: Any] {
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    /// No access group in a search means every group this target may read (the shared one too).
    static func read() -> Data? {
        var q = query(nil)
        q[kSecReturnData as String] = true
        var out: AnyObject?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data, d.count == 32 { return d }
        return nil
    }

    /// The key, made on first use. Nil only when the keychain refuses to keep it.
    static func current() -> Data? {
        if let k = read() { return k }
        return rotate()
    }

    /// A new key (connecting to another Ducter starts a new one; the old home can't read anything).
    @discardableResult
    static func rotate() -> Data? {
        let key = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
        for g in [group, nil] {
            SecItemDelete(query(g) as CFDictionary)
            var add = query(g)
            add[kSecValueData as String] = key
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            // Without the group (a simulator build signed to run locally), the app alone keeps it.
            if SecItemAdd(add as CFDictionary, nil) == errSecSuccess { return key }
        }
        return nil
    }
}
