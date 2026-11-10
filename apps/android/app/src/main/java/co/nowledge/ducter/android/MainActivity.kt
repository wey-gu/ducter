package co.nowledge.ducter.android

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ScriptHandler
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The Ducter Android app (D178): the phone client the home serves at /app, in a WebView. The page
 * is the product (the same code a browser gets); the app adds what a page can't do: remember which
 * Ducter it talks to, scan the pairing QR code, keep the page clear of the bars and the keyboard,
 * tell the page where a foldable's fold is (D182), and update itself from the release (D181).
 */
class MainActivity : ComponentActivity() {
    private lateinit var store: Store
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private var overlay: View? = null
    private lateinit var card: UpdateCard
    private lateinit var scanner: ActivityResultLauncher<ScanOptions>

    private var loaded: String? = null
    private var phase = "loading" // loading · ready · unreachable
    private var bridgeFor: String? = null
    private var docStart: ScriptHandler? = null
    private var fold: Fold? = null
    /** The fold in this window's pixels (start, end across it) when it runs top to bottom: a book. */
    private var bookPx: Pair<Int, Int>? = null
    private var helloed = false
    private val quietBusy = java.util.concurrent.atomic.AtomicBoolean(false)
    private var insets = IntArray(4) // top, right, bottom, left, in CSS px
    private var connect: ConnectView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        store = Store(this)
        scanner = registerForActivityResult(ScanContract()) { r -> r.contents?.let { connect?.take(it) } }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web = makeWebView()
        card = UpdateCard(this).apply { visibility = View.GONE }
        root = FrameLayout(this).apply {
            setBackgroundColor(Pebble.color(context, R.color.bg))
            addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            addView(card, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM))
        }
        setContentView(root)
        watchInsets()
        watchFold()
        watchUpdates()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // The page's routes are history entries: back goes up a level, as in any app.
                if (overlay == null && web.canGoBack()) web.goBack()
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        ShortcutManagerCompat.setDynamicShortcuts(this, listOf(
            ShortcutInfoCompat.Builder(this, "check-update")
                .setShortLabel(getString(R.string.update_check))
                .setIcon(IconCompat.createWithResource(this, R.mipmap.ic_launcher))
                .setIntent(Intent(ACTION_CHECK_UPDATE).setPackage(packageName))
                .build(),
        ))

        // Recreated (light/dark): the conversation again, never a pairing link already used.
        val start = (if (savedInstanceState == null) debugEntry(intent) else null) ?: store.base?.let { "${it}app" }
        if (start != null) load(start) else showConnect()
        if (intent?.action == ACTION_CHECK_UPDATE) checkNow()
        // The first launch on a version this app installed itself: say so once (D148's words).
        store.installing?.let { v ->
            store.installing = null
            if (Versions.compare(v, Updater.current(this)) == 0) Updater.set(UpdateState.Done(v))
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        debugEntry(intent)?.let { loaded = null; load(it) }
        if (intent.action == ACTION_CHECK_UPDATE) checkNow()
    }

    override fun onResume() {
        super.onResume()
        // Back from Android's "Install unknown apps" switch: carry on with the update.
        (Updater.state.value as? UpdateState.NeedsPermission)?.let { if (packageManager.canRequestPackageInstalls()) Updater.install(this, it.r, it.apk) }
        if (helloed || store.base == null) quietCheck()
    }

    // MARK: the page

    @SuppressLint("SetJavaScriptEnabled")
    private fun makeWebView() = WebView(this).apply {
        setBackgroundColor(Pebble.color(context, R.color.bg))
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        // The pairing names this phone "Android phone · Ducter" (apps/web/src/conn.ts deviceName).
        settings.userAgentString = "${settings.userAgentString} DucterApp/${BuildConfig.VERSION_NAME}"
        overScrollMode = View.OVER_SCROLL_NEVER
        webViewClient = Client()
        alpha = 0f
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
            val u = req.url
            if (isOurs(u) || u.scheme == "about") return false
            openOutside(u)
            return true
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            pushInsets()
            pushFold()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (phase == "unreachable") return
            phase = "ready"
            pushInsets()
            pushFold()
            web.animate().alpha(1f).setDuration(250).start()
            setOverlay(null)
            // The page says hello with its language first; a page from before the Android app
            // never does, so the update check goes ahead without it a moment later.
            root.postDelayed({ quietCheck() }, 3000)
        }

        override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
            if (!req.isForMainFrame) return
            android.util.Log.w("ducter", "page failed to load: ${err.errorCode} ${err.description}")
            phase = "unreachable"
            web.alpha = 0f
            val host = store.base?.let { Uri.parse(it).host } ?: ""
            setOverlay(unreachableView(this@MainActivity, host, retry = ::retry, other = ::forget))
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's process died (memory): a fresh web view, the same place.
            val at = loaded
            root.removeView(web)
            web.destroy()
            web = makeWebView()
            root.addView(web, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            bridgeFor = null
            loaded = null
            at?.let { load(it) }
            return true
        }
    }

    private fun isOurs(u: Uri): Boolean {
        val b = store.base?.let { Uri.parse(it) } ?: return false
        return u.scheme == b.scheme && u.host == b.host && u.port == b.port
    }

    /** Everything that isn't this Ducter opens outside: a PR, a preview, a doc. */
    private fun openOutside(u: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {}
    }

    private fun load(url: String) {
        if (url == loaded) return
        loaded = url
        phase = "loading"
        web.alpha = 0f
        setOverlay(loadingView(this))
        bridge()
        web.loadUrl(url)
    }

    private fun retry() {
        val u = loaded
        loaded = null
        u?.let { load(it) }
    }

    /** Back to the connect screen (another Ducter, or this one was unreachable). */
    private fun forget() {
        store.forget()
        loaded = null
        web.stopLoading()
        web.loadUrl("about:blank")
        web.clearHistory()
        showConnect()
    }

    private fun showConnect() {
        val v = ConnectView(this, scan = {
            scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setBeepEnabled(false).setOrientationLocked(false).setPrompt(""))
        }, connect = { t -> connect = null; load(store.connect(t)) })
        connect = v
        setOverlay(v)
    }

    private fun setOverlay(v: View?) {
        overlay?.let { root.removeView(it) }
        overlay = v
        if (v != null) {
            root.addView(v, 1, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            relayout()
        }
    }

    /** Debug builds: `adb shell am start -n <id>/…MainActivity --es pairLink '<link>'` (and `--es open 'app#onhand'`). */
    private fun debugEntry(i: Intent?): String? {
        if (!BuildConfig.DEBUG || i == null) return null
        i.getStringExtra("pairLink")?.let { PairTarget.parse(it) }?.let { return store.connect(it) }
        val b = store.base ?: return null
        return i.getStringExtra("open")?.let { b + it }
    }

    // MARK: the bridge (window.ducterNative + window.ducterBridge, as on iOS)

    /**
     * Only this Ducter's own page may talk to the app: the listener and the script that defines
     * window.ducterNative are both limited to its origin, and set again when the Ducter changes.
     */
    private fun bridge() {
        val origin = store.base?.let { PairTarget.origin(it) } ?: return
        if (origin == bridgeFor) return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        if (bridgeFor != null) WebViewCompat.removeWebMessageListener(web, "ducterAndroid")
        docStart?.remove()
        bridgeFor = origin
        WebViewCompat.addWebMessageListener(web, "ducterAndroid", setOf(origin)) { _, msg, _, isMain, reply -> if (isMain) onMessage(msg, reply) }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            docStart = WebViewCompat.addDocumentStartJavaScript(web, shim(), setOf(origin))
        }
    }

    private fun shim(): String {
        val info = JSONObject().put("platform", "android").put("version", Versions.bare(BuildConfig.VERSION_NAME)).put("appId", packageName)
        return """(()=>{const b=window.ducterAndroid;if(!b||window.ducterBridge)return;const p=new Map();let n=0;
b.onmessage=(e)=>{try{const d=JSON.parse(e.data);const f=p.get(d.id);if(!f)return;p.delete(d.id);d.error?f[1](new Error(d.error)):f[0](d.r)}catch{}};
window.ducterBridge=Object.freeze({postMessage:(m)=>new Promise((res,rej)=>{const id=++n;p.set(id,[res,rej]);b.postMessage(JSON.stringify({id,m}))})});
window.ducterNative=Object.freeze($info);})();"""
    }

    private fun onMessage(msg: WebMessageCompat, reply: JavaScriptReplyProxy) {
        val o = try { JSONObject(msg.data ?: return) } catch (_: Exception) { return }
        val id = o.optInt("id")
        val m = o.optJSONObject("m") ?: return
        fun answer(r: Any?) = reply.postMessage(JSONObject().put("id", id).put("r", r ?: JSONObject.NULL).toString())
        when (m.optString("t")) {
            "hello" -> {
                m.optString("locale").takeIf { it == "zh" || it == "en" }?.let { store.locale = it }
                m.optString("personaName").takeIf { it.isNotEmpty() }?.let { store.personaName = it }
                helloed = true
                pushInsets()
                pushFold()
                render(Updater.state.value)
                quietCheck()
                answer(JSONObject().put("ok", true))
            }
            "haptic" -> {
                web.performHapticFeedback(
                    when (m.optString("kind")) {
                        "success" -> HapticFeedbackConstants.CONFIRM
                        "warning" -> HapticFeedbackConstants.REJECT
                        else -> HapticFeedbackConstants.CLOCK_TICK
                    },
                )
                answer(null)
            }
            // Notifications on Android are not in this version (research/51 §5, D181 (4)): the
            // page says so in its own words ("notify.app.unavailable").
            "push.state", "push.enable" -> answer(JSONObject().put("state", "unsupported"))
            "push.disable" -> answer(JSONObject())
            "update.check" -> { checkNow(); answer(null) }
            "log" -> answer(null)
            else -> reply.postMessage(JSONObject().put("id", id).put("error", "unknown").toString())
        }
    }

    // MARK: insets: the bars, the cutout and the keyboard

    /**
     * The page draws edge to edge and keeps itself clear of the bars with its --safe-* variables;
     * the app sets them, because a WebView's env(safe-area-inset-*) can't be relied on across
     * Android versions (research/51 §6). The keyboard shrinks the web view (the page's viewport
     * says interactive-widget=resizes-content), so the composer stays above it.
     */
    private fun watchInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, wi ->
            val bars = wi.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = wi.getInsets(WindowInsetsCompat.Type.ime())
            val d = resources.displayMetrics.density
            val bottom = if (ime.bottom > 0) 0 else bars.bottom
            insets = intArrayOf((bars.top / d).toInt(), (bars.right / d).toInt(), (bottom / d).toInt(), (bars.left / d).toInt())
            (web.layoutParams as FrameLayout.LayoutParams).bottomMargin = ime.bottom
            web.requestLayout()
            card.setPadding(bars.left + Pebble.dp(this, 12), 0, bars.right + Pebble.dp(this, 12), maxOf(bars.bottom, ime.bottom) + Pebble.dp(this, 12))
            applyOverlayInsets(bars.top, bars.bottom, bars.left, bars.right)
            pushInsets()
            web.post { pushFold() }
            wi
        }
    }

    private var lastBars = IntArray(4)
    private fun applyOverlayInsets(top: Int = lastBars[0], bottom: Int = lastBars[1], left: Int = lastBars[2], right: Int = lastBars[3]) {
        lastBars = intArrayOf(top, bottom, left, right)
        // On a book, the app's own screens keep to one side of the fold (D182): connecting and
        // can't-reach in the half before it; the connect screen spreads over both (ConnectView.book).
        val b = bookPx
        val extra = if (b != null && overlay !is ConnectView) root.width - b.first else 0
        overlay?.setPadding(left, top, maxOf(right, extra), bottom)
    }

    /** Places the app's own screens and the update card by the fold (D182). */
    private fun relayout() {
        val b = bookPx
        (overlay as? ConnectView)?.book(b)
        applyOverlayInsets()
        val lp = card.layoutParams as FrameLayout.LayoutParams
        // The update card stands in the half past the fold, where On hand is, never across it.
        if (b != null) {
            lp.width = root.width - b.second
            lp.gravity = Gravity.BOTTOM or Gravity.END
        } else {
            lp.width = MATCH_PARENT
            lp.gravity = Gravity.BOTTOM
        }
        card.layoutParams = lp
    }

    private fun pushInsets() {
        val (t, r, b, l) = insets.toList()
        js("(()=>{const e=document.documentElement;if(!e)return;const s=e.style;s.setProperty('--safe-top','${t}px');s.setProperty('--safe-right','${r}px');s.setProperty('--safe-bottom','${b}px');s.setProperty('--safe-left','${l}px')})()")
    }

    // MARK: the fold (D182)

    private fun watchFold() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                WindowInfoTracker.getOrCreate(this@MainActivity).windowLayoutInfo(this@MainActivity).collect { info ->
                    val f = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
                    fold = f?.let { ff ->
                        val loc = IntArray(2).also { web.getLocationInWindow(it) }
                        val b = ff.bounds
                        val d = resources.displayMetrics.density
                        bookPx = if (ff.orientation == FoldingFeature.Orientation.VERTICAL && b.left / d >= 320 && (root.width - b.right) / d >= 320) b.left to b.right else null
                        Fold.of(
                            bounds = intArrayOf(b.left, b.top, b.right, b.bottom),
                            vertical = ff.orientation == FoldingFeature.Orientation.VERTICAL,
                            halfOpened = ff.state == FoldingFeature.State.HALF_OPENED,
                            separating = ff.isSeparating,
                            occluding = ff.occlusionType == FoldingFeature.OcclusionType.FULL,
                            web = intArrayOf(loc[0], loc[1], web.width, web.height),
                            density = resources.displayMetrics.density,
                        )
                    }
                    if (f == null) bookPx = null
                    relayout()
                    pushFold()
                }
            }
        }
    }

    /** window.ducterFold (null: no fold across the page) and a `ducterfold` event; apps/web/src/fold.ts. */
    private fun pushFold() {
        js("window.ducterFold=${fold?.json() ?: "null"};dispatchEvent(new Event('ducterfold'))")
    }

    private fun js(s: String) {
        if (loaded == null) return
        web.evaluateJavascript(s, null)
    }

    // MARK: updates (D181)

    private fun quietCheck() {
        if (System.currentTimeMillis() - store.lastCheck < Updater.EVERY_MS) return
        if (Updater.state.value !is UpdateState.Idle && Updater.state.value !is UpdateState.Current) return
        if (!quietBusy.compareAndSet(false, true)) return
        // Quiet: only a newer version that wasn't put off is shown; nothing else says a word.
        lifecycleScope.launch {
            try {
                Updater.check(this@MainActivity, store, quiet = true)
            } finally {
                quietBusy.set(false)
            }
        }
    }

    private var asked = false
    private fun checkNow() {
        asked = true
        lifecycleScope.launch { Updater.check(this@MainActivity, store) }
    }

    private fun watchUpdates() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                Updater.state.collect { render(it) }
            }
        }
    }

    private fun lines(r: Release): List<String> = r.notes[store.locale] ?: emptyList()

    /** The card speaks the page's language (its hello says which), else the phone's. */
    private var words: Pair<String, android.content.res.Resources>? = null
    private fun str(id: Int, vararg a: Any): String {
        val l = store.locale
        val r = words?.takeIf { it.first == l }?.second ?: createConfigurationContext(
            android.content.res.Configuration(resources.configuration).apply { setLocale(java.util.Locale.forLanguageTag(l)) },
        ).resources.also { words = l to it }
        return r.getString(id, *a)
    }

    private fun render(s: UpdateState) {
        val c = card
        fun hide() { c.visibility = View.GONE }
        c.later.setOnClickListener {
            (Updater.state.value as? UpdateState.Available)?.r?.let { store.laterVersion = it.version; store.laterAt = System.currentTimeMillis() }
            asked = false
            Updater.set(UpdateState.Idle)
        }
        when (s) {
            UpdateState.Idle -> hide()
            UpdateState.Checking -> if (asked) c.show(str(R.string.update_checking), emptyList(), null, null, null) else hide()
            UpdateState.Current -> {
                if (!asked) return hide()
                c.show(str(R.string.update_current), emptyList(), Versions.bare(BuildConfig.VERSION_NAME), null, null)
                c.postDelayed({ if (Updater.state.value == UpdateState.Current) { asked = false; Updater.set(UpdateState.Idle) } }, 2500)
            }
            is UpdateState.Available -> {
                c.show(str(R.string.update_available, s.r.version), lines(s.r), null, str(R.string.update_button), str(R.string.update_later))
                c.go.setOnClickListener { lifecycleScope.launch { Updater.download(this@MainActivity, s.r) } }
            }
            is UpdateState.Downloading -> c.show(str(R.string.update_available, s.r.version), lines(s.r), str(R.string.update_downloading, s.r.version, s.pct), null, null)
            is UpdateState.Verifying -> c.show(str(R.string.update_available, s.r.version), lines(s.r), str(R.string.update_verifying, s.r.version), null, null)
            is UpdateState.Installing -> c.show(str(R.string.update_available, s.r.version), lines(s.r), str(R.string.update_installing, s.r.version), null, null)
            is UpdateState.NeedsPermission -> {
                c.show(str(R.string.update_available, s.r.version), emptyList(), str(R.string.update_allow), str(R.string.update_allow_go), str(R.string.update_later))
                c.go.setOnClickListener {
                    startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                }
            }
            is UpdateState.Done -> {
                c.show(str(R.string.update_done, s.version), emptyList(), null, null, null)
                c.postDelayed({ if (Updater.state.value == s) Updater.set(UpdateState.Idle) }, 3000)
            }
            is UpdateState.Failed -> {
                if (s.r == null && !asked) return hide()
                val why = str(
                    when (s.why) {
                        Why.NETWORK -> R.string.update_why_network
                        Why.CHECKSUM -> R.string.update_why_checksum
                        Why.NO_ASSET -> R.string.update_why_no_asset
                        Why.SIGNATURE -> R.string.update_why_signature
                        Why.INSTALL -> R.string.update_failed
                    },
                )
                c.show(str(R.string.update_failed), emptyList(), why, str(R.string.retry), str(R.string.update_later))
                c.go.setOnClickListener { if (s.r != null) lifecycleScope.launch { Updater.download(this@MainActivity, s.r) } else checkNow() }
                c.later.setOnClickListener { asked = false; Updater.set(UpdateState.Idle) }
            }
        }
        if (s !is UpdateState.Idle && c.visibility != View.VISIBLE && (s !is UpdateState.Checking || asked)) {
            c.visibility = View.VISIBLE
            c.translationY = Pebble.dp(this, 40).toFloat()
            c.alpha = 0f
            c.animate().translationY(0f).alpha(1f).setDuration(220).start()
        }
    }

    companion object {
        const val ACTION_CHECK_UPDATE = "co.nowledge.ducter.CHECK_UPDATE"
    }
}
