import UserNotifications

/// Opens a sealed notification (D159). Apple and the notification relay carried a neutral alert
/// ("Ducter needs you", from loc-keys) plus `d`, the words sealed by the home with this phone's
/// key; this puts the real title and text back, with where a tap goes and which decision Go /
/// Hold / Reply answer. If anything is off (no key yet, another Ducter's key, a bad seal), the
/// neutral alert shows as it came: a tap still opens the app.
final class NotificationService: UNNotificationServiceExtension {
    private var handler: ((UNNotificationContent) -> Void)?
    private var fallback: UNNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        handler = contentHandler
        fallback = request.content
        guard let sealed = request.content.userInfo["d"] as? String, let key = PushKey.read(),
              let m = PushCrypto.message(sealed, key: key),
              let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            return contentHandler(request.content)
        }
        content.title = m.title
        content.body = m.body
        var info = content.userInfo
        info.removeValue(forKey: "d")
        if let url = m.url { info["url"] = url }
        if let id = m.decisionId {
            info["decisionId"] = id
            content.categoryIdentifier = "DUCTER_DECISION"
            content.threadIdentifier = "decisions"
        } else if let tag = m.tag {
            content.threadIdentifier = String(tag.prefix(64))
        }
        content.userInfo = info
        contentHandler(content)
    }

    /// Out of time: show what Apple delivered rather than nothing.
    override func serviceExtensionTimeWillExpire() {
        if let handler, let fallback { handler(fallback) }
    }
}
