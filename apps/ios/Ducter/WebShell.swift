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

    /// D206: the page opens from the web view's cache when it has one (no round trip to the home
    /// before the first frame; its code and styles are named by content, so they come from the
    /// cache too), and paints the last screen it kept. Once caught up it asks the home for the page
    /// again and loads the newer one if it changed (app.ts checkBuild); a home it can't reach says
    /// so through the bridge ("reach"), and Try again goes to the network.
    func load(_ url: URL, fresh: Bool = false) {
        guard url != loaded else { return }
        loaded = url
        phase = .loading
        welcomed = false
        cacheFirst = !fresh && UserDefaults.standard.bool(forKey: Shell.namedKey(url))
        web.load(URLRequest(url: url, cachePolicy: cacheFirst ? .returnCacheDataElseLoad : .useProtocolCachePolicy))
    }

    /// The page in this load came from the cache first (D206).
    private var cacheFirst = false

    func retry() {
        let u = loaded
        loaded = nil
        if let u { load(u, fresh: true) }
    }

    /// The page has heard from its home since it loaded (the reach message).
    private var welcomed = false

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
        // D206: only a page that names its code by content (?v=) checks itself against the home, so
        // only such a home's page opens from the cache next time. A cached page that doesn't (from
        // before, or an older home) is loaded again from the network now.
        let fromCache = cacheFirst
        webView.evaluateJavaScript("!!document.querySelector('script[src*=\"app.js?v=\"]')") { [weak self] r, _ in
            guard let self, let url = self.loaded else { return }
            let named = (r as? Bool) ?? false
            UserDefaults.standard.set(named, forKey: Shell.namedKey(url))
            if fromCache && !named {
                self.loaded = nil
                self.load(url, fresh: true)
            }
        }
        // A page from the cache is laid out before WebKit hands it the safe-area insets: its first
        // frame would draw under the status bar and jump a moment later. Show it once the page's
        // env(safe-area-inset-top) has caught up with the view's (a few frames at most).
        if fromCache { revealWhenInset(tries: 20) } else { show() }
    }

    private func show() {
        guard phase == .loading else { return }
        withAnimation(.easeOut(duration: 0.25)) { phase = .ready }
    }

    private func revealWhenInset(tries: Int) {
        let want = web.safeAreaInsets.top
        guard tries > 0, want > 0 else { return show() }
        let probe = "(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)';document.documentElement.appendChild(d);const v=parseFloat(getComputedStyle(d).paddingTop)||0;d.remove();return v})()"
        web.evaluateJavaScript(probe) { [weak self] r, _ in
            guard let self else { return }
            // Caught up: one more frame, so what's painted is laid out with them too.
            if let v = r as? Double, v >= Double(want) - 0.5 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self.show() }
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { self.revealWhenInset(tries: tries - 1) }
        }
    }

    private static func namedKey(_ url: URL) -> String { "pageNamed:\(url.scheme ?? "")://\(url.host ?? ""):\(url.port ?? 0)" }

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
            // D200: the page is up and paired; is its home older than this app?
            Task { await HomeCheck.shared.check() }
            return (["ok": true], nil)
        case "reach":
            // D206: a page opened from the cache whose home never answered: the can't-reach screen,
            // as when the page itself couldn't load. Once it has answered, the page says offline itself.
            let ok = m["ok"] as? Bool ?? true
            if ok { welcomed = true } else if !welcomed, phase == .ready {
                withAnimation(.easeOut(duration: 0.25)) { phase = .unreachable }
            }
            return (nil, nil)
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
