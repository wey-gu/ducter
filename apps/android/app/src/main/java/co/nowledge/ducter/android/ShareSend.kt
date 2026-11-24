package co.nowledge.ducter.android

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit

/** One partner the share sheet can send to (GET /api/me's partners). */
data class SharePartner(val id: String, val name: String, val look: String)

/**
 * D537: the share sheet's side of the network, and making pictures ready on the phone (D206:
 * upright, ≤ 2048 px, re-encoded, so nothing about where a photo was taken leaves the phone).
 * Every share goes into the outbox first; sending is draining the outbox, from the sheet on Send
 * and from MainActivity whenever the app comes to the front. Off the main thread only.
 */
class ShareSender(private val ctx: Context) {
    private val store = Store(ctx)
    val dir = File(ctx.filesDir, "outbox")
    private val http = OkHttpClient.Builder().connectTimeout(6, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).writeTimeout(600, TimeUnit.SECONDS).build()

    val paired: Boolean get() = store.base != null && !store.deviceToken.isNullOrEmpty()

    /** The home's base that answers now: the one in use, else the best of its ways that proves it is the home. */
    fun home(): String? {
        val base = store.base ?: return null
        if (me(base) != null) return base
        val pinned = store.fp ?: return null
        val others = store.ways.filter { !it.url.trimEnd('/').equals(base.trimEnd('/'), true) }
        return Reach.firstThatProves(others) { proves(it, pinned) }?.let { if (it.endsWith("/")) it else "$it/" }
    }

    private var lastMe: JSONObject? = null

    /** GET api/me with this phone's token, or null when the home doesn't answer it. */
    fun me(base: String): JSONObject? = try {
        http.newCall(req(base, "api/me").get().build()).execute().use { r ->
            if (r.code != 200) null else JSONObject(r.body?.string() ?: "{}").also { lastMe = it }
        }
    } catch (_: Exception) {
        null
    }

    /** The partners the home says, kept for the next time it can't be reached; the default alone before any. */
    fun partners(fresh: JSONObject?): List<SharePartner> {
        val a = fresh?.optJSONArray("partners")
        if (a != null) store.sharePartners = a.toString()
        fresh?.optString("personaName")?.takeIf { it.isNotEmpty() }?.let { store.personaName = it }
        val list = try {
            val j = JSONArray(store.sharePartners ?: "[]")
            (0 until j.length()).map { j.getJSONObject(it) }.map { SharePartner(it.optString("id"), it.optString("name"), it.optString("look", "sand")) }.filter { it.id.isNotEmpty() }
        } catch (_: Exception) {
            emptyList()
        }
        return list.ifEmpty { listOf(SharePartner("default", store.personaName, "sand")) }
    }

    private fun req(base: String, path: String) = Request.Builder().url(base + path).header("authorization", "Bearer ${store.deviceToken ?: ""}")

    private fun proves(base: String, pinned: String): Boolean = try {
        val nonce = Reach.nonce()
        http.newCall(Request.Builder().url("${base.trimEnd('/')}/.well-known/ducter-home?n=$nonce").build()).execute().use { r ->
            r.code == 200 && JSONObject(r.body?.string() ?: "{}").let { Reach.check(it.optString("key"), it.optString("sig"), nonce, pinned) }
        }
    } catch (_: Exception) {
        false
    }

    // MARK: into the outbox

    /** Makes each item ready in the entry's own folder, and keeps the entry: nothing has left the phone yet. */
    fun keep(e: OutEntry, items: List<Incoming>): OutEntry {
        val folder = File(dir, e.clientId).apply { mkdirs() }
        val files = items.mapIndexedNotNull { i, it -> ready(Uri.parse(it.uri), it, folder, i) }
        val full = e.copy(files = files)
        Outbox.save(dir, full)
        return full
    }

    private fun ready(uri: Uri, it: Incoming, folder: File, i: Int): OutFile? {
        val cr = ctx.contentResolver
        val name = (it.name ?: nameOf(cr, uri) ?: "file-${i + 1}").replace('/', '_')
        if (it.picture && it.mime != "image/gif") picture(cr, uri, name, it.mime ?: "image/jpeg", folder, i)?.let { p -> return p }
        // A file (or a picture this phone can't read, or a GIF): as it is, up to the cap.
        val out = File(folder, "$i.bin")
        return try {
            var n = 0L
            cr.openInputStream(uri)?.use { input ->
                out.outputStream().use { o ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val r = input.read(buf)
                        if (r < 0) break
                        n += r
                        if (n > ShareLimits.FILE_BYTES) throw IllegalStateException("too big")
                        o.write(buf, 0, r)
                    }
                }
            } ?: return null
            OutFile(out.name, name, it.mime ?: "application/octet-stream")
        } catch (_: Exception) {
            out.delete()
            null
        }
    }

    /** D206: upright by its EXIF, at most 2048 px, re-encoded (all metadata gone); its 720 px tile and a ~16 px preview. */
    private fun picture(cr: ContentResolver, uri: Uri, name: String, mime: String, folder: File, i: Int): OutFile? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0) null
        else {
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= ShareLimits.LONG_EDGE) sample *= 2
            val raw = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: throw IllegalStateException()
            val turn = cr.openInputStream(uri)?.use { exifTurn(ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) } ?: Matrix()
            val upright = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, turn, true)
            val shown = fit(upright, ShareLimits.LONG_EDGE)
            val lossless = mime == "image/png" || mime == "image/webp"
            var bytes = encode(shown, lossless)
            var png = lossless
            // A big screenshot as PNG can outgrow a photo: past 6 MB it goes as a JPEG.
            if (lossless && bytes.size > 6 * 1024 * 1024) { bytes = encode(shown, false, 90); png = false }
            File(folder, "$i.bin").writeBytes(bytes)
            val thumb = if (maxOf(shown.width, shown.height) > ShareLimits.THUMB_EDGE * 1.2) {
                File(folder, "$i.thumb").also { f -> f.writeBytes(encode(fit(shown, ShareLimits.THUMB_EDGE), false, 80)) }.name
            } else null
            val tiny = encode(fit(shown, 16), false, 60)
            val preview = "data:image/jpeg;base64," + Base64.encodeToString(tiny, Base64.NO_WRAP)
            val base = name.substringBeforeLast('.', name)
            OutFile("$i.bin", if (png) "$base.png" else "$base.jpg", if (png) "image/png" else "image/jpeg", thumb, preview.takeIf { it.length <= ShareLimits.PREVIEW_CHARS })
        }
    } catch (_: Throwable) {
        null
    }

    private fun exifTurn(o: Int): Matrix = Matrix().apply {
        when (o) {
            ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(270f); postScale(-1f, 1f) }
        }
    }

    private fun fit(b: Bitmap, edge: Int): Bitmap {
        val s = edge.toFloat() / maxOf(b.width, b.height)
        return if (s >= 1f) b else Bitmap.createScaledBitmap(b, maxOf(1, (b.width * s).toInt()), maxOf(1, (b.height * s).toInt()), true)
    }

    private fun encode(b: Bitmap, png: Boolean, q: Int = 85): ByteArray {
        val src = if (png) b else Bitmap.createBitmap(b.width, b.height, Bitmap.Config.ARGB_8888).also { flat ->
            // A JPEG has no transparency: what is see-through lands on white, never on black.
            Canvas(flat).apply { drawColor(Color.WHITE); drawBitmap(b, 0f, 0f, null) }
        }
        return ByteArrayOutputStream().also { src.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, q, it) }.toByteArray()
    }

    fun nameOf(cr: ContentResolver, uri: Uri): String? = try {
        cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    } catch (_: Exception) {
        uri.lastPathSegment
    }

    fun sizeOf(cr: ContentResolver, uri: Uri): Long? = try {
        cr.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else null }
    } catch (_: Exception) {
        null
    }

    // MARK: draining the outbox

    /**
     * Sends what waits, oldest first. Returns how the one with this clientId went (or, without
     * one, the last outcome). Stops at the first home that doesn't answer: the rest wait too.
     */
    fun drain(want: String? = null): Outcome? = synchronized(LOCK) {
        val all = Outbox.list(dir)
        if (all.isEmpty()) return null
        val base = home()
        var mine: Outcome? = null
        var last: Outcome? = null
        for (start in all) {
            var e = start
            var out: Outcome
            while (true) {
                when (val s = Outbox.next(e, System.currentTimeMillis())) {
                    is Step.Expire -> { Outbox.drop(dir, e.clientId); out = Outcome.Refused; break }
                    is Step.Upload -> {
                        if (base == null) { out = Outcome.Offline; break }
                        val (o, id) = upload(base, e, s.index)
                        if (o == Outcome.Sent || o == Outcome.TooBig || o == Outcome.Refused) {
                            e = Outbox.uploaded(e, s.index, if (o == Outcome.Sent) id else null)
                            Outbox.save(dir, e)
                            continue
                        }
                        out = o
                        break
                    }
                    is Step.Post -> {
                        out = if (base == null) Outcome.Offline else post(base, e)
                        if (out == Outcome.Sent || out == Outcome.Refused) {
                            if (out == Outcome.Sent) e.partner?.let { store.lastSharePartner = it }
                            Outbox.drop(dir, e.clientId)
                        }
                        break
                    }
                }
            }
            if (e.clientId == want) mine = out
            last = out
            if (out == Outcome.Offline || out == Outcome.TooOld || out == Outcome.Unpaired) {
                if (want != null && mine == null && all.any { it.clientId == want }) mine = out
                break
            }
        }
        mine ?: last
    }

    private fun upload(base: String, e: OutEntry, index: Int): Pair<Outcome, String?> = try {
        val f = e.files[index]
        val folder = File(dir, e.clientId)
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", f.name, File(folder, f.file).asRequestBody(f.mime.toMediaType()))
            .addFormDataPart("name", f.name)
            .apply {
                f.thumb?.let { addFormDataPart("thumb", "thumb", File(folder, it).asRequestBody("image/jpeg".toMediaType())) }
                f.preview?.let { addFormDataPart("preview", it) }
            }.build()
        http.newCall(req(base, "api/media").post(body).build()).execute().use { r ->
            val o = Outcome.of(r.code)
            o to (if (o == Outcome.Sent) JSONObject(r.body?.string() ?: "{}").optJSONObject("media")?.optString("id") else null)
        }
    } catch (_: Exception) {
        Outcome.Offline to null
    }

    private fun post(base: String, e: OutEntry): Outcome = try {
        http.newCall(req(base, "api/share").post(e.shareBody().toString().toRequestBody("application/json".toMediaType())).build()).execute().use { Outcome.of(it.code) }
    } catch (_: Exception) {
        Outcome.Offline
    }

    companion object {
        private val LOCK = Any()

        /** MainActivity, coming to the front: whatever waits goes now (quietly). */
        fun drainSoon(ctx: Context) {
            val app = ctx.applicationContext
            if (File(app.filesDir, "outbox").listFiles().isNullOrEmpty()) return
            Thread { try { ShareSender(app).drain() } catch (_: Exception) {} }.start()
        }
    }
}
