package co.nowledge.ducter.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * D306: at a glance on Android: one ongoing notification for a task the person chose to keep in
 * sight (在通知栏显示 / Show in notifications, in an opened task) or a call that is live. Never for
 * every task, never a count, never a sound: it only says the phase (在做 / 等你 / 通话中 …) and how
 * long, and goes away by itself when it is over.
 *
 * The Android app has no push from the home yet (UnifiedPush is in todo, D181 (4)), so the page
 * keeps it true while the app is alive. When the app stops hearing (the page frozen in the
 * background), the notification times out after [QUIET_MS] instead of showing a phase it can no
 * longer vouch for: gone rather than wrong.
 */
object Glance {
    const val CHANNEL = "glance"
    private const val BASE_ID = 306_000
    /** Without a fresh word from the page for this long, the notification goes. */
    const val QUIET_MS = 20 * 60_000L
    /** A finished one rests this long, then goes. */
    const val ENDED_MS = 15 * 60_000L

    val ENDED = setOf("done", "failed", "cancelled", "called", "no_answer", "not_connected")
    fun needsYou(phase: String) = phase == "needs_you" || phase == "asking"

    /** What one notification shows: pure, so the rules are tested on the JVM. */
    data class Line(val title: String, val phase: String, val sinceMs: Long, val ongoing: Boolean, val chronometer: Boolean, val timeoutMs: Long, val accent: Boolean) {
        companion object {
            fun of(title: String, phase: String, sinceS: Long): Line? {
                if (title.isBlank() || phase !in PHASES) return null
                val ended = phase in ENDED
                return Line(title.trim().take(80), phase, sinceS * 1000, ongoing = !ended, chronometer = !ended, timeoutMs = if (ended) ENDED_MS else QUIET_MS, accent = needsYou(phase))
            }
        }
    }

    val PHASES = setOf("working", "waiting", "needs_you", "done", "failed", "cancelled", "calling", "talking", "asking", "called", "no_answer", "not_connected")

    /** One notification per thing: its id from the kind and id, stable while it lives. */
    fun idOf(kind: String, id: String) = BASE_ID + ("$kind:$id".hashCode() and 0x3FF)

    private val shown = mutableMapOf<String, String>() // "kind:id" -> title

    fun channel(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, c.getString(R.string.glance_channel), NotificationManager.IMPORTANCE_LOW).apply {
                description = c.getString(R.string.glance_channel_about)
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            },
        )
    }

    fun shown(): List<Pair<String, String>> = shown.keys.map { it.substringBefore(':') to it.substringAfter(':') }

    /** Shows or refreshes it; false when Android won't show it (notifications off). */
    fun show(c: Context, kind: String, id: String, title: String?, phase: String, sinceS: Long): Boolean {
        val key = "$kind:$id"
        val t = title?.takeIf { it.isNotBlank() } ?: shown[key] ?: return false
        val line = Line.of(t, phase, sinceS) ?: return false
        if (!Notify.allowed(c)) return false
        channel(c)
        val open = PendingIntent.getActivity(
            c, idOf(kind, id), Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_note_glance)
            .setColor(Pebble.color(c, R.color.accent))
            .setContentTitle(line.title)
            .setContentText(c.getString(phaseRes(phase)))
            .setOngoing(line.ongoing)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(line.chronometer)
            .setWhen(line.sinceMs)
            .setUsesChronometer(line.chronometer)
            .setTimeoutAfter(line.timeoutMs)
            .setCategory(if (kind == "call") NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(open)
            .build()
        return try {
            NotificationManagerCompat.from(c).notify(idOf(kind, id), n)
            if (line.ongoing) shown[key] = t else shown.remove(key)
            true
        } catch (_: SecurityException) {
            false
        }
    }

    fun hide(c: Context, kind: String, id: String) {
        shown.remove("$kind:$id")
        NotificationManagerCompat.from(c).cancel(idOf(kind, id))
    }

    fun phaseRes(phase: String) = when (phase) {
        "working" -> R.string.glance_working
        "waiting" -> R.string.glance_waiting
        "needs_you" -> R.string.glance_needs_you
        "done" -> R.string.glance_done
        "failed" -> R.string.glance_failed
        "cancelled" -> R.string.glance_cancelled
        "calling" -> R.string.glance_calling
        "talking" -> R.string.glance_talking
        "asking" -> R.string.glance_asking
        "called" -> R.string.glance_called
        "no_answer" -> R.string.glance_no_answer
        else -> R.string.glance_not_connected
    }
}
