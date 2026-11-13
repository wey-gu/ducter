package co.nowledge.ducter.android

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.Process
import android.provider.Settings
import android.util.Base64
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * D238: 用这台手机 / Use this phone. The person's own phone, lent to one task at a time.
 *
 * Android's accessibility service (HandsetService) is switched on once, in Android's own settings,
 * with the guide the page draws; from then on it is bound by the system but does nothing at all
 * until the home starts a loan (`start`, after the person said yes on a card). While a loan is on,
 * the pill (HandsetPill) sits in the status bar: whose task, what it is doing, 停下 / Stop. Every
 * method but state/start/stop refuses outside the loan it names, on this side too.
 *
 * The page relays the home's calls (handset_req over its own socket) through the app's bridge:
 * MainActivity hands each to [call] and posts the answer back.
 *
 * D253, the loan's life on this side: the loan ends here by itself, and says why, when the person
 * taps Stop, locks the phone (locking gives it back), Android's switch goes off, or the home says
 * nothing for 15 s (it beats every few seconds while lent); a step that arrives after its deadline
 * never runs. While lent in the task's turn the pill keeps the screen on, so only the person's own
 * lock ends it, never the screen timing out while the task thinks.
 */
object Handset {
    /** 2 (D253): ends a loan by itself and says why; beats; refuses late steps. */
    const val BRIDGE = 2

    @Volatile var service: HandsetService? = null
        internal set
    /** The loan: the task's id, its title, and whose turn it is. */
    @Volatile var session: String? = null
        private set
    var task: String = ""
        private set
    var turn: String = "agent"
        private set
    /** The guide sent the person to Android's settings: come back when the switch is on. */
    @Volatile var returning = false
    /** Tells the page something changed (MainActivity sets it). */
    @Volatile var listener: ((JSONObject) -> Unit)? = null
    /** D253: the last loan this phone ended by itself, and why (said on every hello). */
    @Volatile var ended: Pair<String, String>? = null
        private set
    /** D253: when the home last said anything about the loan (elapsed ms), and its clock minus ours. */
    @Volatile private var heard = 0L
    @Volatile private var skew = 0L
    @Volatile private var skewKnown = false

    private val main = Handler(Looper.getMainLooper())

    fun component(c: Context) = ComponentName(c, HandsetService::class.java)

    /** The switch in Android's settings is on (whether or not the service has connected yet). */
    fun enabled(c: Context): Boolean {
        val am = c.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val me = component(c).flattenToString()
        val on = am.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { it.id == me || it.resolveInfo?.serviceInfo?.let { s -> ComponentName(s.packageName, s.name).flattenToString() == me } == true }
        if (on) return true
        val list = Settings.Secure.getString(c.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return list.split(':').any { ComponentName.unflattenFromString(it) == component(c) }
    }

    /**
     * Android 13+ keeps a sideloaded app's accessibility switch greyed out ("restricted setting")
     * until the person allows it in App info (research/74 §2). What this app can know of it:
     *  - "none": not restricted: an older Android, installed by a store, or Ducter's switch has been
     *    on before on this install (allowing lasts until it is uninstalled);
     *  - "blocked" / "seen": the app op, where Android lets an app read its own (it says whether the
     *    block was met, so App info's ⋮ has Allow); Android 16 refuses that read (verified on the
     *    emulator, D246), so on most phones this is never said;
     *  - "maybe": installed from a downloaded or local file (what Android restricts), the op unread;
     *  - null: can't tell (a self-update, adb, another installer).
     * The guide asks Allow first whenever it isn't "none", and moves on by the person's visits.
     */
    fun restriction(c: Context): String? {
        if (Build.VERSION.SDK_INT < 33) return "none"
        if (Store(c).handsetWasOn) return "none"
        try {
            val ops = c.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            when (ops.unsafeCheckOpNoThrow("android:access_restricted_settings", Process.myUid(), c.packageName)) {
                AppOpsManager.MODE_ALLOWED -> return "none"
                AppOpsManager.MODE_IGNORED -> return "seen"
                AppOpsManager.MODE_ERRORED -> return "blocked"
            }
        } catch (_: Exception) {
            // Android 16: "verifyIncomingOp: uid … does not have any of {MANAGE_APPOPS, …}".
        }
        return try {
            when (c.packageManager.getInstallSourceInfo(c.packageName).packageSource) {
                android.content.pm.PackageInstaller.PACKAGE_SOURCE_LOCAL_FILE,
                android.content.pm.PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE -> "maybe"
                android.content.pm.PackageInstaller.PACKAGE_SOURCE_STORE -> "none"
                else -> null
            }
        } catch (_: Exception) {
            null
        }
    }

    fun state(c: Context): JSONObject = JSONObject()
        .put("bridge", BRIDGE)
        // D253: what the home may know of why the phone doesn't answer: its screen, its lock, Android's background limit.
        .put("awake", (c.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive)
        .put("locked", (c.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked)
        .apply { if (Build.VERSION.SDK_INT >= 28) put("limited", (c.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).isBackgroundRestricted) }
        .apply { ended?.let { (s, why) -> put("ended", JSONObject().put("session", s).put("why", why)) } }
        .put("sdk", Build.VERSION.SDK_INT)
        .put("model", Build.MODEL ?: "")
        .put("service", (service != null && enabled(c)).also { if (it) Store(c).handsetWasOn = true })
        .apply {
            when (restriction(c)) {
                "none" -> put("restricted", false)
                "maybe" -> put("restricted", true)
                "blocked" -> put("restricted", true).put("seen", false)
                "seen" -> put("restricted", true).put("seen", true)
            }
        }
        .put("pictures", Build.VERSION.SDK_INT >= 30)
        .apply { session?.let { put("session", it) } }

    internal fun changed(c: Context) {
        val s = state(c)
        main.post { listener?.invoke(JSONObject().put("state", s)) }
    }

    /** Opens the right page of Android's settings for a step of the guide. */
    fun openSettings(c: Context, step: String): Boolean {
        returning = true
        val intents = when (step) {
            // App info, where ⋮ › Allow restricted settings is (Android 13+, once the block was seen).
            "restricted" -> listOf(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", c.packageName, null)))
            // Accessibility, scrolled to Ducter's row and lit (ACCESSIBILITY_DETAILS_SETTINGS, which
            // would open Ducter's own page, is a system API: research/74 §2.4).
            else -> listOf(
                Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                    val key = component(c).flattenToString()
                    putExtra(":settings:fragment_args_key", key)
                    putExtra(":settings:show_fragment_args", Bundle().apply { putString(":settings:fragment_args_key", key) })
                },
            )
        }
        for (i in intents) {
            try {
                c.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (_: Exception) {
            }
        }
        returning = false
        return false
    }

    /**
     * One call from the home. `done` gets {ok, result} or {ok:false, error}; it is called on the
     * main thread, once.
     */
    fun call(c: Context, m: String, a: JSONObject, done: (JSONObject) -> Unit) {
        fun ok(r: Any? = JSONObject()) = done(JSONObject().put("ok", true).put("result", r ?: JSONObject.NULL))
        fun no(e: String) = done(JSONObject().put("ok", false).put("error", e))
        if (m == "state") return ok(state(c))
        val s = service ?: return no("Android's switch for Ducter is off on this phone: the person turns it on again on this phone's card (用这台手机).")
        val want = a.optString("session")
        val local = System.currentTimeMillis()
        when (m) {
            "start" -> {
                if (want.isEmpty()) return no("no session")
                val other = session
                if (other != null && other != want) return no("this phone is lent to another task right now")
                // D253: never on a locked phone (locking gave it back); the person unlocks, and a new card asks.
                if ((c.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked || !(c.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive) return no("this phone is locked: it can't be lent until the person unlocks it")
                // A start that waited in a paused page's queue never lends the phone (the person may have
                // said Stop since). The clocks' difference comes from the first start this app saw.
                if (skewKnown && HandsetLife.late("tap", a.optLong("exp"), skew, local)) return no("too late: that start came after its deadline")
                if (!skewKnown && a.optLong("now") > 0) skew = HandsetLife.skew(a.optLong("now"), local).also { skewKnown = true }
                heard = SystemClock.elapsedRealtime()
                if (other == null) ended = null
                session = want
                task = a.optString("task").take(80)
                turn = if (a.optString("turn") == "you") "you" else "agent"
                s.pill.lang = a.optString("lang").takeIf { it == "zh" || it == "en" } ?: ""
                s.pill.show(task, turn)
                changed(c)
                watch(c)
                return ok(JSONObject().put("session", want))
            }
            // The home ended it (the task stopped, Stop from another window): no reason to say back.
            "stop" -> {
                if (session != null && (want.isEmpty() || want == session)) end(c)
                return ok()
            }
            // The chip removed: Android's own switch goes off too (a service may turn itself off,
            // never on; banking apps that refuse to run beside one run again, research/74 §1).
            "off" -> {
                end(c)
                s.disableSelf()
                return ok()
            }
        }
        if (session == null || want != session) return no("Ducter isn't lent this phone right now")
        heard = SystemClock.elapsedRealtime()
        if (m == "beat") return ok()
        // D253: a step that arrives after its deadline (a paused page's queue) never runs.
        if (HandsetLife.late(m, a.optLong("exp"), skew, local)) return no("too late: that step came after its deadline, so it didn't run")
        s.act(m, a, ::ok, ::no)
    }

    /**
     * D253: while lent, every second: the screen went off (the person locked it; Android's
     * SCREEN_OFF broadcast can come many seconds later, seen on the emulator), or the home said
     * nothing for 15 s (gone, or this page paused): the loan ends here.
     */
    private fun watch(c: Context) {
        val app = c.applicationContext
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        main.removeCallbacksAndMessages(WATCH)
        fun tick() {
            if (session == null) return
            if (!pm.isInteractive) return stopTapped(app, "locked")
            if (HandsetLife.silent(heard, SystemClock.elapsedRealtime())) return stopTapped(app, "lost")
            main.postAtTime({ tick() }, WATCH, SystemClock.uptimeMillis() + 1_000)
        }
        main.postAtTime({ tick() }, WATCH, SystemClock.uptimeMillis() + 1_000)
    }
    private val WATCH = Any()

    /** The loan ends: the pill goes, nothing is read or done until the next one. */
    fun end(c: Context) {
        main.removeCallbacksAndMessages(WATCH)
        session = null
        task = ""
        turn = "agent"
        service?.pill?.hide()
        changed(c)
    }

    /**
     * The loan ends on this side, and the home is told why (the page relays it): stop (停下 on the
     * pill or the notification), locked, service (Android's switch went off), lost (the home said
     * nothing for 15 s). Kept as [ended], so a home that missed the moment reads it in the next hello.
     */
    fun stopTapped(c: Context, why: String = "stop") {
        val s = session ?: return
        ended = s to (if (why in HandsetLife.WHYS) why else "stop")
        end(c)
        main.post { listener?.invoke(JSONObject().put("stop", true).put("why", ended?.second ?: "stop")) }
    }
}

/** The accessibility service itself (res/xml/handset_service.xml). */
class HandsetService : AccessibilityService() {
    internal lateinit var pill: HandsetPill
    private val main = Handler(Looper.getMainLooper())

    /** D253: the screen going off (the person locked it; the pill keeps it on otherwise) gives the phone back. */
    private val screenOff = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            if (i.action == Intent.ACTION_SCREEN_OFF && Handset.session != null) Handset.stopTapped(this@HandsetService, "locked")
            // Unlocked again: the home hears it (a Go given while it was locked starts now).
            else Handset.changed(this@HandsetService)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        pill = HandsetPill(this)
        Handset.service = this
        try {
            registerReceiver(screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF).apply { addAction(Intent.ACTION_USER_PRESENT) })
        } catch (_: Exception) {
        }
        Handset.changed(this)
        // The guide sent the person here to switch it on: straight back to Ducter (a bound
        // accessibility service may bring its own app to the front).
        if (Handset.returning) {
            Handset.returning = false
            try {
                startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("handset", "on"))
            } catch (_: Exception) {
            }
        }
    }

    // It listens to nothing (no event types in its config): it reads only when asked, in a loan.
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        gone()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        gone()
        super.onDestroy()
    }

    private fun gone() {
        if (Handset.service !== this) return
        try {
            unregisterReceiver(screenOff)
        } catch (_: Exception) {
        }
        if (::pill.isInitialized) pill.hide()
        Handset.service = null
        // Android's switch went off (or the service was stopped): like Stop, said as such.
        if (Handset.session != null) Handset.stopTapped(this, "service") else Handset.changed(this)
    }

    /** The window in front (an app's, or a system dialog over it), never Ducter's own pill. */
    private fun front(): AccessibilityNodeInfo? {
        val r = rootInActiveWindow
        if (r != null && r.packageName?.toString() != packageName) return r
        return windows.firstOrNull { it.isActive && it.type != android.view.accessibility.AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY }?.root
    }

    private fun model(n: AccessibilityNodeInfo, depth: Int = 0): TreeNode {
        val r = Rect().also { n.getBoundsInScreen(it) }
        val kids = if (depth > 60) emptyList() else (0 until n.childCount).mapNotNull { i -> n.getChild(i)?.let { model(it, depth + 1) } }
        return TreeNode(
            cls = n.className?.toString() ?: "",
            pkg = n.packageName?.toString() ?: "",
            text = n.text?.toString(),
            desc = n.contentDescription?.toString(),
            id = n.viewIdResourceName,
            bounds = intArrayOf(r.left, r.top, r.right, r.bottom),
            clickable = n.isClickable,
            longClickable = n.isLongClickable,
            checkable = n.isCheckable,
            checked = n.isChecked,
            scrollable = n.isScrollable,
            enabled = n.isEnabled,
            focused = n.isFocused,
            password = n.isPassword,
            editable = n.isEditable,
            hint = Build.VERSION.SDK_INT >= 26 && n.isShowingHintText,
            kids = kids,
        )
    }

    private fun gesture(path: Path, ms: Long, ok: () -> Unit, no: (String) -> Unit) {
        val g = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, ms.coerceIn(1, 5000))).build()
        val sent = dispatchGesture(g, object : GestureResultCallback() {
            override fun onCompleted(d: GestureDescription?) = ok()
            override fun onCancelled(d: GestureDescription?) = no("the phone cancelled that touch (the person may have touched the screen)")
        }, main)
        if (!sent) no("the phone refused that touch")
    }

    private fun focusedField(): AccessibilityNodeInfo? = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

    internal fun act(m: String, a: JSONObject, ok: (Any?) -> Unit, no: (String) -> Unit) {
        when (m) {
            "doing" -> {
                pill.doing(a.optString("line").take(60))
                ok(null)
            }
            "screen" -> ok(JSONObject().put("xml", HandsetTree.xml(front()?.let { model(it) })))
            "front" -> ok(JSONObject().put("app", front()?.packageName?.toString() ?: ""))
            "size" -> {
                val wm = getSystemService(WINDOW_SERVICE) as WindowManager
                val (w, h) = if (Build.VERSION.SDK_INT >= 30) wm.currentWindowMetrics.bounds.let { it.width() to it.height() }
                else android.util.DisplayMetrics().also { @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(it) }.let { it.widthPixels to it.heightPixels }
                ok(JSONObject().put("width", w).put("height", h))
            }
            "tap" -> {
                val x = a.optDouble("x").toFloat()
                val y = a.optDouble("y").toFloat()
                pill.ring(x, y)
                gesture(Path().apply { moveTo(x, y) }, 60, { ok(null) }, no)
            }
            "swipe" -> {
                val p = Path().apply { moveTo(a.optDouble("x1").toFloat(), a.optDouble("y1").toFloat()); lineTo(a.optDouble("x2").toFloat(), a.optDouble("y2").toFloat()) }
                val ms = a.optLong("ms", 300)
                if (a.optDouble("x1") == a.optDouble("x2") && a.optDouble("y1") == a.optDouble("y2")) pill.ring(a.optDouble("x1").toFloat(), a.optDouble("y1").toFloat())
                gesture(p, ms, { ok(null) }, no)
            }
            "key" -> when (HandsetTree.keyOf(a.optString("code"))) {
                "back" -> if (performGlobalAction(GLOBAL_ACTION_BACK)) ok(null) else no("back didn't go")
                "home" -> if (performGlobalAction(GLOBAL_ACTION_HOME)) ok(null) else no("home didn't go")
                "recents" -> if (performGlobalAction(GLOBAL_ACTION_RECENTS)) ok(null) else no("recents didn't open")
                "enter" -> {
                    val f = focusedField() ?: return no("no field in focus: tap one first")
                    if (Build.VERSION.SDK_INT >= 30 && f.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)) ok(null)
                    else no("this field has no Enter here: tap its send or search button instead")
                }
                "delete" -> {
                    val f = focusedField() ?: return no("no field in focus: tap one first")
                    if (f.isPassword) return no("that is a password field: it is the person's")
                    val t = HandsetTree.backspace(f.text, Build.VERSION.SDK_INT >= 26 && f.isShowingHintText)
                    if (f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, t) })) ok(null) else no("couldn't change that field")
                }
                else -> no("not a key this phone presses")
            }
            // Any language, no keyboard needed: the field's text is set the way Android's own tools do.
            "text" -> {
                val f = focusedField() ?: return no("no field in focus: tap one first, then type")
                if (f.isPassword) return no("that is a password field: signing in is the person's (phone_ask_user)")
                val t = HandsetTree.typed(f.text, Build.VERSION.SDK_INT >= 26 && f.isShowingHintText, a.optString("s"))
                if (f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, t) })) ok(null)
                else no("that field doesn't take text this way")
            }
            "apps" -> {
                val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                val out = JSONArray()
                @Suppress("DEPRECATION")
                for (r in packageManager.queryIntentActivities(i, 0).distinctBy { it.activityInfo.packageName }) {
                    if (r.activityInfo.packageName == packageName) continue
                    out.put(JSONObject().put("pkg", r.activityInfo.packageName).put("label", r.loadLabel(packageManager).toString()))
                }
                ok(JSONObject().put("apps", out))
            }
            "launch" -> {
                val pkg = a.optString("pkg")
                val i = packageManager.getLaunchIntentForPackage(pkg) ?: return no("$pkg isn't on this phone")
                try {
                    startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    ok(null)
                } catch (e: Exception) {
                    no("couldn't open $pkg")
                }
            }
            "jpeg" -> {
                if (Build.VERSION.SDK_INT < 30) return no("pictures of the screen need Android 11 or later on this phone; read it with phone_look")
                pill.hideFor { shot(ok, no) }
            }
            else -> no("not something this phone does: $m")
        }
    }

    private fun shot(ok: (Any?) -> Unit, no: (String) -> Unit) {
        if (Build.VERSION.SDK_INT < 30) return no("needs Android 11")
        takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
            override fun onSuccess(r: ScreenshotResult) {
                val hw = Bitmap.wrapHardwareBuffer(r.hardwareBuffer, r.colorSpace)
                r.hardwareBuffer.close()
                if (hw == null) return no("couldn't take a picture of the screen")
                val soft = hw.copy(Bitmap.Config.ARGB_8888, false)
                hw.recycle()
                val scale = minOf(1f, 1080f / soft.width)
                val small = if (scale < 1f) Bitmap.createScaledBitmap(soft, (soft.width * scale).toInt(), (soft.height * scale).toInt(), true) else soft
                val out = ByteArrayOutputStream()
                small.compress(Bitmap.CompressFormat.JPEG, 72, out)
                ok(JSONObject().put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)))
            }

            // A protected screen (a bank's, a password page) gives Android's own error: said plainly.
            override fun onFailure(code: Int) = no(if (code == ERROR_TAKE_SCREENSHOT_SECURE_WINDOW) "this screen is protected by its app: no picture of it" else "couldn't take a picture of the screen right now (code $code)")
        })
    }
}
