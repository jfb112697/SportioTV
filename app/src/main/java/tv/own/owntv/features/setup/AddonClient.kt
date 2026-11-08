package tv.own.owntv.features.setup

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * Client for a hosted **StreamFree addon** (this repo's `addon/`, deployed on the LAN server).
 *
 * The addon publishes live sports fixtures scraped from StreamFree and resolves each one to a
 * playable HLS playlist. Two shapes are read here:
 *
 *  - `/api/fixtures.json` — the fixture list, for the picker's preview (what is on right now).
 *  - `/manifest.json`     — presence check plus the addon's name and version.
 *
 * Adding the addon as a *source* does not go through this client: the addon also serves
 * `/playlist.m3u` and `/epg.xml`, which are handed to the existing M3U import, so the fixtures land in
 * the normal channel table and the Sports Hub matches them against ESPN like any other channel.
 */
class AddonClient(private val client: OkHttpClient) {

    /** One live fixture as the addon reports it. */
    data class Fixture(
        val name: String,
        val league: String,
        val category: String,
        val live: Boolean,
        /** Kick-off in unix seconds, or null for a 24/7 channel-style entry. */
        val start: Long?,
        val quality: String,
    )

    data class Snapshot(
        val name: String,
        val version: String,
        val fixtures: List<Fixture>,
    ) {
        val liveCount: Int get() = fixtures.count { it.live }
    }

    /**
     * The addon could not be read: [httpCode] is the status when there was one, 0 when the request
     * never got an answer. Deliberately carries no message text — the screen renders a translated
     * sentence from it, so no English is baked into the client.
     */
    class AddonException(val httpCode: Int = 0) : java.io.IOException()

    /**
     * Normalises what the user typed into a base URL: adds `http://` when no scheme is given and
     * drops a trailing slash, so `server.local:7100` and `http://server.local:7100/` both work.
     */
    fun normaliseBaseUrl(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isEmpty()) return ""
        return if (trimmed.startsWith(SCHEME_HTTP) || trimmed.startsWith(SCHEME_HTTPS)) {
            trimmed
        } else {
            "$SCHEME_HTTP$trimmed"
        }
    }

    /** The playlist URL to import. */
    fun playlistUrl(baseUrl: String): String = "${normaliseBaseUrl(baseUrl)}$PATH_PLAYLIST"

    /** The guide URL for the same base, for the EPG field. */
    fun epgUrl(baseUrl: String): String = "${normaliseBaseUrl(baseUrl)}$PATH_EPG"

    /**
     * Fetch the addon's manifest and current fixtures. Throws [AddonException] when the addon cannot
     * be reached or does not answer like an addon.
     */
    suspend fun load(baseUrl: String): Snapshot = withContext(Dispatchers.IO) {
        val base = normaliseBaseUrl(baseUrl)
        if (base.isEmpty()) throw AddonException()

        val manifest = getJson("$base$PATH_MANIFEST")
        val name = manifest.optString(KEY_NAME).ifBlank { FALLBACK_NAME }
        val version = manifest.optString(KEY_VERSION)

        val fixtures = runCatching { parseFixtures(getJson("$base$PATH_FIXTURES")) }
            .getOrDefault(emptyList())

        Snapshot(name = name, version = version, fixtures = fixtures)
    }

    /** Fixtures only — the picker calls this to refresh the preview. */
    suspend fun fixtures(baseUrl: String): List<Fixture> = withContext(Dispatchers.IO) {
        parseFixtures(getJson("${normaliseBaseUrl(baseUrl)}$PATH_FIXTURES"))
    }

    private fun getJson(url: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header(HEADER_ACCEPT, MIME_JSON)
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw AddonException(response.code)
            return JSONObject(response.body.string())
        }
    }

    companion object {
        private const val SCHEME_HTTP = "http://"
        private const val SCHEME_HTTPS = "https://"
        private const val PATH_MANIFEST = "/manifest.json"
        private const val PATH_FIXTURES = "/api/fixtures.json"
        private const val PATH_PLAYLIST = "/playlist.m3u"
        private const val PATH_EPG = "/epg.xml"
        private const val HEADER_ACCEPT = "accept"
        private const val MIME_JSON = "application/json"
        private const val FALLBACK_NAME = "StreamFree"

        private const val KEY_NAME = "name"
        private const val KEY_VERSION = "version"
        private const val KEY_FIXTURES = "fixtures"
        private const val KEY_KEY = "key"
        private const val KEY_LEAGUE = "league"
        private const val KEY_CATEGORY = "category"
        private const val KEY_LIVE = "live"
        private const val KEY_START = "start"
        private const val KEY_SOURCES = "sources"
        private const val KEY_QUALITY = "quality"

        /**
         * Reads the `fixtures` array. Pure and static so the JVM unit test can cover the parsing
         * without an HTTP client or an Android runtime.
         */
        fun parseFixtures(root: JSONObject): List<Fixture> {
            val array = root.optJSONArray(KEY_FIXTURES) ?: return emptyList()
            val out = ArrayList<Fixture>(array.length())
            for (index in 0 until array.length()) {
                val entry = array.optJSONObject(index) ?: continue
                val name = entry.optString(KEY_NAME).ifBlank { entry.optString(KEY_KEY) }
                if (name.isBlank()) continue
                val sources = entry.optJSONArray(KEY_SOURCES)
                var quality = ""
                if (sources != null) {
                    for (s in 0 until sources.length()) {
                        val source = sources.optJSONObject(s) ?: continue
                        if (!source.optBoolean(KEY_LIVE)) continue
                        val label = source.optString(KEY_QUALITY)
                        if (label.isNotBlank()) { quality = label; break }
                    }
                }
                out += Fixture(
                    name = name,
                    league = entry.optString(KEY_LEAGUE),
                    category = entry.optString(KEY_CATEGORY),
                    live = entry.optBoolean(KEY_LIVE),
                    start = entry.optLong(KEY_START).takeIf { it > 0 },
                    quality = quality,
                )
            }
            return out
        }
    }
}
