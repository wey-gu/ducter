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
    /// D305: hold to talk and read aloud (Voice.swift); events go to window.ducterVoice.
    private lazy var voice: Voice = {
        let v = Voice()
        v.emit = { [weak self] e in
            guard let self, let d = try? JSONSerialization.data(withJSONObject: e), let js = String(data: d, encoding: .utf8) else { return }
            self.web.evaluateJavaScript("window.ducterVoice && window.ducterVoice(\(js))")
        }
        return v
    }()

    /// D317: phone, tablet or foldable, from the idiom and the screen's size classes.
    static func shape(idiom: UIUserInterfaceIdiom = UIDevice.current.userInterfaceIdiom, traits: UITraitCollection = UIScreen.main.traitCollection) -> String {
        if idiom == .pad { return "tablet" }
        return traits.horizontalSizeClass == .regular && traits.verticalSizeClass == .regular ? "foldable" : "phone"
    }

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        // D317: the shape from the screen's own size class, not the model name: an iPhone Duo's inner screen
        // is regular both ways (research/111); an iPhone-idiom screen like that can only be a fold opened.
        config.applicationNameForUserAgent = "Mobile/15E148 DucterApp/\(Native.version) DucterShape/\(Shell.shape())"
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        // D176: on an iPad too, the page as it is, laid out from the width it has (WebKit would
        // otherwise ask for it as a Mac's desktop page, and the pairing would name a "Browser").
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        let info = "window.ducterNative = Object.freeze({platform: 'ios', version: '\(Native.version)', bundleId: '\(Native.bundleId)', apnsEnv: '\(Native.apnsEnv)', voice: 1});"
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
        fitText(force: true)
        NotificationCenter.default.addObserver(forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.fitText() }
        }
    }

    // MARK: D447, D452: the system's text size

    /// iOS's body size at each text size (Apple's Dynamic Type table, Body style).
    private static let bodySize: [UIContentSizeCategory: CGFloat] = [
        .extraSmall: 14, .small: 15, .medium: 16, .large: 17, .extraLarge: 19, .extraExtraLarge: 21, .extraExtraExtraLarge: 23,
        .accessibilityMedium: 28, .accessibilityLarge: 33, .accessibilityExtraLarge: 40, .accessibilityExtraExtraLarge: 47, .accessibilityExtraExtraExtraLarge: 53,
    ]

    /// D452: the page's type is in rem, so the app follows the person's text size by setting the
    /// page's root size (`--text-scale`, a factor over the browser's 16px): every word grows with
    /// iOS's body text across the whole range, up to the largest accessibility size (53 / 17, x3.12),
    /// and the rows that hold words grow with them; the layout keeps the screen's width. Smaller
    /// sizes stay at 1 (the page's sizes are already the smallest it reads well at). D447 scaled
    /// the text with `-webkit-text-size-adjust` and stopped at 135%, where fixed-height pills held;
    /// `pageZoom` magnifies the page past the screen instead of laying it out again.
    static func textScale(_ c: UIContentSizeCategory) -> Double {
        let want = Double(bodySize[c] ?? 17) / 17
        return (max(want, 1) * 100).rounded() / 100
    }

    /// The script that sets it: at document start (the first frame is already at the size) and on a change.
    static func textScript(_ s: Double) -> String {
        #if DEBUG
        // `-textAdjust YES` (Debug only): D447's way at the same factor, to compare the two in the Simulator.
        if UserDefaults.standard.bool(forKey: "textAdjust") {
            let p = Int((s * 100).rounded())
            return "(()=>{let e=document.getElementById('ducter-text-adjust');if(!e){e=document.createElement('style');e.id='ducter-text-adjust';document.documentElement.appendChild(e)}e.textContent='html,body,.code{-webkit-text-size-adjust:\(p)% !important}'})()"
        }
        #endif
        // The page marks the largest sizes itself (`window.ducterTextSize`, once it has loaded).
        return "document.documentElement.style.setProperty('--text-scale','\(s)');window.ducterTextSize&&window.ducterTextSize()"
    }

    private var textScaleSent = 0.0
    private var textUserScript: WKUserScript?

    /// Called at start and when the text size changes; the page's next load starts at it too.
    func fitText(force: Bool = false) {
        let s = Shell.textScale(UIApplication.shared.preferredContentSizeCategory)
        guard force || s != textScaleSent else { return }
        textScaleSent = s
        let js = Shell.textScript(s)
        let ucc = web.configuration.userContentController
        let kept = ucc.userScripts.filter { $0 !== textUserScript }
        ucc.removeAllUserScripts()
        kept.forEach(ucc.addUserScript)
        let us = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        ucc.addUserScript(us)
        textUserScript = us
        web.evaluateJavaScript(js)
    }

    /// D209: the page opens from the web view's cache when it has one (no round trip to the home
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

    /// The page in this load came from the cache first (D209).
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

    // MARK: navigation: this Ducter in the app, everything else on the phone (D384)

    private func isOurs(_ url: URL?) -> Bool {
        guard let url, let base = AppState.shared.base else { return false }
        return url.scheme == base.scheme && url.host == base.host && url.port == base.port
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if isOurs(url) || url.scheme == "about" { return .allow }
        // A frame inside the page (the workbench's preview of a task's own site) loads in place.
        if let frame = action.targetFrame, !frame.isMainFrame, url.scheme == "http" || url.scheme == "https" { return .allow }
        openOutside(url)
        return .cancel
    }

    /// target=_blank links (a PR, a preview): never a second web view.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openOutside(url) }
        return nil
    }

    /// D384: a link that isn't this Ducter goes to the phone, never a sheet inside the app. The
    /// system hands a universal link (github.com, a doc, a calendar) to its own app when the person
    /// has it, else to their default browser: both are where they are signed in. An in-app Safari
    /// sheet keeps cookies of its own, so a private repo's page there is a 404.
    private func openOutside(_ url: URL) {
        UIApplication.shared.open(url)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // D209: only a page that names its code by content (?v=) checks itself against the home, so
        // only such a home's page opens from the cache next time. A cached page that doesn't (from
        // before, or an older home) is loaded again from the network now.
        let fromCache = cacheFirst
        fitText(force: true)
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
            // D293: what a page at another of the home's addresses needs to be this same device.
            if let d = m["deviceId"] as? String, !d.isEmpty { AppState.shared.deviceId = d }
            if let n = m["name"] as? String, !n.isEmpty { AppState.shared.deviceName = n }
            // Notifications were on before: make sure the main has this phone's current token.
            if AppState.shared.pushOn, let tok = AppState.shared.apnsToken { await API.subscribe(token: tok) }
            // D200: the page is up and paired; is its home older than this app?
            Task { await HomeCheck.shared.check() }
            return (["ok": true], nil)
        case "reach":
            // D209: a page opened from the cache whose home never answered: the can't-reach screen,
            // as when the page itself couldn't load. Once it has answered, the page says offline itself.
            let ok = m["ok"] as? Bool ?? true
            if ok { welcomed = true } else if !welcomed, phase == .ready {
                withAnimation(.easeOut(duration: 0.25)) { phase = .unreachable }
            }
            return (nil, nil)
        case "ways":
            // D293: the home's ways and key; the fingerprint is kept from the first one (or the link).
            if let list = m["ways"] as? [[String: Any]] {
                AppState.shared.ways = list.compactMap { w in
                    guard let k = w["kind"] as? String, let u = w["url"] as? String else { return nil }
                    return Way(kind: k, url: u, primary: w["primary"] as? Bool)
                }
            }
            if AppState.shared.fp == nil, let fp = m["fp"] as? String, !fp.isEmpty { AppState.shared.fp = fp }
            return (nil, nil)
        case "device":
            // D293: the page opened at another of the home's addresses has empty storage.
            guard let tok = Keychain.token, let id = AppState.shared.deviceId else { return ([:], nil) }
            return (["token": tok, "deviceId": id, "name": AppState.shared.deviceName ?? "", "personaName": AppState.shared.personaName], nil)
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
        case "glance.shown":
            // D306: which tasks and calls are on the Lock Screen now; off: the page shows no switch.
            return (["on": GlanceLive.enabled, "shown": GlanceLive.shown()], nil)
        case "glance.start":
            guard let kind = m["kind"] as? String, let id = m["id"] as? String, let title = m["title"] as? String, let phase = m["phase"] as? String else { return (nil, "invalid") }
            return (await GlanceLive.start(kind: kind, id: id, title: title, phase: phase, since: m["since"] as? Int ?? Int(Date().timeIntervalSince1970)), nil)
        case "glance.update":
            if let kind = m["kind"] as? String, let id = m["id"] as? String, let phase = m["phase"] as? String {
                await GlanceLive.update(kind: kind, id: id, phase: phase, since: m["since"] as? Int ?? Int(Date().timeIntervalSince1970))
            }
            return (nil, nil)
        case "glance.end":
            if let kind = m["kind"] as? String, let id = m["id"] as? String { await GlanceLive.end(kind: kind, id: id) }
            return (nil, nil)
        case "push.disable":
            AppState.shared.pushOn = false
            let tok = AppState.shared.apnsToken
            UIApplication.shared.unregisterForRemoteNotifications()
            AppState.shared.apnsToken = nil
            await Relay.drop()
            return (tok.map { ["token": $0] } ?? [:], nil)
        case "voice.can", "voice.start", "voice.stop", "voice.cancel", "voice.settings", "speak", "speak.stop":
            return (await voice.handle(t, m), nil)
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
        let v = Host()
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
        (v as? Host)?.fit()
    }

    /// D447: the web view ends where the keyboard begins, as a messaging app's own view does.
    /// WebKit otherwise lays the keyboard over the page and pans the whole page up to show the
    /// composer, which took the header off the top and drew the conversation under the status bar
    /// (seen in the Simulator). Resized, the page lays itself out on what is left (its 100% is the
    /// space above the keyboard, its bottom inset 0), the way Android's resizes-content does, and a
    /// sheet's field stays above the keyboard with no help from the page.
    final class Host: UIView {
        private var keyboardTop: CGFloat?

        override init(frame: CGRect) {
            super.init(frame: frame)
            NotificationCenter.default.addObserver(self, selector: #selector(keyboard(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(keyboard(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
        }

        required init?(coder: NSCoder) { fatalError("not from a storyboard") }

        @objc private func keyboard(_ n: Notification) {
            guard let end = (n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue, let window else { return }
            let screen = window.screen.bounds
            // Hidden, or a hardware keyboard's bar only (an iPad's floating keyboard is not docked).
            let docked = n.name != UIResponder.keyboardWillHideNotification && end.minY < screen.maxY - 1 && end.maxY >= screen.maxY - 1 && end.width >= screen.width - 1
            keyboardTop = docked ? convert(end, from: nil).minY : nil
            let duration = (n.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
            let curve = (n.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? 7
            UIView.animate(withDuration: duration, delay: 0, options: UIView.AnimationOptions(rawValue: curve << 16)) { self.fit() }
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            fit()
        }

        func fit() {
            guard let web = subviews.first(where: { $0 is WKWebView }) as? WKWebView else { return }
            let h = keyboardTop.map { min(bounds.height, max(0, $0)) } ?? bounds.height
            let f = CGRect(x: 0, y: 0, width: bounds.width, height: h)
            if web.frame != f { web.frame = f }
            // Nothing for WebKit to pan: the page fits above the keyboard.
            if web.scrollView.contentOffset != .zero, keyboardTop != nil { web.scrollView.contentOffset = .zero }
        }
    }
}
