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
        // D176: on an iPad too, the page as it is, laid out from the width it has (WebKit would
        // otherwise ask for it as a Mac's desktop page, and the pairing would name a "Browser").
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        let info = "window.ducterNative = Object.freeze({platform: 'ios', version: '\(Native.version)', bundleId: '\(Native.bundleId)', apnsEnv: '\(Native.apnsEnv)'});"
        config.userContentController.addUserScript(WKUserScript(source: info, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        // Page errors and warnings in the app's log (`xcrun simctl spawn booted log stream`).
        let relay = "(()=>{const s=(k,a)=>{try{window.webkit.messageHandlers.ducter.postMessage({t:'log',k,m:a.map(String).join(' ')})}catch{}};for(const k of ['error','warn']){const o=console[k];console[k]=(...a)=>{s(k,a);o.apply(console,a)}};addEventListener('error',e=>s('error',[e.message,e.filename+':'+e.lineno]));addEventListener('unhandledrejection',e=>s('error',['unhandled',e.reason&&e.reason.stack||e.reason]))})();"
        config.userContentController.addUserScript(WKUserScript(source: relay, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #endif
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

    /// A menu command or its hardware-keyboard shortcut (D176): the page does it (`A.command`).
    func command(_ name: String) {
        guard phase == .ready else { return }
        web.evaluateJavaScript("window.ducterCommand && window.ducterCommand(\(jsString(name)))")
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
            if let n = m["personaName"] as? String, !n.isEmpty, n != AppState.shared.personaName { AppState.shared.personaName = n }
            // Notifications were on before: make sure the main has this phone's current token.
            if AppState.shared.pushOn, let tok = AppState.shared.apnsToken { await API.subscribe(token: tok) }
            return (["ok": true], nil)
        case "log":
            NSLog("[ducter page] %@: %@", m["k"] as? String ?? "", m["m"] as? String ?? "")
            return (nil, nil)
        case "haptic":
            Haptics.play(m["kind"] as? String ?? "light")
            return (nil, nil)
        case "push.state":
            return (["state": await AppDelegate.shared?.state() ?? "unsupported"], nil)
        case "push.enable":
            guard let d = AppDelegate.shared else { return (["state": "unsupported"], nil) }
            let r = await d.enable()
            var out: [String: Any] = ["state": r.state]
            if let tok = r.token {
                out["token"] = tok
                // D159: what the page hands its home: token, relay handle, the phone's key.
                out["apns"] = await API.subscription(token: tok)
                if Relay.unreachable { out["relay"] = "unreachable" }
            }
            return (out, nil)
        case "push.disable":
            AppState.shared.pushOn = false
            let tok = AppState.shared.apnsToken
            UIApplication.shared.unregisterForRemoteNotifications()
            AppState.shared.apnsToken = nil
            await Relay.drop()
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

/// The one web view, in a container SwiftUI may rebuild freely: whichever container is on
/// screen adopts it (handing SwiftUI the web view itself let a torn-down host detach it, and a
/// detached WKWebView keeps running its page but stops painting).
struct WebShellView: UIViewRepresentable {
    @ObservedObject var shell: Shell
    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.backgroundColor = Pebble.uiBg
        adopt(into: v)
        return v
    }
    func updateUIView(_ v: UIView, context: Context) { adopt(into: v) }
    private func adopt(into v: UIView) {
        guard shell.web.superview !== v else { return }
        shell.web.removeFromSuperview()
        shell.web.frame = v.bounds
        shell.web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        v.addSubview(shell.web)
    }
}
