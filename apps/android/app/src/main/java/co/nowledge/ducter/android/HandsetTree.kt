package co.nowledge.ducter.android

/**
 * D238: the screen of another app, as the home reads it. The accessibility tree is written in
 * uiautomator's own XML shape, so the home reads the person's phone with the very parser it reads
 * Ducter's phone with (packages/core/src/android/screen.ts parseDump). Pure: a node model in, a
 * string out (unit-tested on the JVM). What is never sent: a password field's text (only that it
 * is one), and anything outside the window in front.
 */
data class TreeNode(
    val cls: String,
    val pkg: String,
    val text: String?,
    val desc: String?,
    val id: String?,
    val bounds: IntArray, // left, top, right, bottom in screen pixels
    val clickable: Boolean = false,
    val longClickable: Boolean = false,
    val checkable: Boolean = false,
    val checked: Boolean = false,
    val scrollable: Boolean = false,
    val enabled: Boolean = true,
    val focused: Boolean = false,
    val password: Boolean = false,
    val editable: Boolean = false,
    /** The field shows its hint, not text typed into it (Android 8+). */
    val hint: Boolean = false,
    val kids: List<TreeNode> = emptyList(),
)

object HandsetTree {
    /** Deep trees (a web view's) are cut here: the model reads the first screenful anyway. */
    const val MAX_NODES = 1500
    const val MAX_TEXT = 300

    fun xml(root: TreeNode?): String {
        val b = StringBuilder("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">")
        var n = 0
        fun walk(x: TreeNode, index: Int) {
            if (n++ >= MAX_NODES) return
            // A password field says what it is and never its text; a field showing its hint has none.
            val text = if (x.password || x.hint) "" else (x.text ?: "").take(MAX_TEXT)
            val cls = if (x.editable && !x.cls.contains("EditText")) "android.widget.EditText" else x.cls
            b.append("<node index=\"").append(index).append('"')
            attr(b, "text", text)
            attr(b, "resource-id", x.id ?: "")
            attr(b, "class", cls)
            attr(b, "package", x.pkg)
            attr(b, "content-desc", if (x.password) "" else (x.desc ?: "").take(MAX_TEXT))
            flag(b, "checkable", x.checkable)
            flag(b, "checked", x.checked)
            flag(b, "clickable", x.clickable)
            flag(b, "enabled", x.enabled)
            flag(b, "focused", x.focused)
            flag(b, "scrollable", x.scrollable)
            flag(b, "long-clickable", x.longClickable)
            flag(b, "password", x.password)
            b.append(" bounds=\"[").append(x.bounds[0]).append(',').append(x.bounds[1]).append("][").append(x.bounds[2]).append(',').append(x.bounds[3]).append("]\"")
            if (x.kids.isEmpty()) {
                b.append(" />")
                return
            }
            b.append('>')
            x.kids.forEachIndexed { i, k -> walk(k, i) }
            b.append("</node>")
        }
        if (root != null) walk(root, 0)
        return b.append("</hierarchy>").toString()
    }

    private fun attr(b: StringBuilder, name: String, v: String) {
        b.append(' ').append(name).append("=\"").append(escape(v)).append('"')
    }

    private fun flag(b: StringBuilder, name: String, v: Boolean) {
        b.append(' ').append(name).append("=\"").append(v).append('"')
    }

    fun escape(s: String): String {
        val o = StringBuilder(s.length)
        for (c in s) when (c) {
            '&' -> o.append("&amp;")
            '<' -> o.append("&lt;")
            '>' -> o.append("&gt;")
            '"' -> o.append("&quot;")
            '\'' -> o.append("&apos;")
            '\n', '\r' -> o.append("&#10;")
            else -> if (c.code >= 0x20 || c == '\t') o.append(c)
        }
        return o.toString()
    }

    /** Key codes the home may press, and what Android calls each (GLOBAL_ACTION_* or an editor action). */
    fun keyOf(code: String): String? = when (code) {
        "KEYCODE_BACK" -> "back"
        "KEYCODE_HOME" -> "home"
        "KEYCODE_APP_SWITCH" -> "recents"
        "KEYCODE_ENTER" -> "enter"
        "KEYCODE_DEL" -> "delete"
        else -> null
    }

    /** What typing adds to a field: its text so far (none while it shows its hint), then the new words. */
    fun typed(current: CharSequence?, showingHint: Boolean, add: String): String = (if (showingHint) "" else current?.toString() ?: "") + add

    /** One character less (Backspace), by code point so an emoji or a CJK surrogate pair goes whole. */
    fun backspace(current: CharSequence?, showingHint: Boolean): String {
        val s = if (showingHint) "" else current?.toString() ?: ""
        if (s.isEmpty()) return s
        return s.substring(0, s.offsetByCodePoints(s.length, -1))
    }
}
