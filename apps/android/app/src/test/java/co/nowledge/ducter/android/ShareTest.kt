package co.nowledge.ducter.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

// D537: what an intent's extras become, the limits, the outbox's steps and what the home's answers mean.
class ShareTest {
    private fun pic(i: Int) = Incoming("content://p/$i", "image/jpeg", "IMG_$i.jpg", 3_000_000)

    @Test fun aLinkAloneIsTheLinkUnderItsTitle() {
        val p = Share.plan("https://example.com/post?id=7", "How we ship", emptyList())
        assertEquals("https://example.com/post?id=7", p.url)
        assertEquals("How we ship", p.title)
        assertNull(p.text)
        assertFalse(p.empty)
        assertEquals("example.com", Share.host("https://www.example.com/a"))
    }

    @Test fun wordsWithALinkKeepTheirWords() {
        val p = Share.plan("看看这个 https://x.com/a/status/1。", null, emptyList())
        assertEquals("https://x.com/a/status/1", p.url)
        assertEquals("看看这个 https://x.com/a/status/1。", p.text)
        // A subject without a link is no title.
        assertNull(Share.plan("just words", "Subject", emptyList()).title)
    }

    @Test fun tenAtMostAndFilesOver50MbLeftOut() {
        val p = Share.plan(null, null, (1..12).map(::pic))
        assertEquals(10, p.items.size)
        assertTrue(p.overCount)
        val big = Share.plan(null, null, listOf(Incoming("content://f/1", "application/pdf", "deck.pdf", 60L * 1024 * 1024), Incoming("content://f/2", "application/pdf", "report.pdf", 2_100_000)))
        assertEquals(listOf("deck.pdf"), big.tooBig)
        assertEquals(listOf("report.pdf"), big.items.map { it.name })
        assertTrue(Share.plan("  ", null, emptyList()).empty)
    }

    @Test fun badgesAndSizes() {
        assertEquals("PDF", Share.badge("季度报告.pdf"))
        assertEquals("DOCX", Share.badge("a.docx"))
        assertEquals("FILE", Share.badge("Makefile"))
        assertEquals("2.1 MB", Share.size(2_200_000))
        assertEquals("50 MB", Share.size(50L * 1024 * 1024))
        assertEquals("640 KB", Share.size(655_000))
    }

    @Test fun whatTheHomeSaid() {
        assertEquals(Outcome.Sent, Outcome.of(200))
        assertEquals(Outcome.Unpaired, Outcome.of(401))
        assertEquals(Outcome.TooOld, Outcome.of(404))
        assertEquals(Outcome.TooBig, Outcome.of(413))
        assertEquals(Outcome.Refused, Outcome.of(400))
        assertEquals(Outcome.Offline, Outcome.of(0))
        assertEquals(Outcome.Offline, Outcome.of(502))
    }

    @Test fun theOutboxUploadsEachFileOnceThenPostsAndLetsGoAfterAWeek() {
        val now = 1_000_000_000L
        var e = OutEntry("share-1", now, note = "帮我总结", files = listOf(OutFile("0.bin", "a.jpg", "image/jpeg"), OutFile("1.bin", "b.pdf", "application/pdf")))
        assertEquals(Step.Upload(0), Outbox.next(e, now))
        e = Outbox.uploaded(e, 0, "id-a")
        assertEquals(Step.Upload(1), Outbox.next(e, now))
        // Too big for the home: left out, and on it goes.
        e = Outbox.uploaded(e, 1, null)
        assertEquals(Step.Post, Outbox.next(e, now))
        val body = e.shareBody()
        assertEquals("share-1", body.getString("clientId"))
        assertEquals("帮我总结", body.getString("note"))
        assertEquals("id-a", body.getJSONArray("media").getString(0))
        assertFalse(body.has("partner"))
        assertEquals(Step.Expire, Outbox.next(e, now + ShareLimits.KEEP_MS + 1))
    }

    @Test fun theOutboxKeepsItsEntriesOnDiskOldestFirst() {
        val dir = Files.createTempDirectory("outbox").toFile()
        try {
            Outbox.save(dir, OutEntry("b", 2, url = "https://b.example/", partner = "p2", from = "Chrome"))
            Outbox.save(dir, OutEntry("a", 1, files = listOf(OutFile("0.bin", "x.png", "image/png", thumb = "0.thumb", preview = "data:image/jpeg;base64,AA", id = "id-x"))))
            File(dir, "broken").mkdirs()
            val list = Outbox.list(dir)
            assertEquals(listOf("a", "b"), list.map { it.clientId })
            assertEquals("id-x", list[0].files[0].id)
            assertEquals("0.thumb", list[0].files[0].thumb)
            assertEquals("Chrome", list[1].from)
            assertEquals("p2", list[1].shareBody().getString("partner"))
            assertFalse(File(dir, "broken").exists())
            Outbox.drop(dir, "a")
            assertEquals(listOf("b"), Outbox.list(dir).map { it.clientId })
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test fun aNewShareHasItsOwnShortId() {
        val a = Share.clientId()
        assertTrue(a.startsWith("share-") && a.length <= 64)
        assertFalse(a == Share.clientId())
    }
}
