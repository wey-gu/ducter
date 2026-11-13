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
    private const val LOAN_ID = 238
    private const val ACTION_STOP = "co.nowledge.ducter.HANDSET_STOP"

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

    /** The loan's notification: whose task, what it is doing or whose turn, and Stop. */
    fun loan(c: Context, words: Context, title: String, line: String) {
        if (!allowed(c)) return
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
        val n = NotificationCompat.Builder(c, LOAN)
            .setSmallIcon(R.drawable.ic_note_handset)
            .setColor(Pebble.color(c, R.color.accent))
            .setContentTitle(title)
            .setContentText(line)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .addAction(0, words.getString(R.string.handset_stop), stop)
            .build()
        try {
            NotificationManagerCompat.from(c).notify(LOAN_ID, n)
        } catch (_: SecurityException) {
        }
    }

    fun loanOver(c: Context) = NotificationManagerCompat.from(c).cancel(LOAN_ID)
}

/** 停下 / Stop in the loan's notification: the same as Stop on the pill. */
class HandsetStopReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (Handset.session != null) Handset.stopTapped(c, "stop") else Notify.loanOver(c)
    }
}
