package co.nowledge.ducter.android

import android.content.Context
import android.content.SharedPreferences
import java.util.Locale

/**
 * What the app remembers: which Ducter it talks to, and what the page last told it (its language
 * and the partner's name). The page keeps its own device token in its own storage; the app never
 * holds it (no notifications yet that would need it without opening the app; research/51 §5).
 */
class Store(context: Context) {
    private val p: SharedPreferences = context.getSharedPreferences("ducter", Context.MODE_PRIVATE)

    /** The Ducter's base URL ("https://ducter.example.com/"), or null before the first pairing. */
    var base: String?
        get() = p.getString("base", null)
        private set(v) = p.edit().putString("base", v).apply()

    /** The first URL the web view loads: the pairing link once, then base/app. */
    fun connect(t: PairTarget): String {
        base = t.base
        return if (t.code != null) "${t.base}pair#c=${t.code}" else "${t.base}app"
    }

    fun forget() = p.edit().remove("base").apply()

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

    /** The version handed to Android to install: the next launch on it says so once. */
    var installing: String?
        get() = p.getString("update.installing", null)
        set(v) = p.edit().putString("update.installing", v).apply()

    /** D200: the pair of versions "Got it" put away (HomeVersion.key). */
    var homeOlderDismissed: String?
        get() = p.getString("homeOlder.dismissed", null)
        set(v) = p.edit().putString("homeOlder.dismissed", v).apply()

    /** D206: this home's page names its code by content (?v=), so it may open from the cache. */
    var pageNamed: Boolean
        get() = p.getBoolean("pageNamed:${base ?: ""}", false)
        set(v) = p.edit().putBoolean("pageNamed:${base ?: ""}", v).apply()

    var laterAt: Long
        get() = p.getLong("update.laterAt", 0)
        set(v) = p.edit().putLong("update.laterAt", v).apply()
}
