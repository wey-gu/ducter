#if DEBUG
import SwiftUI

/// D306: every glance phase as the Lock Screen draws it, for review in the Simulator
/// (`-glanceSpecimen YES`, light and dark by the Simulator's appearance). The same views the
/// DucterLive extension uses (LiveShared/Glance.swift).
struct GlanceSpecimen: View {
    private let now = Int(Date().timeIntervalSince1970)
    private var title: String { Locale.preferredLanguages.first?.hasPrefix("zh") == true ? "修 CI 里那个不稳定的测试" : "Fix the flaky CI test" }
    private var call: String { Locale.preferredLanguages.first?.hasPrefix("zh") == true ? "打给牙科诊所改约" : "Call the dentist to move the visit" }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                card("task", title, "working", 12 * 60, stale: false)
                card("task", title, "needs_you", 3 * 60, stale: false)
                card("task", title, "waiting", 40 * 60, stale: true)
                card("task", title, "done", 0, stale: false)
                card("call", call, "talking", 95, stale: false)
                card("call", call, "asking", 20, stale: false)
                HStack(spacing: 18) {
                    ForEach(["working", "needs_you", "done"], id: \.self) { p in
                        HStack(spacing: 6) {
                            GlanceMark(phase: p, size: 18)
                            GlancePhaseText(phase: p)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Capsule().fill(Color.black))
                        .environment(\.colorScheme, .dark)
                    }
                }
            }
            .padding(16)
        }
        .background(GlanceTokens.paper.ignoresSafeArea())
    }

    private func card(_ kind: String, _ t: String, _ phase: String, _ ago: Int, stale: Bool) -> some View {
        GlanceLockView(attributes: GlanceAttributes(kind: kind, id: "x", title: t), state: .init(phase: phase, since: now - ago), stale: stale)
            .background(RoundedRectangle(cornerRadius: 22).fill(GlanceTokens.surface))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(GlanceTokens.ledge, lineWidth: 1))
    }
}
#endif
