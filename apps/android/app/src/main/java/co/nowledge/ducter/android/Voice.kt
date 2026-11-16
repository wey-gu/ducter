package co.nowledge.ducter.android

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.Locale

/**
 * D305: the pure parts of the voice bridge (design/voice.md, "The app bridge"), unit-tested on
 * the JVM: the level the page's meter reads, what an error is called, where the words are made.
 */
object VoiceLogic {
    /**
     * Android's onRmsChanged gives a dB-like value, about -2 in silence to about 10 when speaking
     * up (it is not calibrated; INFERRED from AOSP and Google's recognizer). Mapped to 0–1.
     */
    fun level(rmsdB: Float): Double = ((rmsdB + 2f) / 12f).toDouble().coerceIn(0.0, 1.0).let { Math.round(it * 100) / 100.0 }

    /** Why a recognizer stopped, in the bridge's words; null: nothing was heard (a final "" then end). */
    fun why(error: Int): String? = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> null
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "mic"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER, ERROR_SERVER_DISCONNECTED -> "network"
        ERROR_LANGUAGE_NOT_SUPPORTED, ERROR_LANGUAGE_UNAVAILABLE -> "lang"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY, ERROR_TOO_MANY_REQUESTS -> "busy"
        SpeechRecognizer.ERROR_AUDIO -> "nomic"
        else -> "error"
    }

    // The API 31+ codes by value, so this compiles and tests on any level.
    const val ERROR_TOO_MANY_REQUESTS = 10
    const val ERROR_SERVER_DISCONNECTED = 11
    const val ERROR_LANGUAGE_NOT_SUPPORTED = 12
    const val ERROR_LANGUAGE_UNAVAILABLE = 13

    /**
     * Where the words are made when it isn't the phone's on-device recognizer: Google's when the
     * phone's chosen recognition service is Google's app (Settings.Secure voice_recognition_service,
     * "package/class"), otherwise a service we can't name.
     */
    fun whereOf(onDevice: Boolean, service: String?): String {
        if (onDevice) return "device"
        val pkg = service?.substringBefore('/')?.trim().orEmpty()
        return if (pkg.startsWith("com.google.android.")) "google" else "service"
    }

    /** A BCP 47 tag from the page ("zh-CN", "en_US", "") as the recognizer and the voice want it. */
    fun tag(lang: String?): String {
        val t = lang?.trim()?.replace('_', '-').orEmpty()
        return if (t.isEmpty()) "en-US" else t
    }
}

/**
 * D305: hold to talk and read aloud for the page. It listens only between a start and a stop the
 * page sends while the person holds the mic; nothing is kept. Every call is on the main thread.
 */
class Voice(private val ctx: android.app.Activity, private val emit: (JSONObject) -> Unit, private val askMic: ((Boolean) -> Unit) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var rec: SpeechRecognizer? = null
    private var id: String? = null
    private var heard = ""
    private var lastLevel = 0L
    private var tts: TextToSpeech? = null
    private var ttsReady: Boolean? = null
    private var pendingSpeak: (() -> Unit)? = null

    private fun micState(): String = when {
        ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> "granted"
        // Android asks twice at most; after that (or "don't ask again") only Settings can.
        asked && !ctx.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) -> "denied"
        else -> "ask"
    }

    /** Asked once already (Android won't ask again after a second no; Settings is the way then). */
    private var asked: Boolean
        get() = ctx.getSharedPreferences("voice", Context.MODE_PRIVATE).getBoolean("asked", false)
        set(v) { ctx.getSharedPreferences("voice", Context.MODE_PRIVATE).edit().putBoolean("asked", v).apply() }

    private fun onDevice(): Boolean = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)

    private fun where(): String = VoiceLogic.whereOf(onDevice(), Settings.Secure.getString(ctx.contentResolver, "voice_recognition_service"))

    /** Answers the page; false when the message isn't voice's. */
    fun handle(m: JSONObject, answer: (Any?) -> Unit): Boolean {
        when (m.optString("t")) {
            "voice.can" -> {
                val ok = onDevice() || SpeechRecognizer.isRecognitionAvailable(ctx)
                answer(JSONObject().put("ok", ok).put("where", where()).put("mic", micState()).put("speech", "granted").apply { if (!ok) put("why", "lang") })
            }
            "voice.start" -> start(m.optString("id"), VoiceLogic.tag(m.optString("lang")), answer)
            "voice.stop" -> { if (id != null && (m.optString("id").isEmpty() || m.optString("id") == id)) rec?.stopListening(); answer(JSONObject()) }
            "voice.cancel" -> { if (id != null && (m.optString("id").isEmpty() || m.optString("id") == id)) { rec?.cancel(); end() }; answer(JSONObject()) }
            "voice.settings" -> {
                ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", ctx.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                answer(JSONObject())
            }
            "speak" -> speak(m.optString("id"), m.optString("text"), VoiceLogic.tag(m.optString("lang")), answer)
            "speak.stop" -> { tts?.stop(); spoken(); answer(JSONObject()) }
            else -> return false
        }
        return true
    }

    private fun start(newId: String, lang: String, answer: (Any?) -> Unit) {
        if (id != null) { rec?.cancel(); end() }
        when (micState()) {
            "granted" -> {}
            "denied" -> return answer(JSONObject().put("ok", false).put("why", "mic"))
            else -> return askMic { ok -> asked = true; if (ok) start(newId, lang, answer) else answer(JSONObject().put("ok", false).put("why", "mic")) }
        }
        val dev = onDevice()
        if (!dev && !SpeechRecognizer.isRecognitionAvailable(ctx)) return answer(JSONObject().put("ok", false).put("why", "lang"))
        val r = try {
            if (dev && Build.VERSION.SDK_INT >= 31) SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx) else SpeechRecognizer.createSpeechRecognizer(ctx)
        } catch (_: Exception) {
            return answer(JSONObject().put("ok", false).put("why", "error"))
        }
        rec?.destroy()
        rec = r
        id = newId
        heard = ""
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {
                val now = System.currentTimeMillis()
                if (now - lastLevel < 50 || id != newId) return // at most 20 a second
                lastLevel = now
                emit(JSONObject().put("id", newId).put("kind", "level").put("level", VoiceLogic.level(rmsdB)))
            }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                if (id != newId) return
                val why = VoiceLogic.why(error)
                if (why == null || heard.isNotEmpty()) emit(JSONObject().put("id", newId).put("kind", "final").put("text", heard))
                else emit(JSONObject().put("id", newId).put("kind", "error").put("why", why))
                end()
            }
            override fun onResults(results: Bundle?) {
                if (id != newId) return
                val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: heard
                emit(JSONObject().put("id", newId).put("kind", "final").put("text", t))
                end()
            }
            override fun onPartialResults(partial: Bundle?) {
                if (id != newId) return
                val t = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() } ?: return
                heard = t
                emit(JSONObject().put("id", newId).put("kind", "partial").put("text", t))
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
            // A hold is a hold: don't end on a pause while the person is still holding.
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 10_000L)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 10_000L)
        try {
            r.startListening(intent)
        } catch (_: Exception) {
            end(quiet = true)
            return answer(JSONObject().put("ok", false).put("why", "error"))
        }
        answer(JSONObject().put("ok", true).put("where", VoiceLogic.whereOf(dev, Settings.Secure.getString(ctx.contentResolver, "voice_recognition_service"))))
    }

    private fun end(quiet: Boolean = false) {
        val was = id ?: return
        id = null
        val r = rec
        rec = null
        main.post { r?.destroy() }
        if (!quiet) emit(JSONObject().put("id", was).put("kind", "end"))
    }

    // MARK: read aloud

    private var speakId: String? = null

    private fun speak(sid: String, text: String, lang: String, answer: (Any?) -> Unit) {
        val go = {
            val t = tts
            if (t == null || ttsReady != true) answer(JSONObject().put("ok", false).put("why", "voice"))
            else {
                val r = t.setLanguage(Locale.forLanguageTag(lang))
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) answer(JSONObject().put("ok", false).put("why", "voice"))
                else {
                    if (speakId != null) { t.stop(); spoken() }
                    speakId = sid
                    t.speak(text, TextToSpeech.QUEUE_FLUSH, null, sid)
                    answer(JSONObject().put("ok", true))
                }
            }
        }
        if (ttsReady != null) return go()
        pendingSpeak = go
        if (tts == null) tts = TextToSpeech(ctx) { status ->
            main.post {
                ttsReady = status == TextToSpeech.SUCCESS
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) { main.post { if (utteranceId == speakId) spoken() } }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) { main.post { if (utteranceId == speakId) spoken() } }
                    override fun onStop(utteranceId: String?, interrupted: Boolean) { main.post { if (utteranceId == speakId) spoken() } }
                })
                pendingSpeak?.invoke()
                pendingSpeak = null
            }
        }
    }

    private fun spoken() {
        val sid = speakId ?: return
        speakId = null
        emit(JSONObject().put("id", sid).put("kind", "spoken"))
    }

    fun release() {
        rec?.destroy()
        rec = null
        id = null
        tts?.shutdown()
        tts = null
        ttsReady = null
    }
}
