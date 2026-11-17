package co.nowledge.ducter.android

import android.content.Context
import android.content.SharedPreferences
import java.util.Locale

/**
 * What the app remembers: which Ducter it talks to, and what the page last told it (its language
 * and the partner's name). The page keeps its own device token in its own storage; the app never
 * holds it (no notifications from the home yet that would need it without opening the app; research/51 §5).
 */
class Store(context: Context) {
    private val p: SharedPreferences = context.getSharedPreferences("ducter", Context.MODE_PRIVATE)

    /** The Ducter's base URL ("https://ducter.example.com/"), or null before the first pairing. */
    var base: String?
        get() = p.getString("base", null)
        private set(v) = p.edit().putString("base", v).apply()

    /** The first URL the web view loads: the pairing link once, then base/app. */
    fun connect(t: PairTarget): String {
        if (base != t.base) {
            // D293: another pairing: the new home says its own ways; a link names its key.
            p.edit().remove("ways").remove("device.token").remove("device.id").remove("device.name").apply()
            fp = t.fp
        }
        base = t.base
        return if (t.code != null) "${t.base}pair#c=${t.code}" else "${t.base}app"
    }

    fun forget() = p.edit().remove("base").remove("ways").remove("fp").remove("device.token").remove("device.id").remove("device.name").apply()

    // D293: following the home to its best way, without pairing again.

    /** The home's ways, as the page last handed them over. */
    var ways: List<Way>
        get() = try {
            val a = org.json.JSONArray(p.getString("ways", "[]"))
            (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { o -> o.optString("url").takeIf { it.isNotEmpty() }?.let { Way(o.optString("kind"), it, o.optBoolean("primary")) } } }
        } catch (_: Exception) {
            emptyList()
        }
        set(v) = p.edit().putString("ways", org.json.JSONArray(v.map { org.json.JSONObject().put("kind", it.kind).put("url", it.url).put("primary", it.primary) }).toString()).apply()

    /** The home's key fingerprint, pinned at pairing (the link's k, else the first ways frame). */
    var fp: String?
        get() = p.getString("fp", null)
        set(v) = p.edit().putString("fp", v).apply()

    /**
     * The device record a page at another of the home's addresses needs (its storage is per
     * origin). App-private storage, as the page's own copy is.
     */
    var deviceToken: String?
        get() = p.getString("device.token", null)
        set(v) = p.edit().putString("device.token", v).apply()

    var deviceId: String?
        get() = p.getString("device.id", null)
        set(v) = p.edit().putString("device.id", v).apply()

    var deviceName: String?
        get() = p.getString("device.name", null)
        set(v) = p.edit().putString("device.name", v).apply()

    /** The same home at another of its ways: the device stays (no pairing). Returns the page to load. */
    fun follow(url: String): String {
        val b = if (url.endsWith("/")) url else "$url/"
        base = b
        return "${b}app"
    }

    var locale: String
        get() = p.getString("locale", null) ?: if (Locale.getDefault().language == "zh") "zh" else "en"
        set(v) = p.edit().putString("locale", v).apply()

    var personaName: String
        get() = p.getString("personaName", null) ?: "Ducter"
        set(v) = p.edit().putString("personaName", v).apply()

    /** D181: when the app last asked GitHub, and the version "Later" put off (until a newer one). */
    var lastCheck: Long
        get() = p.getLong("update.lastCheck", 0)
        set(v) = p.edit().putLong("update.lastCheck", v).apply()

    var laterVersion: String?
        get() = p.getString("update.later", null)
        set(v) = p.edit().putString("update.later", v).apply()

    /** D341: the newer version GitHub last offered; until it is installed or put off, opening the app asks again. */
    var offered: String?
        get() = p.getString("update.offered", null)
        set(v) = p.edit().putString("update.offered", v).apply()

    /** The version handed to Android to install: the next launch on it says so once. */
    var installing: String?
        get() = p.getString("update.installing", null)
        set(v) = p.edit().putString("update.installing", v).apply()

    /** D200: the pair of versions "Got it" put away (HomeVersion.key). */
    var homeOlderDismissed: String?
        get() = p.getString("homeOlder.dismissed", null)
        set(v) = p.edit().putString("homeOlder.dismissed", v).apply()

    /** D209: this home's page names its code by content (?v=), so it may open from the cache. */
    var pageNamed: Boolean
        get() = p.getBoolean("pageNamed:${base ?: ""}", false)
        set(v) = p.edit().putBoolean("pageNamed:${base ?: ""}", v).apply()

    var laterAt: Long
        get() = p.getLong("update.laterAt", 0)
        set(v) = p.edit().putLong("update.laterAt", v).apply()

    /** D246: Android 13+ asked once whether Ducter may show notifications. */
    var notifyAsked: Boolean
        get() = p.getBoolean("notify.asked", false)
        set(v) = p.edit().putBoolean("notify.asked", v).apply()

    /** D278: Android has asked once whether Ducter may make calls (a call sheet's 拨打). */
    var dialAsked: Boolean
        get() = p.getBoolean("dial.asked", false)
        set(v) = p.edit().putBoolean("dial.asked", v).apply()

    /** D246: Ducter's accessibility switch has been on on this install, so restricted settings are allowed. */
    /** D317: Android reported a fold on this phone once (a FoldingFeature), so it is a foldable. */
    var sawFold: Boolean
        get() = p.getBoolean("fold.seen", false)
        set(v) { if (v != sawFold) p.edit().putBoolean("fold.seen", v).apply() }

    var handsetWasOn: Boolean
        get() = p.getBoolean("handset.wasOn", false)
        set(v) { if (v != handsetWasOn) p.edit().putBoolean("handset.wasOn", v).apply() }
}
