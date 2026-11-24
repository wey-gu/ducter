package co.nowledge.ducter.android

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

// D537: 分享到 Ducter / Share to Ducter. Something from another app (Chrome, Photos, WeChat, Files,
// X) comes in through Android's share sheet: the person adds a note (附言) and sends, and it lands
// as one message in the conversation with the partner it was for. The pure parts live here and are
// tested on the JVM (ShareTest): what an intent's extras become, the limits, the outbox's next
// step and what an answer from the home means. ShareActivity draws the sheet; ShareSender talks to
// the home (POST /api/media for each picture or file, then POST /api/share, packages/protocol/src/share.ts).

object ShareLimits {
    /** Pictures and files in one message (MEDIA_LIMITS.perMessage). */
    const val PER_MESSAGE = 10
    /** One file as it is (MEDIA_LIMITS.file). */
    const val FILE_BYTES = 50L * 1024 * 1024
    /** A picture's long edge once made ready, and its tile's (MEDIA_LIMITS.longEdge, thumbEdge). */
    const val LONG_EDGE = 2048
    const val THUMB_EDGE = 720
    /** A tiny preview as a data: URL, at most this long (MEDIA_LIMITS.preview). */
    const val PREVIEW_CHARS = 4096
    /** An outbox entry no home took in this long is let go. */
    const val KEEP_MS = 7L * 24 * 3600 * 1000
}

/** One stream the sharing app handed over (a content:// URI), as far as Android told. */
data class Incoming(val uri: String, val mime: String?, val name: String?, val size: Long?) {
    val picture: Boolean get() = mime?.startsWith("image/") == true && mime != "image/svg+xml"
}

/** What the sheet shows and sends: a link (with its title), words, and up to ten items. */
data class SharePlan(
    val url: String?,
    val title: String?,
    val text: String?,
    val items: List<Incoming>,
    /** More than ten came: only the first ten go. */
    val overCount: Boolean,
    /** Files over 50 MB, left out (their names). */
    val tooBig: List<String>,
) {
    val empty: Boolean get() = url == null && text.isNullOrBlank() && items.isEmpty()
}

object Share {
    private val URL_RE = Regex("""https?://[^\s<>"'“”「」]+""")

    /** The first http(s) link in some words, without the punctuation that ends a sentence. */
    fun firstLink(s: String?): String? = s?.let { URL_RE.find(it)?.value?.trimEnd('.', ',', ')', '，', '。', '）', '!', '?') }

    /**
     * An intent's extras as what to send. EXTRA_TEXT may be a link alone (Chrome), words with a
     * link in them (X, WeChat) or words; EXTRA_SUBJECT is the page's title when there is a link.
     */
    fun plan(text: String?, subject: String?, streams: List<Incoming>): SharePlan {
        val t = text?.trim()?.takeIf { it.isNotEmpty() }
        val url = firstLink(t)
        // Words that are only the link add nothing; the home leaves the link out of the rest itself.
        val words = if (url != null && t?.trim() == url) null else t
        val title = subject?.trim()?.takeIf { it.isNotEmpty() && url != null && it != url }
        val fit = mutableListOf<Incoming>()
        val big = mutableListOf<String>()
        for (s in streams) {
            if (!s.picture && (s.size ?: 0) > ShareLimits.FILE_BYTES) big += (s.name ?: s.uri.substringAfterLast('/'))
            else fit += s
        }
        return SharePlan(url, title, words, fit.take(ShareLimits.PER_MESSAGE), fit.size > ShareLimits.PER_MESSAGE, big)
    }

    /** The host a link card says under its title ("example.com"). */
    fun host(url: String): String = try {
        java.net.URI(url).host?.removePrefix("www.") ?: url
    } catch (_: Exception) {
        url
    }

    /** A file's badge: its extension as written, at most 4 letters ("PDF", "DOCX"); "FILE" when it has none. */
    fun badge(name: String?): String {
        val ext = name?.substringAfterLast('.', "")?.takeIf { it.isNotEmpty() && it.length <= 5 && it.all(Char::isLetterOrDigit) }
        return ext?.uppercase()?.take(4) ?: "FILE"
    }

    /** D286: a file's family colour for its badge's band (app.css --fam-*, light and dark), by its badge. */
    fun familyColor(badge: String, night: Boolean): Int {
        val (light, dark) = when (badge.lowercase()) {
            "pdf" -> 0xD65A40 to 0xEE8A72
            "doc", "docx", "page", "rtf", "odt" -> 0x3F74C2 to 0x7CA9EA
            "xls", "xlsx", "csv", "tsv", "numb", "ods" -> 0x3C8F57 to 0x74C48E
            "ppt", "pptx", "key", "odp" -> 0xD9772C to 0xF2A35F
            "zip", "gz", "tgz", "tar", "7z", "rar" -> 0x9A7A50 to 0xC9A77A
            "m4a", "mp3", "wav", "aac", "flac" -> 0x8659BD to 0xB893E8
            "mp4", "mov", "m4v", "webm" -> 0x2F8A92 to 0x66C0C7
            "txt", "md", "log" -> 0x8C7458 to 0xC4AA8A
            "ts", "js", "go", "py", "kt", "rs", "sh", "json", "yaml", "yml", "html", "css" -> 0x5469A3 to 0x8EA4DC
            "jpg", "jpeg", "png", "heic", "gif", "webp" -> 0xC1648A to 0xE69BB8
            else -> 0x9A8670 to 0xB9A690
        }
        return (0xFF000000.toInt()) or (if (night) dark else light)
    }

    /** "2.1 MB", "640 KB", "12 B" (the file cards' sizes). */
    fun size(bytes: Long): String = when {
        bytes >= 1024L * 1024 -> String.format(java.util.Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024)).replace(".0 MB", " MB")
        bytes >= 1024 -> "${(bytes + 512) / 1024} KB"
        else -> "$bytes B"
    }

    /** A new share's own id: the home appends a resend with the same id only once. */
    fun clientId(): String = "share-" + UUID.randomUUID().toString().replace("-", "").take(24)
}

/** What one call to the home came to. */
enum class Outcome {
    /** It landed. */
    Sent,
    /** The home didn't answer (no network, asleep, a 5xx): keep it, send it later. */
    Offline,
    /** The home doesn't know this phone any more: keep it a while (paired again, it goes). */
    Unpaired,
    /** The home is older than share (404): keep it until it updates. */
    TooOld,
    /** That one file is too big for the home (413): leave it out and go on. */
    TooBig,
    /** The home refused it as it is (400): it will never go; drop it. */
    Refused;

    companion object {
        fun of(status: Int): Outcome = when (status) {
            in 200..299 -> Sent
            401, 403 -> Unpaired
            404 -> TooOld
            413 -> TooBig
            in 400..499 -> Refused
            else -> Offline
        }
    }
}

/** One picture or file of an outbox entry: made ready on the phone (its bytes in the entry's folder), and its id once up. */
data class OutFile(val file: String, val name: String, val mime: String, val thumb: String? = null, val preview: String? = null, val id: String? = null) {
    fun json(): JSONObject = JSONObject().put("file", file).put("name", name).put("mime", mime).apply {
        thumb?.let { put("thumb", it) }
        preview?.let { put("preview", it) }
        id?.let { put("id", it) }
    }

    companion object {
        fun of(o: JSONObject) = OutFile(o.getString("file"), o.optString("name"), o.optString("mime", "application/octet-stream"), o.optString("thumb").ifEmpty { null }, o.optString("preview").ifEmpty { null }, o.optString("id").ifEmpty { null })
    }
}

/** A share waiting to go: everything POST /api/share needs, and its files. */
data class OutEntry(
    val clientId: String,
    val at: Long,
    val note: String = "",
    val partner: String? = null,
    val url: String? = null,
    val title: String? = null,
    val text: String? = null,
    val from: String? = null,
    val files: List<OutFile> = emptyList(),
) {
    fun json(): JSONObject = JSONObject().put("clientId", clientId).put("at", at).put("note", note).apply {
        partner?.let { put("partner", it) }
        url?.let { put("url", it) }
        title?.let { put("title", it) }
        text?.let { put("text", it) }
        from?.let { put("from", it) }
        put("files", JSONArray(files.map { it.json() }))
    }

    /** The body of POST /api/share, once every file is up. */
    fun shareBody(): JSONObject = JSONObject().put("clientId", clientId).apply {
        if (note.isNotBlank()) put("note", note)
        partner?.let { put("partner", it) }
        url?.let { put("url", it) }
        title?.let { put("title", it) }
        text?.let { put("text", it) }
        from?.let { put("from", it) }
        val ids = files.mapNotNull { it.id }
        if (ids.isNotEmpty()) put("media", JSONArray(ids))
    }

    companion object {
        fun of(o: JSONObject): OutEntry {
            val fs = o.optJSONArray("files") ?: JSONArray()
            return OutEntry(
                o.getString("clientId"), o.optLong("at"), o.optString("note"),
                o.optString("partner").ifEmpty { null }, o.optString("url").ifEmpty { null }, o.optString("title").ifEmpty { null },
                o.optString("text").ifEmpty { null }, o.optString("from").ifEmpty { null },
                (0 until fs.length()).map { OutFile.of(fs.getJSONObject(it)) },
            )
        }
    }
}

/** The outbox's next step for one entry. */
sealed class Step {
    /** Up with this file (index into files). */
    data class Upload(val index: Int) : Step()
    /** Every file is up: post the message. */
    data object Post : Step()
    /** Too old: let it go. */
    data object Expire : Step()
}

object Outbox {
    fun next(e: OutEntry, now: Long): Step {
        if (now - e.at > ShareLimits.KEEP_MS) return Step.Expire
        val i = e.files.indexOfFirst { it.id == null }
        return if (i >= 0) Step.Upload(i) else Step.Post
    }

    /** The entry after a file's upload answered: its id kept, or (too big) the file left out. */
    fun uploaded(e: OutEntry, index: Int, id: String?): OutEntry =
        if (id != null) e.copy(files = e.files.mapIndexed { i, f -> if (i == index) f.copy(id = id) else f })
        else e.copy(files = e.files.filterIndexed { i, _ -> i != index })

    // The folder: <dir>/<clientId>/share.json and the made-ready files beside it.

    fun save(dir: File, e: OutEntry) {
        val d = File(dir, e.clientId).apply { mkdirs() }
        val tmp = File(d, "share.json.tmp")
        tmp.writeText(e.json().toString())
        tmp.renameTo(File(d, "share.json"))
    }

    fun list(dir: File): List<OutEntry> =
        (dir.listFiles() ?: emptyArray()).filter { it.isDirectory }.mapNotNull { d ->
            try { OutEntry.of(JSONObject(File(d, "share.json").readText())) } catch (_: Exception) { d.deleteRecursively(); null }
        }.sortedBy { it.at }

    fun drop(dir: File, clientId: String) {
        File(dir, clientId).deleteRecursively()
    }
}
