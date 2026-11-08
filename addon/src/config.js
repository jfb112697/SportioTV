/**
 * Purpose: every knob of the addon in one place, all of it overridable by environment variable so the
 * container needs no config file. Status: 2026-11-07.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

function list(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** `basketball:nba,soccer:serie a` -> [{category, league}] (league empty means "whole category"). */
function leagueFilters(value) {
  return list(value).map((entry) => {
    const [category, ...rest] = entry.split(":");
    return {
      category: category.trim().toLowerCase(),
      league: rest.join(":").trim().toLowerCase(),
    };
  });
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: number(process.env.PORT, 7100),
  host: process.env.HOST || "0.0.0.0",

  /**
   * Absolute base URL the addon is reachable at from the clients (e.g. http://server.local:7100).
   * Empty means "derive it from the request", which is right behind a reverse proxy that forwards
   * Host, and is what the compose file uses by default.
   */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),

  /** StreamFree site (catalogue + embed pages) and CDN (playlists, segments, tokens). */
  siteBase: (process.env.STRMFREE_SITE || "https://strmfree.pk").replace(/\/+$/, ""),
  cdnBase: (process.env.STRMFREE_CDN || "https://strmfree.st").replace(/\/+$/, ""),

  userAgent: process.env.STRMFREE_USER_AGENT || BROWSER_UA,

  /** How long the fixture catalogue is served from memory. The API asks consumers to cache. */
  catalogTtlMs: number(process.env.CATALOG_TTL_MS, 30_000),
  /** A playlist token is valid for ~8h upstream; refresh a little early. */
  tokenTtlMs: number(process.env.TOKEN_TTL_MS, 6 * 60 * 60 * 1000),

  /** Only the categories/leagues in this list are published. Empty list = everything. */
  leagueFilters: leagueFilters(process.env.LEAGUE_FILTERS),

  /** Kick-off times in the web UI / M3U descriptions. */
  timezone: process.env.DEFAULT_TIMEZONE || "America/New_York",

  /** Hosts the segment relay is allowed to fetch from. Anything else is refused (no open proxy). */
  allowedUpstreamHosts: [
    "strmfree.st",
    "strmfree.pk",
    "strmfree.link",
    "streamfree.top",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokv.com",
    ...list(process.env.ALLOWED_UPSTREAM_HOSTS),
  ],

  /** How long a fixture stays listed after kick-off (matches are over well before this). */
  eventWindowMs: number(process.env.EVENT_WINDOW_MS, 6 * 60 * 60 * 1000),

  logRequests: process.env.LOG_REQUESTS !== "0",
};

/** True when [host] is one of the configured upstream hosts, or a subdomain of one. */
export function isAllowedUpstream(host) {
  const target = String(host || "").toLowerCase();
  if (!target) return false;
  return config.allowedUpstreamHosts.some(
    (allowed) => target === allowed || target.endsWith(`.${allowed}`),
  );
}
