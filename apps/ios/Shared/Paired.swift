import Foundation
import Security

/// What the app and its extensions know of the pairing, so the share sheet (D537) sends with the
/// device the app paired as and never asks to pair again. The token lives in the keychain group
/// every target lists (`$(AppIdentifierPrefix)$(DUCTER_BUNDLE_ID).shared`); the rest (which home,
/// its ways and key, the partners) in the app group's defaults (`group.$(DUCTER_BUNDLE_ID)`),
/// written by the app whenever the page tells it something new.
enum Paired {
    /// The app's own bundle id, also from inside an extension (`<app>.share`, `<app>.notify`).
    static var appBundleId: String {
        let id = Bundle.main.bundleIdentifier ?? "co.nowledge.ducter.ios"
        for tail in [".share", ".notify", ".live"] where id.hasSuffix(tail) { return String(id.dropLast(tail.count)) }
        return id
    }

    /// `group.$(DUCTER_BUNDLE_ID)`, written into each target's Info.plist (DucterAppGroup).
    static var groupId: String {
        (Bundle.main.object(forInfoDictionaryKey: "DucterAppGroup") as? String).flatMap { $0.isEmpty || $0.hasPrefix("$(") ? nil : $0 } ?? "group.\(appBundleId)"
    }

    /// The app group's folder (the share outbox lives in it); nil when the build has no group
    /// (D553: DUCTER_SHARE=0, or a self-signed build that dropped it).
    static let container: URL? = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId)

    /// The app group's defaults; nil without the group, so the app's copies for the share sheet
    /// are no-ops in a build that has no share sheet (D553).
    static var defaults: UserDefaults? { container == nil ? nil : UserDefaults(suiteName: groupId) }

    static var base: URL? {
        get { defaults?.string(forKey: "base").flatMap(URL.init(string:)) }
        set { defaults?.set(newValue?.absoluteString, forKey: "base") }
    }

    static var ways: [Way] {
        get { defaults?.data(forKey: "ways").flatMap { try? JSONDecoder().decode([Way].self, from: $0) } ?? [] }
        set { defaults?.set(try? JSONEncoder().encode(newValue), forKey: "ways") }
    }

    static var fp: String? {
        get { defaults?.string(forKey: "fp") }
        set { defaults?.set(newValue, forKey: "fp") }
    }

    /// The page's language ("zh" or "en"), so the share sheet speaks as the app does.
    static var locale: String? {
        get { defaults?.string(forKey: "locale") }
        set { defaults?.set(newValue, forKey: "locale") }
    }

    static var personaName: String? {
        get { defaults?.string(forKey: "personaName") }
        set { defaults?.set(newValue, forKey: "personaName") }
    }

    /// D513: the person's partners as the home last listed them (GET /api/me), the default first.
    static var partners: [SharePartner] {
        get { defaults?.data(forKey: "partners").flatMap { try? JSONDecoder().decode([SharePartner].self, from: $0) } ?? [] }
        set { defaults?.set(try? JSONEncoder().encode(newValue), forKey: "partners") }
    }

    /// The partner the last share went to: the picker starts there.
    static var lastPartner: String? {
        get { defaults?.string(forKey: "share.lastPartner") }
        set { defaults?.set(newValue, forKey: "share.lastPartner") }
    }

    /// Another home, or none: nothing of the old one stays for the share sheet.
    static func clear() {
        for k in ["base", "ways", "fp", "personaName", "partners", "share.lastPartner"] { defaults?.removeObject(forKey: k) }
    }
}

/// One partner in the share sheet's picker (GET /api/me's partners).
struct SharePartner: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var look: String
}

enum Keychain {
    /// The app's id, never the extension's: the share sheet reads the token the app saved.
    private static let service = Paired.appBundleId + ".device"

    /// Readable after the first unlock, so Go / Hold on a notification work on a locked phone
    /// (iOS asks for Face ID first: the actions are marked authenticationRequired). Saved in the
    /// first keychain group the target lists (the shared one), so the share sheet reads it too.
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
