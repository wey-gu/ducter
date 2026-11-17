package co.nowledge.ducter.android

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * D246: what the Android app shows in Android's notifications, and when it asks.
 *
 * One kind today: **在用这台手机 / Using this phone**, the whole time a task borrows this phone
 * (D238), with 停下 / Stop: the second place for Stop beside the pill, and the one that is still
 * there when the pill is hidden by a full-screen app or the shade is pulled down. Its channel is
 * made at launch, so Android's App info lists it from the first run (Android says an app with none
 * "doesn't send notifications"). Messages from the home (a decision, a task that needs you) are
 * not here yet: the WebView has no Web Push, and the push path (UnifiedPush, D181 (4)) is in todo;
 * a channel for them is made only when they are sent.
 *
 * Asked once (Android 13+), at the moment it starts to matter: when 用这台手机 is turned on and the
 * app comes back by itself, or at the next open of a phone where it was already on.
 */
object Notify {
    const val LOAN = "handset"
    const val LOAN_ID = 238
    private const val ACTION_STOP = "co.nowledge.ducter.HANDSET_STOP"
    /** D331: the link's quiet standby notification (Android's switch on, not lent), on a channel of its own the person may hide. */
    const val READY = "handset_ready"
    const val READY_ID = 239
    /** D331: a Go waiting for the unlock, and the question after unlocking a paused loan: one tap on the phone. */
    const val ASK = "handset_ask"
    const val WAIT_ID = 240
    const val RESUME_ID = 241
    const val ACTION_WAIT_NO = "co.nowledge.ducter.HANDSET_WAIT_NO"
    const val ACTION_RESUME_GO = "co.nowledge.ducter.HANDSET_RESUME_GO"
    const val ACTION_RESUME_NO = "co.nowledge.ducter.HANDSET_RESUME_NO"

    /** The channels, named in the phone's language (made again when it changes: same id, new name). */
    fun channels(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(LOAN, c.getString(R.string.notify_loan_channel), NotificationManager.IMPORTANCE_LOW).apply {
                description = c.getString(R.string.notify_loan_channel_about)
                setShowBadge(false)
            },
        )
        // D331: quiet (no sound, no icon in the status bar); the person can hide it in Android's settings.
        nm.createNotificationChannel(
            NotificationChannel(READY, c.getString(R.string.notify_ready_channel), NotificationManager.IMPORTANCE_MIN).apply {
                description = c.getString(R.string.notify_ready_channel_about)
                setShowBadge(false)
            },
        )
        // D331: the person's own next step on this phone (unlock to start; keep lending after unlocking): seen at once.
        nm.createNotificationChannel(
            NotificationChannel(ASK, c.getString(R.string.notify_ask_channel), NotificationManager.IMPORTANCE_HIGH).apply {
                description = c.getString(R.string.notify_ask_channel_about)
                setShowBadge(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
            },
        )
    }

    fun allowed(c: Context) = NotificationManagerCompat.from(c).areNotificationsEnabled()

    /**
     * Android 13+: ask once whether Ducter may show notifications, when 用这台手机 is on (the only
     * thing it shows is the loan's). Never again after an answer: Android's own App info changes it.
     */
    fun askOnce(a: Activity, store: Store) {
        if (Build.VERSION.SDK_INT < 33 || store.notifyAsked) return
        if (a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        if (!Handset.enabled(a)) return
        store.notifyAsked = true
        a.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 246)
    }

    /**
     * D306: the person tapped Show in notifications: Android 13+ asks then, if it never asked
     * (the tap is the moment it starts to matter). Never again after an answer.
     */
    fun askOnceForGlance(a: Activity, store: Store) {
        if (Build.VERSION.SDK_INT < 33 || store.notifyAsked) return
        if (a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        store.notifyAsked = true
        a.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 306)
    }

    /** What the loan's notification says now (D255: the link's foreground service shows the same one). */
    private var last: Triple<Context, String, String>? = null
    private var rec: String? = null

    /** The loan's notification: whose task, what it is doing or whose turn, and Stop. */
    fun loan(c: Context, words: Context, title: String, line: String) {
        last = Triple(words, title, line)
        if (!allowed(c)) return
        try {
            NotificationManagerCompat.from(c).notify(LOAN_ID, build(c, words, title, line))
        } catch (_: SecurityException) {
        }
    }

    /** D255: recording: the line says so (and goes back when it stops). */
    fun recording(c: Context, on: Boolean, words: String) {
        rec = if (on) words else null
        val (w, t, l) = last ?: return
        if (!allowed(c)) return
        try {
            NotificationManagerCompat.from(c).notify(LOAN_ID, build(c, w, t, l))
        } catch (_: SecurityException) {
        }
    }

    /** D255: the loan's notification for the link's foreground service (the same id: one notification). */
    fun loanNotification(c: Context): android.app.Notification? = last?.let { (w, t, l) -> build(c, w, t, l) }

    /** Before the pill has said anything: the channel's own words. */
    fun quietNotification(c: Context, line: String? = null): android.app.Notification = build(c, c, c.getString(R.string.notify_loan_channel), line ?: c.getString(R.string.handset_link_fgs))

    private fun build(c: Context, words: Context, title: String, line0: String): android.app.Notification {
        val line = line0
        // Made at launch in the app's language; only if it is missing, here, in the pill's (a service's own
        // resources may not follow the app's language: seen on the emulator).
        if (Build.VERSION.SDK_INT >= 26 && c.getSystemService(NotificationManager::class.java)?.getNotificationChannel(LOAN) == null) channels(words)
        val open = PendingIntent.getActivity(
            c, 0, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getBroadcast(
            c, 1, Intent(c, HandsetStopReceiver::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(c, LOAN)
            .setSmallIcon(R.drawable.ic_note_handset)
            .setColor(Pebble.color(c, R.color.accent))
            .setContentTitle(title)
            .setContentText(line)
            // D291: recording is its own fact, the header's sub text, not glued to the line.
            .setSubText(rec)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .addAction(0, words.getString(R.string.handset_stop), stop)
            // D255: the link's foreground service shows it at once (Android may otherwise wait 10 s).
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    fun cancel(c: Context, id: Int) = try {
        NotificationManagerCompat.from(c).cancel(id)
    } catch (_: Exception) {
    }

    /** D331: Android's switch is on and the phone isn't lent: the link's quiet notification. */
    fun readyNotification(c: Context): android.app.Notification {
        if (Build.VERSION.SDK_INT >= 26 && c.getSystemService(NotificationManager::class.java)?.getNotificationChannel(READY) == null) channels(c)
        val open = PendingIntent.getActivity(c, 2, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(c, READY)
            .setSmallIcon(R.drawable.ic_note_handset)
            .setColor(Pebble.color(c, R.color.accent))
            .setContentTitle(Handset.words(c, R.string.notify_ready_channel))
            .setContentText(Handset.words(c, R.string.handset_ready_line))
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun ask(c: Context, id: Int, title: String, line: String, public: String, actions: List<Pair<String, String>>) {
        if (!allowed(c)) return
        if (Build.VERSION.SDK_INT >= 26 && c.getSystemService(NotificationManager::class.java)?.getNotificationChannel(ASK) == null) channels(c)
        val open = PendingIntent.getActivity(c, id, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        // On the lock screen only what it is, never the task's title (D331: the person's work stays theirs).
        val shown = NotificationCompat.Builder(c, ASK).setSmallIcon(R.drawable.ic_note_handset).setContentTitle(public).build()
        val b = NotificationCompat.Builder(c, ASK)
            .setSmallIcon(R.drawable.ic_note_handset)
            .setColor(Pebble.color(c, R.color.accent))
            .setContentTitle(title)
            .setContentText(line)
            .setStyle(NotificationCompat.BigTextStyle().bigText(line))
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(shown)
            .setContentIntent(open)
        for ((i, a) in actions.withIndex()) {
            val pi = PendingIntent.getBroadcast(c, id * 10 + i, Intent(c, HandsetAskReceiver::class.java).setAction(a.second), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            b.addAction(0, a.first, pi)
        }
        try {
            NotificationManagerCompat.from(c).notify(id, b.build())
        } catch (_: SecurityException) {
        }
    }

    /** D331: a Go reached this phone while it was locked: unlocking starts the loan (it never goes through the lock). */
    fun waiting(c: Context, task: String) = ask(
        c, WAIT_ID,
        Handset.words(c, R.string.handset_wait_title, task),
        Handset.words(c, R.string.handset_wait_line),
        Handset.words(c, R.string.handset_wait_public),
        listOf(Handset.words(c, R.string.handset_not_now) to ACTION_WAIT_NO),
    )

    /** D331: unlocked after the person's lock paused a loan: keep lending it, or not now. Never resumes by itself. */
    fun resume(c: Context, task: String) = ask(
        c, RESUME_ID,
        Handset.words(c, R.string.handset_resume_title, task),
        Handset.words(c, R.string.handset_resume_line),
        Handset.words(c, R.string.handset_resume_title, task),
        listOf(Handset.words(c, R.string.handset_not_now) to ACTION_RESUME_NO, Handset.words(c, R.string.handset_resume_go) to ACTION_RESUME_GO),
    )

    fun loanOver(c: Context) {
        last = null
        rec = null
        NotificationManagerCompat.from(c).cancel(LOAN_ID)
    }
}

/** D331: the phone's own answers: 不借了 on a Go waiting for the unlock; 继续借给它 / 不借了 after unlocking a paused loan. */
class HandsetAskReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        when (i.action) {
            Notify.ACTION_WAIT_NO -> Handset.declineWaiting(c)
            Notify.ACTION_RESUME_GO -> Handset.resume(c)
            Notify.ACTION_RESUME_NO -> if (Handset.session != null) Handset.stopTapped(c, "taken") else Notify.cancel(c, Notify.RESUME_ID)
        }
    }
}

/** 停下 / Stop in the loan's notification: the same as Stop on the pill. */

class HandsetStopReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (Handset.session != null) Handset.stopTapped(c, "stop") else Notify.loanOver(c)
    }
}
