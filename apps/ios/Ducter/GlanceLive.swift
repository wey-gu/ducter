import ActivityKit
import Foundation

/// D306: the app's half of the Lock Screen glance. The page asks (a tap on 在锁屏上显示 / Show on the
/// Lock Screen in an opened task, or a call going live while the app is open); the app starts the
/// Live Activity with the title, which never leaves the phone, and hands the home the activity's
/// push token (through the relay as a handle, D159's rule), so the home can push each change of phase.
///
/// Behind a flag (Info.plist DucterLiveActivities, from DUCTER_LIVE_ACTIVITIES): the push path can
/// only be checked on a real iPhone with APNs; the local start and the drawing run in the Simulator.
@MainActor
enum GlanceLive {
    static var enabled: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "DucterLiveActivities") as? String) == "1" && ActivityAuthorizationInfo().areActivitiesEnabled
    }

    private static var follows: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: "glanceFollows") as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "glanceFollows") }
    }

    private static func find(_ kind: String, _ id: String) -> Activity<GlanceAttributes>? {
        Activity<GlanceAttributes>.activities.first { $0.attributes.kind == kind && $0.attributes.id == id }
    }

    /// What is on the Lock Screen now, for the page's switch.
    static func shown() -> [[String: String]] {
        Activity<GlanceAttributes>.activities.filter { $0.activityState == .active }.map { ["kind": $0.attributes.kind, "id": $0.attributes.id] }
    }

    /// Starts (or refreshes) the glance for one task or call.
    static func start(kind: String, id: String, title: String, phase: String, since: Int) async -> [String: Any] {
        guard enabled else { return ["ok": false, "why": "off"] }
        let state = GlanceAttributes.ContentState(phase: phase, since: since)
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(4 * 3600))
        if let a = find(kind, id) {
            await a.update(content)
            return ["ok": true]
        }
        do {
            let a = try Activity.request(attributes: GlanceAttributes(kind: kind, id: id, title: title), content: content, pushType: .token)
            Task { await watchToken(a, phase: phase) }
            return ["ok": true]
        } catch {
            NSLog("[ducter] Live Activity refused: %@", error.localizedDescription)
            return ["ok": false, "why": "refused"]
        }
    }

    /// While the app is open the page keeps it true itself (no push needed).
    static func update(kind: String, id: String, phase: String, since: Int) async {
        guard let a = find(kind, id) else { return }
        let content = ActivityContent(state: GlanceAttributes.ContentState(phase: phase, since: since), staleDate: Date().addingTimeInterval(4 * 3600))
        if GlancePhase.isEnded(phase) {
            await a.end(content, dismissalPolicy: .after(Date().addingTimeInterval(15 * 60)))
            await forget(a)
        } else {
            await a.update(content)
        }
    }

    /// The person took it off the Lock Screen.
    static func end(kind: String, id: String) async {
        guard let a = find(kind, id) else { return }
        await a.end(nil, dismissalPolicy: .immediate)
        await forget(a)
    }

    private static func forget(_ a: Activity<GlanceAttributes>) async {
        if let f = follows[a.id] {
            _ = await API.post("api/ambient/unfollow", ["id": f])
            follows[a.id] = nil
        }
    }

    /// Each push token the activity gets goes to the home (as a relay handle when there is a relay).
    private static func watchToken(_ a: Activity<GlanceAttributes>, phase: String) async {
        for await data in a.pushTokenUpdates {
            let hex = data.map { String(format: "%02x", $0) }.joined()
            var apns: [String: Any] = ["token": hex, "topic": Native.bundleId, "env": Native.apnsEnv]
            if let h = await Relay.activityHandle(for: hex) { apns["relay"] = h }
            let body: [String: Any] = ["kind": a.attributes.kind, "id": a.attributes.id, "phase": phase, "apns": apns]
            if let id = await API.postJSON("api/ambient/follow", body)?["id"] as? String {
                if let old = follows[a.id] { _ = await API.post("api/ambient/unfollow", ["id": old]) }
                follows[a.id] = id
            }
        }
    }

    #if DEBUG
    /// The Simulator's check (`-glanceDemo needs_you`): a glance started locally, no home needed.
    static func demo(_ phase: String) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let zh = Locale.preferredLanguages.first?.hasPrefix("zh") == true
        let title = zh ? "修 CI 里那个不稳定的测试" : "Fix the flaky CI test"
        let since = Int(Date().addingTimeInterval(-12 * 60).timeIntervalSince1970)
        let content = ActivityContent(state: GlanceAttributes.ContentState(phase: phase, since: since), staleDate: nil)
        _ = try? Activity.request(attributes: GlanceAttributes(kind: "task", id: "demo", title: title), content: content, pushType: nil)
    }
    #endif
}

extension Relay {
    /// D306: a handle for one Live Activity's push token (kind "activity": usable only for its
    /// words-free phase updates, never for an alert).
    @MainActor
    static func activityHandle(for token: String) async -> String? {
        guard let base = Native.relay, let url = URL(string: base + "/register") else { return nil }
        var r = URLRequest(url: url, timeoutInterval: 15)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "content-type")
        r.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token, "topic": Native.bundleId, "env": Native.apnsEnv, "kind": "activity"])
        guard let (data, res) = try? await URLSession.shared.data(for: r), (res as? HTTPURLResponse)?.statusCode == 200,
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return j["handle"] as? String
    }
}
