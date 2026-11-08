/**
 * Purpose: the addon's output formats — the Stremio-shaped JSON API, an M3U playlist Sportio imports
 * directly, and an XMLTV guide so the fixtures appear in the TV guide. Status: 2026-11-07.
 *
 * The JSON API deliberately follows Stremio's addon shape (manifest / catalog / meta / stream) so any
 * Stremio-compatible client can read it, but nothing here needs the real SDK: the routes are plain
 * HTTP and the payloads are the documented objects.
 */

import { config } from "./config.js";
import { playableSources } from "./resolver.js";

export const ADDON_ID = "community.sportio.streamfree";
export const ADDON_VERSION = "1.0.0";
const CATALOG_ID = "streamfree";
const TYPE = "tv";

/** `sf:` ids keep this addon's fixtures from colliding with anything else in a client. */
export function addonId(fixture) {
  return fixture.id.startsWith("sf:") ? fixture.id : `sf:${fixture.key}`;
}

/**
 * Accepts `sf:key`, `key`, `sf:key.json` or a full `/stream/tv/…` path segment. Stremio clients
 * request `/meta/tv/<id>.json`, so the transport suffix is not part of the id.
 */
export function keyFromAddonId(id) {
  const raw = decodeURIComponent(String(id || "")).trim().replace(/\.json$/i, "");
  return raw.startsWith("sf:") ? raw.slice(3) : raw;
}

function iso(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : "";
}

// ---------------------------------------------------------------------------------------------
// Stremio-shaped API
// ---------------------------------------------------------------------------------------------

export function buildManifest(baseUrl) {
  return {
    id: ADDON_ID,
    version: ADDON_VERSION,
    name: "StreamFree Sports",
    description:
      "Live sports fixtures scraped from StreamFree, matched to playable HLS streams. " +
      "Basketball, soccer, football, hockey, tennis, cricket, combat and racing.",
    logo: `${baseUrl}/logo.svg`,
    resources: ["catalog", "meta", "stream"],
    types: [TYPE],
    idPrefixes: ["sf:"],
    catalogs: [
      {
        type: TYPE,
        id: CATALOG_ID,
        name: "StreamFree live sports",
        extra: [
          {
            name: "genre",
            options: [
              "All",
              "basketball",
              "soccer",
              "football",
              "hockey",
              "tennis",
              "cricket",
              "combat",
              "racing",
            ],
          },
        ],
      },
    ],
    behaviorHints: { configurable: false, configurationRequired: false },
  };
}

/** The `metas` array of a catalog response. */
export function catalogMetas(fixtures, baseUrl) {
  return fixtures.map((fixture) => ({
    id: addonId(fixture),
    type: TYPE,
    name: fixture.name,
    poster: fixture.thumbnail || "",
    posterShape: "landscape",
    background: fixture.thumbnail || "",
    logo: "",
    description: describe(fixture),
    releaseInfo: fixture.live ? "LIVE" : iso(fixture.start),
    genres: [fixture.league, fixture.category].filter(Boolean),
    runtime: "",
    website: `${baseUrl}/watch/${encodeURIComponent(fixture.key)}`,
  }));
}

function describe(fixture) {
  const parts = [fixture.league, fixture.category].filter(Boolean).join(" · ");
  const when = fixture.start
    ? new Date(fixture.start * 1000).toLocaleString("en-US", { timeZone: config.timezone })
    : "";
  const teams = fixture.teams.map((team) => team.name).join(" vs ");
  return [parts, teams, when, fixture.live ? "Live now" : "Upcoming"]
    .filter(Boolean)
    .join(" — ");
}

/** The `meta` object for one fixture. */
export function metaFor(fixture, baseUrl) {
  return {
    id: addonId(fixture),
    type: TYPE,
    name: fixture.name,
    poster: fixture.thumbnail || "",
    posterShape: "landscape",
    background: fixture.thumbnail || "",
    description: describe(fixture),
    releaseInfo: fixture.live ? "LIVE" : iso(fixture.start),
    genres: [fixture.league, fixture.category].filter(Boolean),
    videos: [],
    behaviorHints: { defaultVideoId: addonId(fixture) },
    website: `${baseUrl}/watch/${encodeURIComponent(fixture.key)}`,
  };
}

/**
 * The `streams` array for one fixture: one entry per playable quality, each pointing at this addon's
 * relay (so the client needs no token and no Referer).
 */
export function streamLinks(fixture, baseUrl) {
  const sources = playableSources(fixture);
  return sources.map((source) => ({
    name: `StreamFree ${source.quality || source.suffix}`,
    title: `${fixture.name}\n${fixture.league} · ${source.quality || source.suffix}${
      source.live ? " · live" : ""
    }`,
    url: `${baseUrl}/play/${encodeURIComponent(fixture.category)}/${encodeURIComponent(
      fixture.key,
    )}.m3u8?q=${encodeURIComponent(source.suffix)}`,
    behaviorHints: { notWebReady: false },
  }));
}

// ---------------------------------------------------------------------------------------------
// M3U (what Sportio imports)
// ---------------------------------------------------------------------------------------------

/** M3U attribute values may not contain quotes; keep names that do out of the attributes. */
function attr(value) {
  return String(value || "").replace(/["\r\n]/g, "'");
}

/**
 * One channel per fixture. The channel name is the fixture name unchanged — that is what Sportio's
 * Sports Hub matches against ESPN fixtures by team name, so decorating it with a source label would
 * break the matching it exists for.
 */
export function buildM3u(fixtures, baseUrl) {
  const lines = ["#EXTM3U"];
  for (const fixture of fixtures) {
    const source = playableSources(fixture)[0];
    if (!source) continue;
    const logo = fixture.thumbnail ? ` tvg-logo="${attr(fixture.thumbnail)}"` : "";
    const group = ` group-title="${attr(fixture.league || fixture.category)}"`;
    lines.push(
      `#EXTINF:-1 tvg-id="${attr(addonId(fixture))}" tvg-name="${attr(fixture.name)}"${logo}${group},${fixture.name}`,
    );
    lines.push(
      `${baseUrl}/play/${encodeURIComponent(fixture.category)}/${encodeURIComponent(fixture.key)}.m3u8`,
    );
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------
// XMLTV
// ---------------------------------------------------------------------------------------------

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `20261108000000 +0000` — the only format XMLTV consumers agree on. */
function xmltvTime(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())} +0000`
  );
}

/**
 * A guide with one programme per fixture, spanning kick-off -15min to +3h. Entries without a
 * kick-off time get a rolling 4-hour block so they still show as "now" in the guide.
 */
export function buildXmltv(fixtures) {
  const now = Date.now();
  const channels = [];
  const programmes = [];

  for (const fixture of fixtures) {
    const id = addonId(fixture);
    channels.push(
      `  <channel id="${xmlEscape(id)}"><display-name>${xmlEscape(fixture.name)}</display-name></channel>`,
    );
    const start = fixture.start ? fixture.start * 1000 - 15 * 60 * 1000 : now - 30 * 60 * 1000;
    const stop = fixture.start ? fixture.start * 1000 + 3 * 60 * 60 * 1000 : now + 3.5 * 60 * 60 * 1000;
    programmes.push(
      [
        `  <programme start="${xmltvTime(start)}" stop="${xmltvTime(stop)}" channel="${xmlEscape(id)}">`,
        `    <title lang="en">${xmlEscape(fixture.name)}</title>`,
        `    <desc lang="en">${xmlEscape(describe(fixture))}</desc>`,
        `    <category lang="en">${xmlEscape(fixture.category)}</category>`,
        `  </programme>`,
      ].join("\n"),
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="sportio-streamfree-addon">',
    ...channels,
    ...programmes,
    "</tv>",
    "",
  ].join("\n");
}

export { TYPE, CATALOG_ID };
