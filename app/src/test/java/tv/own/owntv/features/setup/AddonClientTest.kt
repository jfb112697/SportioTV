package tv.own.owntv.features.setup

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The hosted addon's fixture parsing and URL handling. Pure JSON in, model out — no HTTP, no Android —
 * so a change to the addon's `/api/fixtures.json` shape fails here before it fails on a TV.
 */
class AddonClientTest {

    private fun fixture(
        name: String = "New York Knicks vs Cleveland Cavaliers",
        live: Boolean = true,
        sources: String = """[{"quality":"FHD","live":true},{"quality":"SD","live":false}]""",
        start: Long = 1794099600,
        league: String = "NBA",
        category: String = "basketball",
    ) = """{"name":"$name","league":"$league","category":"$category",
            "live":$live,"start":$start,"key":"k","sources":$sources}"""

    @Test
    fun `parses the fixtures array the addon serves`() {
        val root = JSONObject("""{"count":1,"fixtures":[${fixture()}]}""")
        val parsed = AddonClient.parseFixtures(root)

        assertEquals(1, parsed.size)
        assertEquals("New York Knicks vs Cleveland Cavaliers", parsed[0].name)
        assertEquals("NBA", parsed[0].league)
        assertEquals("basketball", parsed[0].category)
        assertTrue(parsed[0].live)
        assertEquals(1794099600L, parsed[0].start)
    }

    @Test
    fun `quality is the best live source, not merely the first one`() {
        val root = JSONObject(
            """{"fixtures":[${fixture(sources = """[{"quality":"SD","live":false},{"quality":"HD","live":true}]""")}]}""",
        )
        assertEquals("HD", AddonClient.parseFixtures(root)[0].quality)
    }

    @Test
    fun `a fixture with no live source has no quality label`() {
        val root = JSONObject(
            """{"fixtures":[${fixture(live = false, sources = """[{"quality":"SD","live":false}]""")}]}""",
        )
        assertEquals("", AddonClient.parseFixtures(root)[0].quality)
    }

    @Test
    fun `a missing start becomes null rather than zero`() {
        val root = JSONObject("""{"fixtures":[${fixture(start = 0)}]}""")
        assertEquals(null, AddonClient.parseFixtures(root)[0].start)
    }

    @Test
    fun `entries without a name fall back to the stream key`() {
        val root = JSONObject("""{"fixtures":[{"key":"skyf1","sources":[]}]}""")
        assertEquals("skyf1", AddonClient.parseFixtures(root)[0].name)
    }

    @Test
    fun `a response without a fixtures array yields an empty list`() {
        assertEquals(0, AddonClient.parseFixtures(JSONObject("""{"error":"nope"}""")).size)
    }

    @Test
    fun `addresses are normalised to a base URL`() {
        val client = AddonClient(okhttp3.OkHttpClient())
        assertEquals("http://server.local:7100", client.normaliseBaseUrl("server.local:7100"))
        assertEquals("http://server.local:7100", client.normaliseBaseUrl("  http://server.local:7100/  "))
        assertEquals("https://addon.example", client.normaliseBaseUrl("https://addon.example/"))
        assertEquals("", client.normaliseBaseUrl("   "))
    }

    @Test
    fun `playlist and guide URLs sit under the base`() {
        val client = AddonClient(okhttp3.OkHttpClient())
        assertEquals("http://192.168.1.71:7100/playlist.m3u", client.playlistUrl("192.168.1.71:7100"))
        assertEquals("http://192.168.1.71:7100/epg.xml", client.epgUrl("192.168.1.71:7100/"))
    }

    @Test
    fun `a numeric address is normalised without touching the scheme`() {
        val client = AddonClient(okhttp3.OkHttpClient())
        assertEquals("http://192.168.1.71:7100", client.normaliseBaseUrl("192.168.1.71:7100"))
        assertEquals("http://192.168.1.71:7100", client.normaliseBaseUrl("http://192.168.1.71:7100/"))
    }
}
