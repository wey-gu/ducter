package co.nowledge.ducter.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** D238: the person's screen in uiautomator's XML shape (read on the home by screen.ts parseDump). */
class HandsetTreeTest {
    private val chat = TreeNode(
        cls = "android.widget.FrameLayout", pkg = "com.tencent.mm", text = null, desc = null, id = null, bounds = intArrayOf(0, 0, 1080, 2400),
        kids = listOf(
            TreeNode("android.widget.EditText", "com.tencent.mm", "周六见 & <到时候>", null, "com.tencent.mm:id/input", intArrayOf(0, 2200, 900, 2300), clickable = true, editable = true, focused = true),
            TreeNode("android.widget.EditText", "com.tencent.mm", "hunter2", null, "com.tencent.mm:id/pw", intArrayOf(0, 2000, 900, 2100), clickable = true, editable = true, password = true),
            TreeNode("android.widget.Button", "com.tencent.mm", "发送", null, null, intArrayOf(900, 2200, 1080, 2300), clickable = true),
            TreeNode("android.widget.EditText", "com.tencent.mm", "搜索", null, null, intArrayOf(0, 100, 1080, 200), clickable = true, editable = true, hint = true),
        ),
    )

    @Test fun shapeAndEscapes() {
        val x = HandsetTree.xml(chat)
        assertTrue(x.startsWith("<?xml"))
        assertTrue(x.endsWith("</hierarchy>"))
        assertTrue(x.contains("text=\"周六见 &amp; &lt;到时候&gt;\""))
        assertTrue(x.contains("bounds=\"[900,2200][1080,2300]\""))
        assertTrue(x.contains("package=\"com.tencent.mm\""))
    }

    @Test fun passwordsAndHintsCarryNoText() {
        val x = HandsetTree.xml(chat)
        assertFalse(x.contains("hunter2"))
        assertTrue(x.contains("password=\"true\""))
        assertFalse(x.contains("text=\"搜索\""))
    }

    @Test fun typingInAnyLanguage() {
        assertEquals("你好，周六见", HandsetTree.typed("你好，", false, "周六见"))
        assertEquals("周六见", HandsetTree.typed("搜索", true, "周六见"))
        assertEquals("ab", HandsetTree.backspace("ab😀", false))
        assertEquals("周六", HandsetTree.backspace("周六见", false))
        assertEquals("", HandsetTree.backspace("搜索", true))
    }

    @Test fun onlyTheFiveKeys() {
        assertEquals("back", HandsetTree.keyOf("KEYCODE_BACK"))
        assertEquals("recents", HandsetTree.keyOf("KEYCODE_APP_SWITCH"))
        assertEquals(null, HandsetTree.keyOf("KEYCODE_POWER"))
    }

    @Test fun empty() {
        assertEquals("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\"></hierarchy>", HandsetTree.xml(null))
    }
}
