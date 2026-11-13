package co.nowledge.ducter.android

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Log
import android.view.WindowManager
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * D255: one recording's life, pure (unit-tested on the JVM). asking: Android's own dialog is on the
 * phone; on: recording; saving: stopped, the file is finished and being sent to the home; saved: the
 * home took it; declined / failed: it never started (or Android stopped it before anything was
 * recorded). A recording the loan's end stopped is partial: what was recorded is kept and sent.
 */
class RecordLife(val id: String, val session: String) {
    var state = "asking"
        private set
    var since = 0L
        private set
    var ms = 0L
        private set
    var bytes = 0L
        private set
    var name = ""
        private set
    var partial = false
        private set
    var error = ""
        private set

    /** The person tapped Start on Android's dialog, and it is recording. */
    fun on(at: Long): Boolean {
        if (state != "asking") return false
        state = "on"
        since = at
        return true
    }

    /** The person said no (or didn't answer), or Android couldn't start it. */
    fun no(declined: Boolean, why: String): Boolean {
        if (state != "asking" && state != "on") return false
        state = if (declined) "declined" else "failed"
        error = why
        return true
    }

    /** Stopped: by phone_record_stop (whole), or by the loan's end, a lock, Android, the length limit (partial). */
    fun stopped(partial: Boolean): Boolean {
        if (state != "on") return false
        state = "saving"
        this.partial = partial
        return true
    }

    fun file(name: String, ms: Long, bytes: Long) {
        this.name = name
        this.ms = ms
        this.bytes = bytes
    }

    /** Nothing was recorded (Android stops a recorder that got no frame): failed, never a video. */
    fun empty(why: String) {
        state = "failed"
        error = why
    }

    fun saved() {
        if (state == "saving") state = "saved"
    }

    fun sendFailed(why: String) {
        if (state == "saving") {
            state = "failed"
            error = why
        }
    }

    val active get() = state == "asking" || state == "on" || state == "saving"

    fun json(): JSONObject = JSONObject().put("id", id).put("session", session).put("state", state)
        .apply { if (since > 0) put("since", since) }
        .apply { if (name.isNotEmpty()) put("name", name) }
        .apply { if (ms > 0) put("ms", ms) }
        .apply { if (bytes > 0) put("bytes", bytes) }
        .apply { if (partial) put("partial", true) }
        .apply { if (error.isNotEmpty()) put("error", error) }

    companion object {
        /** No answer on Android's dialog for this long: declined. */
        const val ASK_MS = 120_000L
        /** The video's long edge and bit rate: a phone screen stays readable, 8 minutes stay under 100 MB. */
        const val LONG_EDGE = 1280
        const val BIT_RATE = 1_500_000

        /** The video's size for a screen: its long edge at most [LONG_EDGE], both sides even. */
        fun size(w: Int, h: Int): Pair<Int, Int> {
            val scale = minOf(1.0, LONG_EDGE.toDouble() / maxOf(w, h))
            fun even(v: Double) = maxOf(2, (Math.round(v).toInt() / 2) * 2)
            return even(w * scale) to even(h * scale)
        }
    }
}

/**
 * D255: Ducter records the lent phone's screen itself (Android's MediaProjection: the whole screen,
 * no sound). Android asks the person once per recording with its own dialog; the video is saved in
 * the phone's Movies/Ducter and sent to the home, which checks it before the task may say it recorded.
 * Never Android's own recorder (on hel its recordings stopped by themselves, research/74 §3 is
 * superseded for this one use).
 */
object Recorder {
    private val main = Handler(Looper.getMainLooper())
    @Volatile var now: RecordLife? = null
        private set
    private var projection: MediaProjection? = null
    private var recorder: MediaRecorder? = null
    private var display: VirtualDisplay? = null
    private var uri: Uri? = null
    private var file: File? = null
    private var pfd: ParcelFileDescriptor? = null
    private var startedAt = 0L
    private var maxMs = 8 * 60_000L
    private val ASK = Any()

    /** A projection is running, or about to be (the service carries the mediaProjection type). */
    val projecting get() = projection != null || projectingSoon
    private var projectingSoon = false
    /** Android's dialog's host, to close it when nobody answers. */
    @Volatile internal var asking: RecordActivity? = null
    /** A video is on its way to the home. */
    @Volatile var sending = false
        private set

    /** phone_record_start: Android's dialog opens on the phone; the answer arrives in [granted]. */
    fun ask(c: Context, session: String, max: Long): JSONObject {
        now?.let { if (it.active) return JSONObject().put("error", "a recording is already ${it.state}") }
        val r = RecordLife(UUID.randomUUID().toString().take(12), session)
        now = r
        maxMs = max.coerceIn(5_000, 8 * 60_000)
        try {
            c.startActivity(Intent(c, RecordActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION))
        } catch (e: Exception) {
            r.no(false, "Android didn't open its recording dialog")
            return JSONObject().put("error", "Android didn't open its recording dialog")
        }
        Handset.service?.pill?.doing(Handset.words(c, R.string.handset_record_asking))
        main.removeCallbacksAndMessages(ASK)
        main.postAtTime({ if (r.state == "asking") no(c, r, true, "no answer on the phone in 2 minutes") }, ASK, SystemClock.uptimeMillis() + RecordLife.ASK_MS)
        Handset.changed(c)
        return JSONObject().put("id", r.id).put("state", r.state)
    }

    /** Android's dialog answered: yes (code, data) or no. */
    fun answered(c: Context, code: Int, data: Intent?) {
        main.removeCallbacksAndMessages(ASK)
        val r = now ?: return
        if (r.state != "asking") return
        if (code != Activity.RESULT_OK || data == null) return no(c, r, true, "the user didn't allow it")
        // The loan ended while Android asked: nothing starts.
        if (Handset.session != r.session) return no(c, r, true, "the loan ended before it started")
        val svc = HandsetLinkService.running
        if (svc == null) return no(c, r, false, "Ducter's link service isn't running")
        // Android 14+: the service is in the foreground as mediaProjection before the projection is taken.
        projectingSoon = true
        svc.foreground(true)
        try {
            projection = (c.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager).getMediaProjection(code, data)
        } catch (e: Exception) {
            projectingSoon = false
            svc.foreground(false)
            return no(c, r, false, "Android refused the recording (${e.javaClass.simpleName})")
        }
        projectingSoon = false
        try {
            begin(c, r)
        } catch (e: Exception) {
            Log.w("ducter", "recording: couldn't start", e)
            release()
            no(c, r, false, "the phone couldn't start recording (${e.javaClass.simpleName})")
        }
    }

    private fun no(c: Context, r: RecordLife, declined: Boolean, why: String) {
        main.removeCallbacksAndMessages(ASK)
        // Android's dialog still up (no answer, or the loan ended): closed, so nothing starts behind the person's back.
        asking?.let { a -> asking = null; try { @Suppress("DEPRECATION") a.finishActivity(255); a.finish() } catch (_: Exception) {} }
        if (r.no(declined, why)) {
            Handset.service?.pill?.doing(Handset.task)
            Handset.changed(c)
        }
    }

    private fun begin(c: Context, r: RecordLife) {
        val p = projection ?: throw IllegalStateException("no projection")
        p.registerCallback(object : MediaProjection.Callback() {
            // Android stopped it (the person's own Stop in the status bar, a lock): what was recorded is kept.
            override fun onStop() = main.post { if (now === r && r.state == "on") stop(c, partial = true) }.let {}
        }, main)
        val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val (sw, sh) = if (Build.VERSION.SDK_INT >= 30) wm.currentWindowMetrics.bounds.let { it.width() to it.height() }
        else android.util.DisplayMetrics().also { @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(it) }.let { it.widthPixels to it.heightPixels }
        val (w, h) = RecordLife.size(sw, sh)
        val dpi = c.resources.displayMetrics.densityDpi
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val name = "Ducter-$stamp.mp4"
        val m = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(c) else @Suppress("DEPRECATION") MediaRecorder()
        m.setVideoSource(MediaRecorder.VideoSource.SURFACE)
        m.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        m.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
        m.setVideoSize(w, h)
        m.setVideoFrameRate(30)
        m.setVideoEncodingBitRate(RecordLife.BIT_RATE)
        m.setMaxDuration(maxMs.toInt())
        // The phone's own copy: Movies/Ducter, in Photos (Android 10+), else the app's own folder.
        if (Build.VERSION.SDK_INT >= 29) {
            val v = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, name)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/Ducter")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            val u = c.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v) ?: throw IllegalStateException("no place for the video")
            uri = u
            pfd = c.contentResolver.openFileDescriptor(u, "rw")
            m.setOutputFile(pfd!!.fileDescriptor)
        } else {
            val f = File(c.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: c.filesDir, name)
            file = f
            m.setOutputFile(f.absolutePath)
        }
        m.setOnInfoListener { _, what, _ ->
            // The length limit: stopped there, kept whole up to it.
            if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) main.post { if (now === r && r.state == "on") stop(c, partial = true) }
        }
        m.prepare()
        recorder = m
        display = p.createVirtualDisplay("Ducter recording", w, h, dpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, m.surface, null, null)
        m.start()
        startedAt = SystemClock.elapsedRealtime()
        r.on(System.currentTimeMillis())
        r.file(name, 0, 0)
        Handset.service?.pill?.recording(true)
        Handset.changed(c)
    }

    /**
     * Stops the recording and sends what was recorded: phone_record_stop (whole), or the loan's end,
     * Android, the limit (partial). Returns what the home is told now, or an error.
     */
    fun stop(c: Context, partial: Boolean): JSONObject {
        val r = now ?: return JSONObject().put("error", "no recording")
        if (r.state == "asking") {
            no(c, r, true, "the loan ended before it started")
            return JSONObject().put("error", "it was still asking")
        }
        if (!r.stopped(partial)) return JSONObject().put("error", "not recording (${r.state})")
        Handset.service?.pill?.recording(false)
        var ok = true
        try {
            recorder?.stop()
        } catch (e: RuntimeException) {
            ok = false // no frame was recorded: Android throws here
        }
        val ms = SystemClock.elapsedRealtime() - startedAt
        release()
        val u = uri
        val f = file
        if (!ok) {
            if (u != null) c.contentResolver.delete(u, null, null) else f?.delete()
            uri = null
            file = null
            r.empty("nothing was recorded")
            Handset.changed(c)
            HandsetLinkService.running?.foreground(false)
            return JSONObject().put("error", "nothing was recorded")
        }
        if (u != null && Build.VERSION.SDK_INT >= 29) c.contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
        val bytes = when {
            u != null -> c.contentResolver.openFileDescriptor(u, "r")?.use { it.statSize } ?: 0
            else -> f?.length() ?: 0
        }
        val length = try {
            MediaMetadataRetriever().run {
                if (u != null) setDataSource(c, u) else setDataSource(f!!.absolutePath)
                val d = extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                release()
                d
            }
        } catch (_: Exception) {
            null
        } ?: ms
        r.file(r.name, length, bytes)
        HandsetLinkService.running?.foreground(false)
        Handset.changed(c)
        send(c.applicationContext, r, u, f)
        return JSONObject().put("id", r.id).put("name", r.name).put("ms", r.ms).put("bytes", r.bytes).apply { if (partial) put("partial", true) }
    }

    /** The loan ended: a recording stops with it (kept, partial); Android's dialog still up starts nothing. */
    fun loanEnded(c: Context) {
        val r = now ?: return
        if (r.state == "on") stop(c, partial = true)
        else if (r.state == "asking") no(c, r, true, "the loan ended before it started")
    }

    private fun release() {
        try { display?.release() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
        try { projection?.stop() } catch (_: Exception) {}
        try { pfd?.close() } catch (_: Exception) {}
        display = null
        recorder = null
        projection = null
        pfd = null
    }

    /** The video goes to the home (POST /api/handset/recording, the device's token), on its own thread. */
    private fun send(c: Context, r: RecordLife, u: Uri?, f: File?) {
        val base = Handset.base(c)
        val token = Handset.token
        if (base == null || token == null) {
            r.sendFailed("the phone has no way to reach the home right now")
            Handset.changed(c)
            return
        }
        sending = true
        Handset.service?.pill?.doing(Handset.words(c, R.string.handset_record_sending))
        Thread {
            var why: String? = null
            try {
                val q = "id=${enc(r.id)}&session=${enc(r.session)}&name=${enc(r.name)}&ms=${r.ms}&bytes=${r.bytes}" + (if (r.partial) "&partial=1" else "")
                val conn = URL("${if (base.endsWith("/")) base else "$base/"}api/handset/recording?$q").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(r.bytes)
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("Content-Type", "video/mp4")
                conn.connectTimeout = 15_000
                conn.readTimeout = 120_000
                val input = if (u != null) c.contentResolver.openInputStream(u) else f?.inputStream()
                input?.use { i -> conn.outputStream.use { o -> i.copyTo(o, 64 * 1024) } }
                val code = conn.responseCode
                if (code != 200) why = "the home said ${code}: ${(conn.errorStream ?: conn.inputStream)?.bufferedReader()?.readText()?.take(160)}"
                conn.disconnect()
            } catch (e: Exception) {
                why = "couldn't send it (${e.javaClass.simpleName})"
            }
            main.post {
                sending = false
                if (why == null) r.saved() else r.sendFailed(why)
                if (Handset.session != null) Handset.service?.pill?.doing(Handset.task)
                Handset.changed(c)
                // The loan may have ended meanwhile: the service goes now that nothing is left to send.
                HandsetLinkService.running?.finish()
            }
        }.start()
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
}

/**
 * D255: opens Android's own dialog asking whether Ducter may record the screen, and hands its answer
 * to [Recorder]. No window of its own (transparent), never in Recents; opened from the accessibility
 * service over whatever app is in front, which comes back when the dialog closes.
 */
class RecordActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) return
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        // Android 14+: offer the whole screen only (a single app's recording stops or goes blank when another app opens).
        val ask = if (Build.VERSION.SDK_INT >= 34) mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay()) else mpm.createScreenCaptureIntent()
        Recorder.asking = this
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(ask, ASK)
        } catch (e: Exception) {
            Recorder.asking = null
            Recorder.answered(this, RESULT_CANCELED, null)
            finish()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (Recorder.asking === this) Recorder.asking = null
        if (requestCode == ASK) Recorder.answered(applicationContext, resultCode, data)
        finish()
        if (Build.VERSION.SDK_INT >= 34) overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0) else @Suppress("DEPRECATION") overridePendingTransition(0, 0)
    }

    private companion object {
        const val ASK = 255
    }
}
