package co.nowledge.ducter.android

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * D255: the life of the app's own link to the home while its phone is lent, pure (unit-tested on
 * the JVM). On hel a loan died a minute after a task opened Chrome: the link was the page in the
 * app's web view, which Android pauses with Ducter in the background. Now a foreground service holds
 * the link while lent: it connects, says hello, reconnects with backoff when the network drops, and
 * counts each connection (its generation), so the home can tell an old word from a new one.
 */
class LinkMachine(private val clock: () -> Long) {
    /** idle (not started), connecting, up, backoff (waiting to retry), stopped (the loan is over). */
    var state = "idle"
        private set
    /** Connections that opened in this run of the app (the home reads it with `boot`). */
    var gen = 0
        private set
    private var attempt = 0
    /** When the link went down after having been up in this loan (0: up, or never up yet). */
    private var downSince = 0L
    /** It was up at least once since start (else the page's link carries the loan alone). */
    var wasUp = false
        private set

    fun start() {
        if (state == "idle" || state == "stopped") {
            state = "connecting"
            attempt = 0
            downSince = 0
            wasUp = false
        }
    }

    fun opened() {
        if (state == "stopped") return
        state = "up"
        attempt = 0
        gen++
        downSince = 0
        wasUp = true
    }

    /** The connection closed or failed: how long to wait before the next try (-1: don't, it was stopped). */
    fun closed(): Long {
        if (state == "stopped" || state == "idle") return -1
        if (state == "up" || (wasUp && downSince == 0L)) downSince = clock()
        state = "backoff"
        return backoff(attempt++)
    }

    fun retry(): Boolean {
        if (state != "backoff") return false
        state = "connecting"
        return true
    }

    fun stop() {
        state = "stopped"
    }

    val up get() = state == "up"

    /**
     * Lent, and the link that had been up has been down for [DOWN_END_MS]: the loan ends here, and
     * it is said as the network (the phone couldn't reach the home), not as a silent home.
     */
    fun cutOff(): Boolean = state != "up" && downSince > 0 && clock() - downSince > DOWN_END_MS

    companion object {
        /** Quick at first, then up to 8 s: inside the home's 15 s rule, so a blip never ends a loan. */
        val BACKOFF = longArrayOf(500, 1_000, 2_000, 4_000, 8_000)
        fun backoff(attempt: Int): Long = BACKOFF[minOf(maxOf(attempt, 0), BACKOFF.size - 1)]
        const val DOWN_END_MS = 15_000L

        /** The home's socket for its base ("https://h.example/" → "wss://h.example/ws"). */
        fun wsUrl(base: String): String? {
            val b = base.trim()
            if (!b.startsWith("http://") && !b.startsWith("https://")) return null
            val withSlash = if (b.endsWith("/")) b else "$b/"
            return withSlash.replaceFirst("http", "ws") + "ws"
        }
    }
}

/**
 * D255: the foreground service that holds a lent phone's own link (its notification is the loan's,
 * **{name} 正在用这台手机** with **停下**, D246). Started when a loan starts, stopped when it ends (after
 * a recording in flight has been sent). Type `specialUse` (Android 14+: the home drives this phone
 * while the person lends it; no other type fits: connectedDevice is for Bluetooth/USB/NFC peripherals,
 * dataSync is time-limited on Android 15+), plus `mediaProjection` while Ducter records the screen.
 * The screen stays on while lent (the pill), so Doze never sets in during a loan.
 */
class HandsetLinkService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private val machine = LinkMachine { SystemClock.elapsedRealtime() }
    private var ws: WebSocket? = null
    private val client by lazy {
        OkHttpClient.Builder()
            .pingInterval(10, TimeUnit.SECONDS)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
    }
    /** The loan ended; the service goes once nothing is left to send. */
    private var over = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        foreground(Recorder.projecting)
        over = false
        if (machine.state == "idle" || machine.state == "stopped") {
            machine.start()
            connect()
        }
        return START_NOT_STICKY
    }

    /** In Android's foreground with the loan's notification; with mediaProjection too while recording. */
    fun foreground(projecting: Boolean, line: String? = null) {
        val n: Notification = (if (line == null) Notify.loanNotification(this) else null) ?: Notify.quietNotification(this, line)
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or (if (projecting) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0)
                startForeground(Notify.LOAN_ID, n, type)
            } else if (Build.VERSION.SDK_INT >= 29 && projecting) {
                startForeground(Notify.LOAN_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            } else startForeground(Notify.LOAN_ID, n)
        } catch (e: Exception) {
            Log.w("ducter", "link: couldn't go to the foreground: ${e.message}")
        }
    }

    private fun connect() {
        val base = Handset.base(this)
        val token = Handset.token
        val url = base?.let { LinkMachine.wsUrl(it) }
        if (url == null || token == null) {
            // No word from the page yet (the app was started by the system): the page's link carries the loan.
            Log.i("ducter", "link: no home or token yet; the page carries the loan")
            machine.stop()
            return
        }
        val req = Request.Builder().url(url).header("Authorization", "Bearer $token").build()
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                main.post {
                    if (ws !== webSocket) return@post
                    machine.opened()
                    Log.i("ducter", "link: up (generation ${machine.gen})")
                    webSocket.send(JSONObject().put("t", "hello").put("client", "handset").put("version", BuildConfig.VERSION_NAME).toString())
                    hello()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val f = try { JSONObject(text) } catch (_: Exception) { return }
                if (f.optString("t") != "handset_req") return
                val id = f.optString("id")
                val m = f.optString("m")
                val a = f.optJSONObject("a") ?: JSONObject()
                main.post {
                    Handset.call(this@HandsetLinkService, m, a) { r ->
                        val out = JSONObject().put("t", "handset_res").put("id", id).put("ok", r.optBoolean("ok"))
                        if (r.optBoolean("ok")) out.put("result", r.opt("result") ?: JSONObject.NULL) else out.put("error", r.optString("error"))
                        webSocket.send(out.toString())
                    }
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = main.post { dropped(webSocket) }.let {}
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = main.post { dropped(webSocket) }.let {}
        })
    }

    private fun dropped(w: WebSocket) {
        if (ws !== w) return
        ws = null
        Handset.changed(this)
        val wait = machine.closed()
        if (wait < 0 || over) return
        Log.i("ducter", "link: down, again in $wait ms")
        main.postDelayed({ if (machine.retry()) connect() }, wait)
    }

    /** What the app can do and where the loan stands, over this link. */
    fun hello() {
        if (!machine.up) return
        ws?.send(JSONObject().put("t", "handset_hello").put("state", Handset.state(this, "native")).toString())
    }

    /** The loan ended on this side, and why: said over this link first (the page may be paused). */
    fun stopped(why: String) {
        if (!machine.up) return
        ws?.send(JSONObject().put("t", "handset_stop").put("from", "phone").put("why", why).toString())
    }

    val linkUp get() = machine.up
    val wasUp get() = machine.wasUp
    val gen get() = machine.gen

    /** The link that had been up has been down for 15 s: the loan ends as the network's. */
    val cutOff get() = machine.cutOff()

    /** The loan is over: close the link once what is queued is sent, and go (unless a recording is still being sent). */
    fun loanOver() {
        over = true
        if (Recorder.sending) return foreground(false, getString(R.string.handset_record_sending))
        finish()
    }

    /** Nothing left: no link, no notification. */
    fun finish() {
        if (!over) return
        machine.stop()
        ws?.close(1000, "loan over")
        ws = null
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        if (running === this) running = null
        machine.stop()
        ws?.cancel()
        super.onDestroy()
    }

    companion object {
        @Volatile var running: HandsetLinkService? = null
            private set

        /** A loan started: the service (and its link) start too. From the accessibility service's own process. */
        fun start(c: Context) {
            val i = Intent(c, HandsetLinkService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
            } catch (e: Exception) {
                // Android refused a foreground service from the background: the page's link carries the loan.
                Log.w("ducter", "link: couldn't start: ${e.message}")
            }
        }

        fun loanOver() = running?.loanOver()
    }
}
