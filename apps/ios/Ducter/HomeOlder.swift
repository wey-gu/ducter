import SwiftUI

/// D200: when the home runs an older Ducter than this app, one quiet native line says so, with
/// 去更新 / Update it (the page's Settings › Your devices, where the home's own card updates it)
/// and 知道了 / Got it (held for this pair of versions). Native, because the page is the home's
/// own and an older page can't know it is older (D178 (5)).
@MainActor
final class HomeCheck: ObservableObject {
    static let shared = HomeCheck()

    struct Line: Equatable {
        let host: String
        let version: String? // nil: the home said no version (from before D200)
        let key: String
    }

    @Published private(set) var line: Line?
    private var busy = false
    private let defaults = UserDefaults.standard

    /// The app's version. A local Xcode build says project.yml's placeholder, never a release's,
    /// so it stays quiet unless launched with `-appVersion 0.0.20` (simulator trials of this line).
    private var app: String? {
        #if DEBUG
        return defaults.string(forKey: "appVersion")
        #else
        return Native.version
        #endif
    }

    /// Asks the home its version (GET /api/me, the paired device token) and decides. Quiet on
    /// any failure: a home that can't answer is the can't-reach screen's business, not this line's.
    func check() async {
        guard !busy, let base = AppState.shared.base, let app, let url = URL(string: "api/me", relativeTo: base) else { return }
        busy = true
        defer { busy = false }
        var r = URLRequest(url: url.absoluteURL, timeoutInterval: 10)
        if let t = Keychain.token { r.setValue("Bearer \(t)", forHTTPHeaderField: "authorization") }
        guard let (data, res) = try? await URLSession.shared.data(for: r), (res as? HTTPURLResponse)?.statusCode == 200,
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any], j["personaName"] is String,
              AppState.shared.base == base else { return }
        let home = j["version"] as? String
        let b = base.absoluteString
        guard HomeVersion.shouldShow(app: app, home: home, base: b, dismissed: defaults.string(forKey: "homeOlder.dismissed")) else {
            withAnimation(.easeOut(duration: 0.22)) { line = nil }
            return
        }
        let next = Line(host: base.host(percentEncoded: false) ?? b, version: home, key: HomeVersion.key(base: b, home: home, app: app))
        if next != line { withAnimation(.easeOut(duration: 0.22)) { line = next } }
    }

    /// 知道了 / Got it: not again for this pair of versions.
    func dismiss() {
        if let k = line?.key { defaults.set(k, forKey: "homeOlder.dismissed") }
        withAnimation(.easeOut(duration: 0.22)) { line = nil }
    }

    /// 去更新 / Update it: the line steps aside (the next check brings it back if still behind).
    func hide() {
        withAnimation(.easeOut(duration: 0.22)) { line = nil }
    }

    /// Another Ducter, or none: nothing to say about the last one.
    func clear() { line = nil }
}

/// The line itself: the same card as the Android app's (Screens.kt UpdateCard), at the bottom,
/// one phone-wide column on an iPad.
struct HomeOlderCard: View {
    let line: HomeCheck.Line
    let go: () -> Void
    let dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(line.version.map { L("home.older", line.host, $0) } ?? L("home.older.unknown", line.host))
                .font(Pebble.text(15, relativeTo: .subheadline)).lineSpacing(4).foregroundStyle(Pebble.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button(L("home.older.dismiss"), action: dismiss).buttonStyle(QuietButtonStyle())
                Button(L("home.older.go"), action: go).buttonStyle(PrimaryButtonStyle())
            }
        }
        .padding(EdgeInsets(top: 18, leading: 20, bottom: 14, trailing: 20))
        .background(Pebble.surface, in: RoundedRectangle(cornerRadius: Pebble.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Pebble.radius, style: .continuous).stroke(Pebble.line, lineWidth: 1))
        .shadow(color: Color(UIColor(hex: 0x2B2118)).opacity(0.14), radius: 14, y: 6)
        .frame(maxWidth: 520)
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity)
    }
}
