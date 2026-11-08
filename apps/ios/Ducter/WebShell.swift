import SafariServices
import SwiftUI
import WebKit

/// The phone client the main serves at /app, in a WKWebView. The page is the product (the same
/// code a browser gets); the app adds the bridge (window.ducterNative + messageHandlers.ducter):
/// APNs instead of Web Push, haptics, and the device token for notification buttons.
@MainActor
final class Shell: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    enum Phase: Equatable { case loading, ready, unreachable }
    @Published var phase: Phase = .loading
    let web: WKWebView
    private var loaded: URL?

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "Mobile/15E148 DucterApp/\(Native.version)"
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        let info = "window.ducterNative = Object.freeze({platform: 'ios', version: '\(Native.version)', bundleId: '\(Native.bundleId)', apnsEnv: '\(Native.apnsEnv)'});"
        config.userContentController.addUserScript(WKUserScript(source: info, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "ducter")
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = Pebble.uiBg
        web.scrollView.backgroundColor = Pebble.uiBg
        // The page lays itself out under the bars with env(safe-area-inset-*).
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.keyboardDismissMode = .interactive
        // The page's routes are history entries: an edge swipe goes back, as in any iPhone app.
        web.allowsBackForwardNavigationGestures = true
        web.allowsLinkPreview = false
        #if DEBUG
        web.isInspectable = true
        #endif
    }

    func load(_ url: URL) {
        guard url != loaded else { return }
        loaded = url
        phase = .loading
        web.load(URLRequest(url: url))
    }

    func retry() {
        let u = loaded
        loaded = nil
        if let u { load(u) }
    }

    /// A notification was tapped: go there (same document, so it's a hash change and no reload).
    func open(_ path: String) {
        guard let base = AppState.shared.base, let u = URL(string: path, relativeTo: base)?.absoluteURL else { return }
        if phase == .ready, web.url?.host == u.host {
            let js = "location.assign(\(jsString(u.absoluteString)))"
            web.evaluateJavaScript(js)
        } else {
            loaded = nil
            load(u)
        }
    }

    // MARK: navigation: this Ducter in the app, everything else in Safari

    private func isOurs(_ url: URL?) -> Bool {
        guard let url, let base = AppState.shared.base else { return false }
        return url.scheme == base.scheme && url.host == base.host && url.port == base.port
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if isOurs(url) || url.scheme == "about" { return .allow }
        openOutside(url)
        return .cancel
    }

    /// target=_blank links (a PR, a preview): never a second web view.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openOutside(url) }
        return nil
    }

    private func openOutside(_ url: URL) {
        if url.scheme == "http" || url.scheme == "https" {
            let vc = SFSafariViewController(url: url)
            vc.preferredControlTintColor = UIColor(hex: 0xFF8A3D)
            UIApplication.shared.topViewController?.present(vc, animated: true)
        } else {
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        withAnimation(.easeOut(duration: 0.25)) { phase = .ready }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        NSLog("[ducter] page failed to load: %@", (error as NSError).description)
        withAnimation(.easeOut(duration: 0.25)) { phase = .unreachable }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        retry()
    }

    // MARK: the bridge

    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        // Only this Ducter's own page, in the main frame, may talk to the app.
        guard message.frameInfo.isMainFrame, let base = AppState.shared.base, message.frameInfo.securityOrigin.host == base.host,
              let m = message.body as? [String: Any], let t = m["t"] as? String else { return (nil, "refused") }
        switch t {
        case "hello":
            if let token = m["token"] as? String, !token.isEmpty { Keychain.token = token }
            if let l = m["locale"] as? String { AppState.shared.locale = l }
            // Notifications were on before: make sure the main has this phone's current token.
            if AppState.shared.pushOn, let tok = AppState.shared.apnsToken { await API.subscribe(token: tok) }
            return (["ok": true], nil)
        case "haptic":
            Haptics.play(m["kind"] as? String ?? "light")
            return (nil, nil)
        case "push.state":
            return (["state": await AppDelegate.shared?.state() ?? "unsupported"], nil)
        case "push.enable":
            guard let d = AppDelegate.shared else { return (["state": "unsupported"], nil) }
            let r = await d.enable()
            var out: [String: Any] = ["state": r.state]
            if let tok = r.token { out["token"] = tok }
            return (out, nil)
        case "push.disable":
            AppState.shared.pushOn = false
            let tok = AppState.shared.apnsToken
            UIApplication.shared.unregisterForRemoteNotifications()
            AppState.shared.apnsToken = nil
            return (tok.map { ["token": $0] } ?? [:], nil)
        default:
            return (nil, "unknown")
        }
    }
}

private func jsString(_ s: String) -> String {
    let d = try! JSONSerialization.data(withJSONObject: [s])
    return String(String(data: d, encoding: .utf8)!.dropFirst().dropLast())
}

extension UIApplication {
    var topViewController: UIViewController? {
        var vc = connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }
}

struct WebShellView: UIViewRepresentable {
    @ObservedObject var shell: Shell
    func makeUIView(context: Context) -> WKWebView { shell.web }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
