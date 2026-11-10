import UIKit
import UserNotifications

/// Notifications: APNs registration, the relay handle and the phone's key (D159), the Go / Hold /
/// Reply buttons on a decision (category DUCTER_DECISION, sent by packages/core/src/apns.ts and
/// push-relay.ts), and taps that open the right place. Sealed alerts are opened by DucterNotify.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static let category = "DUCTER_DECISION"
    private(set) static weak var shared: AppDelegate?
    private var waiting: [CheckedContinuation<String?, Never>] = []

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Self.shared = self
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        // Go acts, so it asks for Face ID on a locked phone; Hold only waits.
        let go = UNNotificationAction(identifier: "go", title: L("decision.go"), options: [.authenticationRequired])
        let hold = UNNotificationAction(identifier: "hold", title: L("decision.hold"), options: [])
        let reply = UNTextInputNotificationAction(identifier: "reply", title: L("decision.reply"), options: [.authenticationRequired], textInputButtonTitle: L("composer.send"), textInputPlaceholder: L("decision.reply.placeholder"))
        center.setNotificationCategories([UNNotificationCategory(identifier: Self.category, actions: [go, hold, reply], intentIdentifiers: [], options: [])])
        // Keep the token fresh: APNs may hand out a new one after a restore or reinstall.
        Task { @MainActor in
            if AppState.shared.pushOn, await center.notificationSettings().authorizationStatus == .authorized {
                application.registerForRemoteNotifications()
            }
        }
        return true
    }

    // MARK: registration

    /// Asks once (from a tap in the page), then registers with APNs. Returns the device token.
    @MainActor
    func enable() async -> (state: String, token: String?) {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if !granted {
            return (await center.notificationSettings().authorizationStatus == .denied ? "denied" : "off", nil)
        }
        AppState.shared.pushOn = true
        let token = await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
            waiting.append(c)
            UIApplication.shared.registerForRemoteNotifications()
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.settle(nil) }
        }
        return ("on", token)
    }

    @MainActor
    func state() async -> String {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .denied: return "denied"
        case .authorized, .provisional, .ephemeral: return AppState.shared.pushOn && AppState.shared.apnsToken != nil ? "on" : "off"
        default: return "off"
        }
    }

    private func settle(_ token: String?) {
        let w = waiting
        waiting.removeAll()
        for c in w { c.resume(returning: token) }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            let old = AppState.shared.apnsToken
            AppState.shared.apnsToken = hex
            // A new token while notifications are on: tell the main without asking anyone.
            if waiting.isEmpty, AppState.shared.pushOn, old != hex { await API.subscribe(token: hex) }
            settle(hex)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NSLog("[ducter] APNs registration failed: %@", error.localizedDescription)
        Task { @MainActor in settle(nil) }
    }

    // MARK: delivery

    /// In the app: still show it (it may be about a task you're not looking at), quietly.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let decision = info["decisionId"] as? String
        switch response.actionIdentifier {
        case "go", "hold", "reply":
            guard let id = decision else { return }
            let text = (response as? UNTextInputNotificationResponse)?.userText
            let ok = await API.decide(id, option: response.actionIdentifier, text: text)
            if ok {
                await MainActor.run { Haptics.play("success") }
            } else {
                await Self.failed(open: info["url"] as? String)
            }
        default:
            if let url = info["url"] as? String { await MainActor.run { AppState.shared.open = url } }
        }
    }

    /// The answer didn't reach the main: say so, with a tap that opens the decision.
    private static func failed(open url: String?) async {
        let c = UNMutableNotificationContent()
        c.title = "Ducter"
        c.body = L("notify.action.failed")
        if let url { c.userInfo = ["url": url] }
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "ducter.failed", content: c, trigger: nil))
    }
}

/// The few calls the app makes itself (the page does everything else over its own socket).
enum API {
    @MainActor
    static func decide(_ id: String, option: String, text: String?) async -> Bool {
        var body: [String: Any] = ["decisionId": id, "option": option]
        if let text { body["text"] = text }
        let status = await post("api/decide", body)
        return status == 200 || status == 409 // 409: already answered, which is what you wanted
    }

    @MainActor
    static func subscribe(token: String) async {
        // D59: the default quiet hours in this phone's zone; the main keeps any the user set or turned off.
        let quiet: [String: Any] = ["start": "23:00", "end": "08:00", "tz": TimeZone.current.identifier]
        _ = await post("api/push/subscribe", ["apns": await subscription(token: token), "locale": AppState.shared.locale, "quiet": quiet])
    }

    /// What the home gets (D159): the device token, the relay handle (registered here, with the
    /// relay, never through the home) and this phone's key, which seals every notification.
    /// Without a handle (the relay unreachable just now) the home can still send with a key of its own.
    @MainActor
    static func subscription(token: String) async -> [String: Any] {
        var a: [String: Any] = ["token": token, "env": Native.apnsEnv, "topic": Native.bundleId]
        if let key = PushKey.current() { a["key"] = key.base64EncodedString() }
        if let handle = await Relay.handle(for: token) { a["relay"] = handle }
        return a
    }

    @MainActor
    private static func post(_ path: String, _ body: [String: Any]) async -> Int {
        guard let base = AppState.shared.base, let url = URL(string: path, relativeTo: base) else { return 0 }
        var r = URLRequest(url: url, timeoutInterval: 15)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "content-type")
        if let t = Keychain.token { r.setValue("Bearer \(t)", forHTTPHeaderField: "authorization") }
        r.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, res) = try await URLSession.shared.data(for: r)
            return (res as? HTTPURLResponse)?.statusCode ?? 0
        } catch {
            return 0
        }
    }
}

/// The notification relay (D159, apps/site/api/push/[op].ts): Nowledge's small forwarder that holds
/// the app's Apple key. The app registers its device token there and gets an opaque handle; the
/// handle is all its home ever learns, and the words travel sealed with the phone's own key.
enum Relay {
    /// Last outcome of registering: true when the relay couldn't be reached (the page says so).
    @MainActor static var unreachable = false

    /// The handle for this token, registering once per token (a new token gets a new handle).
    @MainActor
    static func handle(for token: String) async -> String? {
        let d = UserDefaults.standard
        if d.string(forKey: "relayToken") == token, let h = d.string(forKey: "relayHandle") { return h }
        guard let base = Native.relay, let url = URL(string: base + "/register") else { return nil }
        var r = URLRequest(url: url, timeoutInterval: 15)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "content-type")
        r.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token, "topic": Native.bundleId, "env": Native.apnsEnv])
        do {
            let (data, res) = try await URLSession.shared.data(for: r)
            let status = (res as? HTTPURLResponse)?.statusCode ?? 0
            unreachable = status >= 500
            guard status == 200, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let h = j["handle"] as? String else { return nil }
            if let old = d.string(forKey: "relayHandle") { await revoke(old) }
            d.set(token, forKey: "relayToken")
            d.set(h, forKey: "relayHandle")
            return h
        } catch {
            unreachable = true
            NSLog("[ducter] relay unreachable: %@", error.localizedDescription)
            return nil
        }
    }

    /// Stops a handle (notifications off, or another Ducter): whoever held it can't push any more.
    @MainActor
    static func revoke(_ handle: String) async {
        guard let base = Native.relay, let url = URL(string: base + "/revoke") else { return }
        var r = URLRequest(url: url, timeoutInterval: 10)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "content-type")
        r.httpBody = try? JSONSerialization.data(withJSONObject: ["handle": handle])
        _ = try? await URLSession.shared.data(for: r)
    }

    /// Forgets this phone's handle and revokes it.
    @MainActor
    static func drop() async {
        let d = UserDefaults.standard
        let h = d.string(forKey: "relayHandle")
        d.removeObject(forKey: "relayHandle")
        d.removeObject(forKey: "relayToken")
        if let h { await revoke(h) }
    }
}

enum Haptics {
    @MainActor
    static func play(_ kind: String) {
        switch kind {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}

/// What the page is told about the app (window.ducterNative, apps/web/src/native.ts).
enum Native {
    static let bundleId = Bundle.main.bundleIdentifier ?? "co.nowledge.ducter.ios"
    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    /// The notification relay's base URL (Config.xcconfig DUCTER_PUSH_RELAY); nil when left empty.
    static let relay: String? = (Bundle.main.object(forInfoDictionaryKey: "DucterPushRelay") as? String).flatMap { $0.hasPrefix("https://") ? $0 : nil }
    #if DEBUG
    static let apnsEnv = "sandbox"
    #else
    static let apnsEnv = "production"
    #endif
}

func L(_ key: String, _ args: CVarArg...) -> String {
    let s = NSLocalizedString(key, comment: "")
    return args.isEmpty ? s : String(format: s, arguments: args)
}
