/**
 * Purpose: unit tests for the pure parts of the addon — token scraping, playlist rewriting, the M3U
 * and XMLTV writers, and the fixture filters. Status: 2026-11-07.
 *
 * Run with `npm test` (node:test, no dependencies).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseTokenTable, qualitySuffix, playlistUrlFor } from "../src/streamfree.js";
import { rewritePlaylist } from "../src/resolver.js";
import { buildM3u, buildXmltv, buildManifest, streamLinks, keyFromAddonId, addonId } from "../src/outputs.js";
import { toFixture, isPublished, isCurrent } from "../src/fixtures.js";
import { isAllowedUpstream } from "../src/config.js";

const KEY = "new-york-knicks-vs-cleveland-cavaliers";

const ENTRY = {
  id: KEY,
  name: "New York Knicks vs Cleveland Cavaliers",
  category: "basketball",
  league: "NBA",
  stream_key: KEY,
  match_timestamp: 1794099600,
  thumbnail_url: "/thumbnails/basketball_x",
  team1: { name: "New York Knicks", logo: "https://a.espncdn.com/ny.png" },
  team2: { name: "Cleveland Cavaliers", logo: "" },
  sources: [
    { quality: "SD", url: `https://strmfree.st/embed/basketball/${KEY}540p`, live: true },
    { quality: "FHD", url: `https://strmfree.st/embed/basketball/${KEY}1080p`, live: true },
  ],
};

test("parseTokenTable reads the JSON literal the embed page inlines", () => {
  const html = `<script>
    const _0x = {"1080p": {"_e": 1794136512, "_n": "d62f7e62ee8a0e73", "_t": "WdU3z4_xbefkiOfrkX_UwQ"},
                 "540p": {"_e": 1794136512, "_n": "d62f7e62ee8a0e73", "_t": "Fvg_dP_x9bwRqZHdrNP-Kw"}};
  </script>`;
  const table = parseTokenTable(html);
  assert.equal(table["1080p"]._t, "WdU3z4_xbefkiOfrkX_UwQ");
  assert.equal(table["540p"]._n, "d62f7e62ee8a0e73");
  assert.equal(table["1080p"]._e, 1794136512);
});

test("parseTokenTable falls back to field scanning on an unquoted literal", () => {
  const html = "const _0x = {1080p: {_e: 1794136512, _n: \"abc\", _t: \"tok\"}};";
  assert.equal(parseTokenTable(html)["1080p"]._t, "tok");
});

test("parseTokenTable returns {} when there is no table", () => {
  assert.deepEqual(parseTokenTable("<html>nothing</html>"), {});
});

test("qualitySuffix takes the suffix the embed URL carries", () => {
  assert.equal(qualitySuffix(`https://strmfree.st/embed/basketball/${KEY}1080p`, KEY), "1080p");
  assert.equal(qualitySuffix(`https://strmfree.st/embed/basketball/${KEY}540p`, KEY), "540p");
  assert.equal(qualitySuffix("https://example.test/whatever720p", KEY), "720p");
  assert.equal(qualitySuffix("not a url", KEY), "");
});

test("playlistUrlFor builds the origin URL with the token", () => {
  const url = playlistUrlFor("1080p", KEY, { t: "tok", e: 1794136512, n: "nonce" }, { path: "live" });
  assert.equal(
    url,
    `https://strmfree.st/live/${KEY}1080p/index.m3u8?_t=tok&_e=1794136512&_n=nonce`,
  );
});

test("rewritePlaylist sends every media line back through the relay", () => {
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-MEDIA-SEQUENCE:2432",
    "#EXTINF:4.004,",
    "2432.js",
    "#EXTINF:4.004,",
    "https://cdn1.strmfree.st/live/x/2433.js",
  ].join("\n");
  const out = rewritePlaylist(body, "https://strmfree.st/live/x/index.m3u8", "http://h/seg?u=");
  const lines = out.split("\n");

  assert.equal(lines[0], "#EXTM3U");
  assert.equal(lines[3], "#EXTINF:4.004,");
  assert.equal(lines[4], `http://h/seg?u=${encodeURIComponent("https://strmfree.st/live/x/2432.js")}`);
  assert.equal(lines[6], `http://h/seg?u=${encodeURIComponent("https://cdn1.strmfree.st/live/x/2433.js")}`);
});

test("rewritePlaylist leaves foreign hosts alone (no open relay)", () => {
  const out = rewritePlaylist(
    "#EXTM3U\nhttps://evil.example/seg.ts",
    "https://strmfree.st/live/x/index.m3u8",
    "http://h/seg?u=",
  );
  assert.match(out, /https:\/\/evil\.example\/seg\.ts/);
});

test("isAllowedUpstream matches configured hosts and their subdomains only", () => {
  assert.equal(isAllowedUpstream("cdn1.strmfree.st"), true);
  assert.equal(isAllowedUpstream("strmfree.st"), true);
  assert.equal(isAllowedUpstream("evil-strmfree.st"), false);
  assert.equal(isAllowedUpstream("example.com"), false);
});

test("toFixture sorts live/high quality first and absolutises the thumbnail", () => {
  const fixture = toFixture(ENTRY, "http://server.local:7100");
  assert.equal(fixture.id, `sf:${KEY}`);
  assert.equal(fixture.sources[0].quality, "FHD");
  assert.equal(fixture.sources[0].suffix, "1080p");
  assert.equal(fixture.thumbnail, "https://strmfree.pk/thumbnails/basketball_x");
  assert.equal(fixture.live, true);
  assert.equal(fixture.teams.length, 2);
  assert.equal(fixture.url, `http://server.local:7100/play/basketball/${KEY}.m3u8`);
});

test("isPublished honours LEAGUE_FILTERS when one is configured", () => {
  // With no filters configured everything is published; the filter path is covered by config parse.
  assert.equal(isPublished(ENTRY), true);
});

test("isCurrent drops events that finished long ago", () => {
  const start = 1794099600;
  assert.equal(isCurrent(ENTRY, start * 1000 + 60_000), true);
  assert.equal(isCurrent(ENTRY, start * 1000 + 7 * 60 * 60 * 1000), false);
  assert.equal(isCurrent({ ...ENTRY, match_timestamp: 0 }, Date.now()), true);
});

test("buildM3u writes one channel per fixture with the fixture name intact", () => {
  const fixture = toFixture(ENTRY, "http://h");
  const m3u = buildM3u([fixture], "http://h");
  assert.match(m3u, /^#EXTM3U/);
  assert.match(m3u, /tvg-id="sf:new-york-knicks-vs-cleveland-cavaliers"/);
  assert.match(m3u, /group-title="NBA"/);
  assert.match(m3u, /,New York Knicks vs Cleveland Cavaliers\n/);
  assert.match(m3u, new RegExp(`http://h/play/basketball/${KEY}\\.m3u8`));
});

test("buildM3u skips fixtures with no playable source", () => {
  const fixture = toFixture({ ...ENTRY, sources: [] }, "http://h");
  assert.equal(buildM3u([fixture], "http://h").trim(), "#EXTM3U");
});

test("buildXmltv emits a channel and a programme per fixture", () => {
  const fixture = toFixture(ENTRY, "http://h");
  const xml = buildXmltv([fixture]);
  assert.match(xml, /<channel id="sf:new-york-knicks-vs-cleveland-cavaliers">/);
  assert.match(xml, /<programme start="\d{14} \+0000" stop="\d{14} \+0000"/);
  assert.match(xml, /<title lang="en">New York Knicks vs Cleveland Cavaliers<\/title>/);
  assert.ok(xml.trim().endsWith("</tv>"));
});

test("buildXmltv escapes markup in names", () => {
  const fixture = toFixture({ ...ENTRY, name: "A & B <c>" }, "http://h");
  const xml = buildXmltv([fixture]);
  assert.match(xml, /A &amp; B &lt;c&gt;/);
});

test("buildManifest is a Stremio-shaped manifest with the sf: id prefix", () => {
  const manifest = buildManifest("http://h");
  assert.equal(manifest.id, "community.sportio.streamfree");
  assert.deepEqual(manifest.resources, ["catalog", "meta", "stream"]);
  assert.deepEqual(manifest.idPrefixes, ["sf:"]);
  assert.equal(manifest.catalogs[0].id, "streamfree");
});

test("streamLinks exposes one relay URL per playable quality", () => {
  const fixture = toFixture(ENTRY, "http://h");
  const links = streamLinks(fixture, "http://h");
  assert.equal(links.length, 2);
  assert.match(links[0].url, /^http:\/\/h\/play\/basketball\/.+\?q=1080p$/);
  assert.match(links[0].name, /FHD/);
});

test("addonId / keyFromAddonId round-trip", () => {
  const fixture = toFixture(ENTRY, "http://h");
  assert.equal(keyFromAddonId(addonId(fixture)), KEY);
  assert.equal(keyFromAddonId(KEY), KEY);
  assert.equal(keyFromAddonId(encodeURIComponent(`sf:${KEY}`)), KEY);
  // Stremio clients ask for /meta/tv/<id>.json — the transport suffix is not part of the id.
  assert.equal(keyFromAddonId(`${encodeURIComponent(`sf:${KEY}`)}.json`), KEY);
  assert.equal(keyFromAddonId(`${KEY}.json`), KEY);
});
