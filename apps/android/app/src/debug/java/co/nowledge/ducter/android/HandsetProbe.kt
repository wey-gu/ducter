package co.nowledge.ducter.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONObject

/**
 * Debug builds only (src/debug): runs one of the home's calls on the accessibility bridge and logs
 * the answer under DucterHandset, without bringing Ducter to the front. How D238 was checked on an
 * emulator with no home: `adb shell am broadcast -n <pkg>/co.nowledge.ducter.android.HandsetProbe
 * --es m screen --es a '{"session":"s1"}'`.
 */
class HandsetProbe : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val m = i.getStringExtra("m") ?: return
        val a = try { JSONObject(i.getStringExtra("a") ?: "{}") } catch (_: Exception) { JSONObject() }
        val done = goAsync()
        Handset.call(c.applicationContext, m, a) { r ->
            // The whole answer in the app's cache (`run-as <pkg> cat cache/probe.json`); a line in the log.
            java.io.File(c.cacheDir, "probe.json").writeText(r.toString())
            Log.i("DucterHandset", "$m ${r.toString().take(300)}")
            done.finish()
        }
    }
}
