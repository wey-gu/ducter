import ActivityKit
import SwiftUI
import UIKit

/// D306: one thing the person chose to keep in sight on the Lock Screen and in the Dynamic Island: a
/// task they followed, or a call that is live. Shared by the app (which starts it, with the title,
/// on the phone) and the DucterLive widget extension (which draws it).
///
/// The content state is words-free on purpose: a Live Activity push is not sealed (no extension
/// opens it, unlike D159's alerts), so the home sends only the phase and since when
/// (packages/protocol/src/ambient.ts). The title never leaves the phone.
struct GlanceAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// One of AMBIENT_PHASES (packages/protocol/src/ambient.ts).
        var phase: String
        /// Unix seconds (not a Date: ActivityKit decodes a push's JSON with the default decoder).
        var since: Int
    }
    /// "task" or "call".
    var kind: String
    var id: String
    var title: String
}

enum GlancePhase {
    static let ended: Set<String> = ["done", "failed", "cancelled", "called", "no_answer", "not_connected"]
    static func needsYou(_ p: String) -> Bool { p == "needs_you" || p == "asking" }
    static func isEnded(_ p: String) -> Bool { ended.contains(p) }
    /// The glossary's word for the phase (Glance.strings, zh-Hans and en, the same as AMBIENT_WORDS).
    static func words(_ p: String) -> String { GlanceText.t("glance.phase.\(p)") }
}

enum GlanceText {
    static func t(_ key: String) -> String { NSLocalizedString(key, tableName: "Glance", bundle: .main, comment: "") }
}

/// Pebble's tokens for the glance (the same values as Ducter/Theme.swift's Pebble, apps/web
/// app.css and the Mac's theme; the widget extension can't see the app's Theme.swift).
enum GlanceTokens {
    static let paper = dynamic(0xFFF6EA, 0x17120E)
    static let surface = dynamic(0xFFFFFF, 0x231C16)
    static let ink = dynamic(0x2B2118, 0xF6EBDD)
    static let inkMuted = dynamic(0x75654F, 0xA8957E)
    static let accent = Color(UIColor(red: 1, green: 0x8A / 255, blue: 0x3D / 255, alpha: 1))
    static let ledge = dynamic(0xE0C9B0, 0x0D0A07)
    static let doneInk = dynamic(0x2F6B45, 0x9FD8B2)
    static let failedInk = dynamic(0x8A1F3B, 0xF8A9BC)

    private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { tc in
            let h = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((h >> 16) & 0xFF) / 255, green: CGFloat((h >> 8) & 0xFF) / 255, blue: CGFloat(h & 0xFF) / 255, alpha: 1)
        })
    }
}

/// The clay partner as a mark: a pebble with its eyes; at work its eyes look down; needs you adds
/// the soft clay dot at its shoulder (never red, never a number). The same mark as the Mac's menu bar.
struct GlanceMark: View {
    var phase: String
    var size: CGFloat = 22

    var body: some View {
        let working = !GlancePhase.needsYou(phase) && !GlancePhase.isEnded(phase) && phase != "waiting"
        ZStack(alignment: .topTrailing) {
            ZStack {
                Ellipse().fill(GlanceTokens.ink).frame(width: size, height: size * 0.84)
                HStack(spacing: size * 0.22) {
                    eye(working)
                    eye(working)
                }
                .offset(y: working ? size * 0.04 : -size * 0.02)
            }
            .frame(width: size, height: size)
            if GlancePhase.needsYou(phase) {
                Circle().fill(GlanceTokens.accent)
                    .frame(width: size * 0.36, height: size * 0.36)
                    .overlay(Circle().stroke(GlanceTokens.paper, lineWidth: size * 0.07))
                    .offset(x: size * 0.1, y: -size * 0.06)
            }
        }
        .accessibilityHidden(true)
    }

    private func eye(_ working: Bool) -> some View {
        Capsule().fill(GlanceTokens.paper)
            .frame(width: size * (working ? 0.17 : 0.12), height: size * (working ? 0.07 : 0.18))
    }
}

/// The phase as a word, in the accent only when it needs the person.
struct GlancePhaseText: View {
    var phase: String
    var body: some View {
        Text(GlancePhase.words(phase))
            .font(.system(.subheadline, design: .rounded).weight(.semibold))
            .foregroundStyle(GlancePhase.needsYou(phase) ? GlanceTokens.accent : phase == "failed" ? GlanceTokens.failedInk : GlanceTokens.ink)
    }
}

/// How long it has been in this phase, its own element (D291), or that it may be out of date.
struct GlanceSince: View {
    var state: GlanceAttributes.ContentState
    var stale: Bool
    var body: some View {
        if stale {
            Text(GlanceText.t("glance.stale")).foregroundStyle(GlanceTokens.inkMuted)
        } else if !GlancePhase.isEnded(state.phase) {
            Text(Date(timeIntervalSince1970: TimeInterval(state.since)), style: .relative)
                .monospacedDigit()
                .foregroundStyle(GlanceTokens.inkMuted)
        }
    }
}

/// The Lock Screen's card: the mark, the title (set on the phone), the phase and how long.
struct GlanceLockView: View {
    var attributes: GlanceAttributes
    var state: GlanceAttributes.ContentState
    var stale: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            GlanceMark(phase: state.phase, size: 34)
            VStack(alignment: .leading, spacing: 3) {
                Text(attributes.title)
                    .font(.system(.headline, design: .rounded).weight(.bold))
                    .foregroundStyle(GlanceTokens.ink)
                    .lineLimit(1)
                HStack(spacing: 10) {
                    GlancePhaseText(phase: state.phase)
                    GlanceSince(state: state, stale: stale).font(.subheadline)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
    }
}
