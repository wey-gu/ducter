package co.nowledge.ducter.android

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * D206: the page's 加图片 / Add images in the app. A web view shows no file chooser by itself:
 * this opens Android's own picker (Photos, Files; several at once), with the camera as its first
 * choice when the app may use it (the QR scan already asked). A photo taken lands in the app's
 * cache and is handed to the page like a picked one; the page scales it and strips its EXIF.
 * Save in the picture viewer arrives as a download (`&dl=1`) and goes to Downloads.
 */
class Pictures(private val activity: ComponentActivity) {
    private var pending: ValueCallback<Array<Uri>>? = null
    private var shot: Uri? = null
    private val launcher: ActivityResultLauncher<Intent> =
        activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
            val cb = pending
            pending = null
            cb?.onReceiveValue(if (r.resultCode == Activity.RESULT_OK) urisOf(r.data) else null)
        }

    private fun urisOf(data: Intent?): Array<Uri>? {
        val clip = data?.clipData
        if (clip != null && clip.itemCount > 0) return Array(clip.itemCount) { clip.getItemAt(it).uri }
        data?.data?.let { return arrayOf(it) }
        // The camera writes to the file it was given and answers with no data.
        return shot?.let { arrayOf(it) }
    }

    val chrome = object : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            pending?.onReceiveValue(null)
            pending = cb
            shot = null
            val pick = params.createIntent().apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
            val chooser = Intent.createChooser(pick, null)
            camera()?.let { chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(it)) }
            return try {
                launcher.launch(chooser)
                true
            } catch (_: ActivityNotFoundException) {
                pending = null
                false
            }
        }
    }

    /** The camera, writing into the app's cache (shared through its FileProvider); none without the permission. */
    private fun camera(): Intent? {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return null
        val dir = File(activity.cacheDir, "shots").apply { mkdirs() }
        dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24 * 3600_000L }?.forEach { it.delete() }
        val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
        shot = uri
        return Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
    }

    /** Save in the viewer: the picture to Downloads (the URL carries its own key; no token rides along). */
    fun download(url: String, contentDisposition: String?, mime: String?) {
        val name = URLUtil.guessFileName(url, contentDisposition, mime)
        val req = DownloadManager.Request(Uri.parse(url))
            .setMimeType(mime)
            .setTitle(name)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        (activity.getSystemService(Activity.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
    }
}
