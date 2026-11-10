package co.nowledge.ducter.android

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A newer Ducter for Android on the GitHub Release (D181). */
data class Release(
    val version: String,
    val notes: Map<String, List<String>>,
    val apkUrl: String,
    val apkName: String,
    val size: Long,
    /** GitHub's digest of the asset, else SHA256SUMS.txt's line for it. */
    val sha256: String?,
    val sumsUrl: String?,
)

sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data object Current : UpdateState
    data class Available(val r: Release) : UpdateState
    data class Downloading(val r: Release, val pct: Int) : UpdateState
    data class Verifying(val r: Release) : UpdateState
    /** Android hasn't yet let Ducter install apps: the one-time switch in Settings. */
    data class NeedsPermission(val r: Release, val apk: File) : UpdateState
    data class Installing(val r: Release) : UpdateState
    data class Failed(val r: Release?, val why: Why) : UpdateState
    /** The launch after an update: "Back, now on {v}", once. */
    data class Done(val version: String) : UpdateState
}

enum class Why { NETWORK, NO_ASSET, CHECKSUM, SIGNATURE, INSTALL }

/**
 * The app updates itself from the release, as the Mac app and the home do (D148), without a store:
 * ask GitHub for the newest published release, offer it once with its what's new, download the
 * APK only from GitHub's hosts, check its SHA-256, size, package, version and signing certificate,
 * then hand it to Android's PackageInstaller. Nothing is changed until Android installs it, and
 * Android only installs it over this app if the same key signed both (research/51 §2).
 */
object Updater {
    /** At most every 6 h without asking (D148's cadence); "Check for updates" asks now. */
    const val EVERY_MS = 6 * 60 * 60_000L
    /** "Later" puts that version off for 3 days; a newer one is offered at once. */
    const val LATER_MS = 3 * 24 * 60 * 60_000L

    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state

    fun set(s: UpdateState) { _state.value = s }

    private val local get() = BuildConfig.DEBUG && !BuildConfig.RELEASE_API.startsWith("https://api.github.com/")
    private fun allowed(url: String) = Asset.trusted(url) || local

    fun current(c: Context): String = Versions.bare(c.packageManager.getPackageInfo(c.packageName, 0).versionName ?: "0.0.0")

    /** Should a quiet check (at launch, back in front) offer this release? */
    fun shouldOffer(store: Store, r: Release, now: Long): Boolean =
        !(store.laterVersion == r.version && now - store.laterAt < LATER_MS)

    /**
     * Asks GitHub. A newer release → Available; none → Current; offline → Failed(NETWORK). Quiet
     * (at launch, back in front): only a newer version not put off with "Later" is shown at all.
     */
    suspend fun check(c: Context, store: Store, quiet: Boolean = false): UpdateState = withContext(Dispatchers.IO) {
        if (!quiet) set(UpdateState.Checking)
        val s = try {
            val j = JSONObject(get(BuildConfig.RELEASE_API, "application/vnd.github+json").decodeToString())
            store.lastCheck = System.currentTimeMillis()
            val version = Versions.bare(j.optString("tag_name"))
            if (j.optBoolean("draft") || j.optBoolean("prerelease") || !Versions.isVersion(version) ||
                Versions.compare(version, current(c)) <= 0
            ) {
                UpdateState.Current
            } else {
                val r = release(j, version)
                if (r == null) UpdateState.Failed(null, Why.NO_ASSET) else UpdateState.Available(r)
            }
        } catch (_: IOException) {
            UpdateState.Failed(null, Why.NETWORK)
        } catch (_: org.json.JSONException) {
            UpdateState.Failed(null, Why.NETWORK)
        }
        val offer = s is UpdateState.Available && shouldOffer(store, s.r, System.currentTimeMillis())
        if (!quiet || offer) set(s)
        s
    }

    internal fun release(j: JSONObject, version: String): Release? {
        val assets = j.optJSONArray("assets") ?: return null
        val want = Asset.name(version)
        var apk: JSONObject? = null
        var sums: String? = null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            when (a.optString("name")) {
                want -> apk = a
                "SHA256SUMS.txt" -> sums = a.optString("browser_download_url").takeIf { it.isNotEmpty() }
            }
        }
        val a = apk ?: return null
        return Release(
            version = version,
            notes = WhatsNew.parse(j.optString("body")),
            apkUrl = a.optString("browser_download_url"),
            apkName = want,
            size = a.optLong("size", 0),
            sha256 = Asset.sumFromDigest(a.optString("digest").takeIf { it.isNotEmpty() }),
            sumsUrl = sums,
        )
    }

    /** Downloads and checks the APK, then installs it (or asks for the one-time permission). */
    suspend fun download(c: Context, r: Release) = withContext(Dispatchers.IO) {
        set(UpdateState.Downloading(r, 0))
        val dir = File(c.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { if (it.name != r.apkName) it.delete() }
        val out = File(dir, r.apkName)
        val sum = try {
            val want = r.sha256 ?: r.sumsUrl?.let { Asset.sumFromList(get(it, "text/plain").decodeToString(), r.apkName) }
            if (want == null) {
                set(UpdateState.Failed(r, Why.CHECKSUM))
                return@withContext
            }
            val got = fetchTo(r.apkUrl, out) { pct -> set(UpdateState.Downloading(r, pct)) }
            if (r.size > 0 && out.length() != r.size) "" to want else got to want
        } catch (_: IOException) {
            out.delete()
            set(UpdateState.Failed(r, Why.NETWORK))
            return@withContext
        }
        set(UpdateState.Verifying(r))
        if (sum.first != sum.second) {
            out.delete()
            set(UpdateState.Failed(r, Why.CHECKSUM))
            return@withContext
        }
        if (!sameApp(c, out)) {
            out.delete()
            set(UpdateState.Failed(r, Why.SIGNATURE))
            return@withContext
        }
        install(c, r, out)
    }

    /** Same package, a higher versionCode, and signed by the same key as this app. */
    private fun sameApp(c: Context, apk: File): Boolean {
        val pm = c.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        val theirs = pm.getPackageArchiveInfo(apk.path, flags) ?: return false
        val ours = pm.getPackageInfo(c.packageName, flags)
        if (theirs.packageName != c.packageName) return false
        if (code(theirs) <= code(ours)) return false
        return signers(theirs) == signers(ours) && signers(ours).isNotEmpty()
    }

    private fun code(p: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else @Suppress("DEPRECATION") p.versionCode.toLong()

    private fun signers(p: PackageInfo): Set<String> {
        val sigs = if (Build.VERSION.SDK_INT >= 28) p.signingInfo?.let { if (it.hasMultipleSigners()) it.apkContentsSigners else it.signingCertificateHistory } else @Suppress("DEPRECATION") p.signatures
        return sigs?.map { Asset.hex(Asset.sha256().digest(it.toByteArray())) }?.toSet() ?: emptySet()
    }

    /** Hands a checked APK to Android. The first time, Android wants Ducter allowed to install apps. */
    fun install(c: Context, r: Release, apk: File) {
        if (!c.packageManager.canRequestPackageInstalls()) {
            set(UpdateState.NeedsPermission(r, apk))
            return
        }
        set(UpdateState.Installing(r))
        Store(c).installing = r.version
        try {
            val pi = c.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(c.packageName)
                // Where Android allows it (12+, the app installed itself last time), no second tap.
                if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val id = pi.createSession(params)
            pi.openSession(id).use { s ->
                s.openWrite("ducter.apk", 0, apk.length()).use { o ->
                    apk.inputStream().use { it.copyTo(o) }
                    s.fsync(o)
                }
                val intent = Intent(c, InstallReceiver::class.java).putExtra("version", r.version)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                s.commit(PendingIntent.getBroadcast(c, id, intent, flags).intentSender)
            }
        } catch (_: Exception) {
            set(UpdateState.Failed(r, Why.INSTALL))
        }
    }

    // MARK: http, GitHub's hosts only

    private fun open(url: String, accept: String): HttpURLConnection {
        var u = url
        repeat(6) {
            if (!allowed(u)) throw IOException("not GitHub: $u")
            val c = (URL(u).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 10_000
                readTimeout = 20_000
                setRequestProperty("accept", accept)
                setRequestProperty("user-agent", "ducter-android/${BuildConfig.VERSION_NAME}")
            }
            val code = c.responseCode
            if (code in 300..399) {
                u = URL(URL(u), c.getHeaderField("location") ?: throw IOException("redirect without location")).toString()
                c.disconnect()
                return@repeat
            }
            if (code !in 200..299) {
                c.disconnect()
                throw IOException("GitHub answered $code")
            }
            return c
        }
        throw IOException("too many redirects")
    }

    private fun get(url: String, accept: String): ByteArray = open(url, accept).let { c -> c.inputStream.use { it.readBytes() }.also { c.disconnect() } }

    /** Streams to a file and returns its SHA-256. */
    private fun fetchTo(url: String, out: File, progress: (Int) -> Unit): String {
        val c = open(url, "application/octet-stream")
        val total = c.contentLengthLong
        val d = Asset.sha256()
        var n = 0L
        var last = -1
        c.inputStream.use { inp ->
            out.outputStream().use { o ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val k = inp.read(buf)
                    if (k < 0) break
                    o.write(buf, 0, k)
                    d.update(buf, 0, k)
                    n += k
                    if (total > 0) {
                        val pct = (n * 100 / total).toInt()
                        if (pct != last) { last = pct; progress(pct) }
                    }
                }
            }
        }
        c.disconnect()
        return Asset.hex(d.digest())
    }
}
