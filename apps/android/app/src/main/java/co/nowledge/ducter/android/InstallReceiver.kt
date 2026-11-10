package co.nowledge.ducter.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/** Android's word on an update's install (D179). On success Android restarts the app itself. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        val st = Updater.state.value
        val r = (st as? UpdateState.Installing)?.r ?: (st as? UpdateState.Verifying)?.r
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Android's own "Update this app?" (the first update, some phones every time).
                val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { c.startActivity(it) }
            }
            PackageInstaller.STATUS_SUCCESS -> Updater.set(UpdateState.Idle)
            PackageInstaller.STATUS_FAILURE_CONFLICT, PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> Updater.set(UpdateState.Failed(r, Why.SIGNATURE))
            // Turned down in Android's dialog: back to the offer, nothing changed.
            PackageInstaller.STATUS_FAILURE_ABORTED -> Updater.set(if (r != null) UpdateState.Available(r) else UpdateState.Idle)
            else -> Updater.set(UpdateState.Failed(r, Why.INSTALL))
        }
    }
}
