/**
 * Purpose: turn StreamFree's raw stream entries into the addon's fixture model (one fixture = one
 * live event = one channel), and decide which entries are published at all. Status: 2026-11-07.
 */

import { config } from "./config.js";
import { fetchCatalogue, qualitySuffix } from "./streamfree.js";

/** Higher is better. StreamFree labels: 4K, FHD, HD, SD. */
const QUALITY_RANK = { "4K": 40, "2160p": 40, FHD: 30, "1080p": 30, HD: 20, "720p": 20, SD: 10, "540p": 10 };

export function qualityRank(label) {
  return QUALITY_RANK[String(label || "").toUpperCase()] ?? 0;
}

/** Absolute thumbnail URL: the catalogue mixes absolute URLs and site-relative paths. */
function absoluteThumb(thumbnail) {
  const value = String(thumbnail || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${config.siteBase}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** `basketball` -> `Basketball`, used when an entry carries no league. */
function titleCase(value) {
  const text = String(value || "").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

/**
 * Should this entry be published? An empty filter publishes everything; otherwise the category must
 * match and, when a league is named, the league must contain it (case-insensitive).
 */
export function isPublished(entry) {
  const category = String(entry.category || "").toLowerCase();
  if (!config.leagueFilters.length) return true;
  return config.leagueFilters.some(
    (filter) =>
      filter.category === category &&
      (!filter.league || String(entry.league || "").toLowerCase().includes(filter.league)),
  );
}

/**
 * Has the event not finished yet? StreamFree drops an entry shortly after the match ends, but a
 * stale catalogue can still list yesterday's game; this keeps those out of the board.
 */
export function isCurrent(entry, now = Date.now()) {
  const start = Number(entry.match_timestamp || 0);
  if (!start) return true;
  return now < start * 1000 + config.eventWindowMs;
}

/** One catalogue entry -> one fixture. [baseUrl] is the addon's own public base. */
export function toFixture(entry, baseUrl) {
  const key = String(entry.stream_key || entry.id || "");
  const category = String(entry.category || "other");
  const sources = (Array.isArray(entry.sources) ? entry.sources : [])
    .filter((source) => source && source.url)
    .map((source) => ({
      quality: String(source.quality || ""),
      url: String(source.url),
      live: Boolean(source.live),
      suffix: qualitySuffix(source.url, key),
    }))
    .sort((a, b) => Number(b.live) - Number(a.live) || qualityRank(b.quality) - qualityRank(a.quality));

  const teams = [entry.team1, entry.team2]
    .filter((team) => team && team.name)
    .map((team) => ({ name: String(team.name), logo: absoluteThumb(team.logo) }));

  return {
    id: `sf:${key}`,
    key,
    name: String(entry.name || key),
    category,
    league: String(entry.league || "") || titleCase(category),
    start: Number(entry.match_timestamp || 0) || null,
    viewers: Number(entry.viewers || 0),
    thumbnail: absoluteThumb(entry.thumbnail_url),
    teams,
    sources,
    live: sources.some((source) => source.live),
    url: `${baseUrl}/play/${encodeURIComponent(category)}/${encodeURIComponent(key)}.m3u8`,
  };
}

/**
 * The published board, live entries first then by kick-off time. Each call goes through the
 * catalogue cache, so this is cheap enough to serve on every request.
 */
export async function loadFixtures(catalogue, baseUrl, { includePast = false } = {}) {
  const now = Date.now();
  const fixtures = catalogue
    .filter((entry) => isPublished(entry) && (includePast || isCurrent(entry, now)))
    .map((entry) => toFixture(entry, baseUrl));

  return fixtures.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return (a.start || 0) - (b.start || 0);
  });
}

/** Cached catalogue, wrapped so callers do not need to know about the cache. */
export async function loadCatalogue(cache) {
  return cache.get("catalogue", () => fetchCatalogue());
}

export { fetchCatalogue };
