import ActivityKit
import SwiftUI
import WidgetKit

/// D306: the DucterLive widget extension. It only draws the Live Activities the app starts
/// (LiveShared/Glance.swift); it has no home widgets.
@main
struct DucterLiveBundle: WidgetBundle {
    var body: some Widget {
        GlanceActivity()
    }
}

struct GlanceActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GlanceAttributes.self) { context in
            GlanceLockView(attributes: context.attributes, state: context.state, stale: context.isStale)
                .activityBackgroundTint(GlanceTokens.paper)
                .activitySystemActionForegroundColor(GlanceTokens.ink)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    GlanceMark(phase: s.phase, size: 30).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title)
                        .font(.system(.headline, design: .rounded).weight(.bold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    GlancePhaseText(phase: s.phase).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    GlanceSince(state: s, stale: context.isStale).font(.footnote)
                }
            } compactLeading: {
                GlanceMark(phase: s.phase, size: 18)
            } compactTrailing: {
                // Only the phase's word when it needs you or ended; otherwise how long, quietly.
                if GlancePhase.needsYou(s.phase) || GlancePhase.isEnded(s.phase) {
                    Text(GlancePhase.words(s.phase))
                        .font(.system(.caption, design: .rounded).weight(.semibold))
                        .foregroundStyle(GlancePhase.needsYou(s.phase) ? GlanceTokens.accent : .white)
                } else {
                    Text(Date(timeIntervalSince1970: TimeInterval(s.since)), style: .timer)
                        .monospacedDigit()
                        .font(.caption)
                        .frame(maxWidth: 44)
                }
            } minimal: {
                GlanceMark(phase: s.phase, size: 16)
            }
            .keylineTint(GlancePhase.needsYou(s.phase) ? GlanceTokens.accent : nil)
        }
    }
}
