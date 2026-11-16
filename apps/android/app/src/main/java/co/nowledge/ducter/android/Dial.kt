package co.nowledge.ducter.android

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telecom.TelecomManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * D278: 你来打 / You call. The person calls from their own number with the partner's call sheet;
 * this app dials it in one tap and keeps the sheet in a notification during the call (pull the
 * shade down over the in-call screen to read it). research/89 §4.A: a third-party app may place a
 * call with CALL_PHONE (a runtime prompt, asked once, the first time) and never touches call audio.
 *
 * What it does, all of it: dial one E.164 number a sheet holds, with the person's tap (here or in
 * another window of theirs), and show that sheet. It never answers, records, reads or ends a call.
 * Without the permission it opens the dialer with the number filled (the person presses call); in
 * the background without it, a notification to tap (Android lets no app start a screen from there).
 */
object Dial {
    const val CHANNEL = "callsheet"
    const val NOTE_ID = 278
    /** The sheet stays in the shade this long, then goes by itself (a call is rarely longer). */
    private const val KEEP_MS = 45 * 60_000L

    /** Only a full international number: + and 8 to 15 digits (the home's e164 rule). */
    fun telOk(to: String): Boolean = Regex("^\\+[1-9]\\d{7,14}$").matches(to)

    /** "granted" (it rings at once), "ask" (Android asks once), "denied" (the dialer, filled); null: no phone radio. */
    fun state(c: Context): String? {
        if (!c.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) return null
        if (c.checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) return "granted"
        return if (Store(c).dialAsked) "denied" else "ask"
    }

    /** What the page sent: the number, who, and the sheet. */
    data class Sheet(val callId: String, val to: String, val name: String, val goal: String, val open: String, val ask: List<String>, val dont: List<String>, val note: List<String>) {
        companion object {
            fun from(m: JSONObject): Sheet? {
                val to = m.optString("to")
                if (!telOk(to)) return null
                val s = m.optJSONObject("sheet") ?: JSONObject()
                fun list(k: String) = s.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it).trim() }.filter { it.isNotEmpty() }.take(8) } ?: emptyList()
                return Sheet(m.optString("callId").take(64), to, m.optString("name").take(80), s.optString("goal").take(300), s.optString("open").take(300), list("ask"), list("dont"), list("note"))
            }
        }
    }

    /** The notification's body: the first words set apart, then the questions, what not to share, what to note. */
    fun text(s: Sheet, labels: Labels): String = buildList {
        val colon = if (labels.latin) ": " else "："
        if (s.open.isNotEmpty()) add("${labels.open}$colon${s.open}")
        fun group(label: String, items: List<String>) {
            if (items.isEmpty()) return
            add(label + colon.trim() + items.joinToString("") { "\n· $it" })
        }
        group(labels.ask, s.ask)
        group(labels.dont, s.dont)
        group(labels.note, s.note)
    }.joinToString("\n\n")

    data class Labels(val open: String, val ask: String, val dont: String, val note: String, val latin: Boolean)

    private fun labels(c: Context) = Labels(c.getString(R.string.sheet_open), c.getString(R.string.sheet_ask), c.getString(R.string.sheet_dont), c.getString(R.string.sheet_note), !c.getString(R.string.sheet_open).any { it.code > 0x2E80 })

    fun channel(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, c.getString(R.string.sheet_channel), NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = c.getString(R.string.sheet_channel_about)
                setSound(null, null)
                setShowBadge(false)
            },
        )
    }

    /** Places the call now (the permission is on): Telecom dials from the SIM, no screen needed. */
    fun place(c: Context, to: String): Boolean = try {
        val tm = c.getSystemService(TelecomManager::class.java)
        if (tm != null) tm.placeCall(Uri.fromParts("tel", to, null), Bundle()) else c.startActivity(Intent(Intent.ACTION_CALL, Uri.fromParts("tel", to, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: SecurityException) {
        false
    } catch (_: Exception) {
        false
    }

    /** The dialer with the number filled: the person presses call (no permission needed). */
    fun dialer(c: Context, to: String): Boolean = try {
        c.startActivity(Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", to, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: Exception) {
        false
    }

    /**
     * The sheet in the shade during the call. tapToDial: the app was behind another screen without
     * the permission, so the notification itself is the dial (tap it: the dialer, filled).
     */
    fun show(c: Context, s: Sheet, tapToDial: Boolean): Boolean {
        if (!Notify.allowed(c)) return false
        channel(c)
        val tap = if (tapToDial) {
            PendingIntent.getActivity(c, 2, Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", s.to, null)), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        } else {
            PendingIntent.getActivity(c, 3, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val body = text(s, labels(c))
        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_note_handset)
            .setColor(Pebble.color(c, R.color.accent))
            .setContentTitle(c.getString(if (tapToDial) R.string.sheet_tap else R.string.sheet_title, s.name))
            .setContentText(s.open.ifEmpty { s.goal })
            .setStyle(NotificationCompat.BigTextStyle().bigText(body.ifEmpty { s.goal }))
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(tap)
            .setAutoCancel(tapToDial)
            .setTimeoutAfter(KEEP_MS)
            .build()
        return try {
            NotificationManagerCompat.from(c).notify(NOTE_ID, n)
            true
        } catch (_: SecurityException) {
            false
        }
    }
}
