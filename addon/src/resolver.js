/**
 * Purpose: turn a fixture into a playlist a player can actually open — resolve the token, pick the
 * playlist path, and rewrite every segment URL through this addon so the player needs no Referer,
 * no token and no CORS. Status: 2026-11-07.
 *
 * Why the relay exists: StreamFree answers 403 to a playlist or segment request that arrives without
 * `Referer: https://strmfree.st/embed/...`, and the playlist itself only works with a short-lived
 * `?_t=&_e=&_n=` token scraped from that same embed page. A TV player sends neither. The addon adds
 * both on the way out and hands the player plain, stable URLs.
 */

import { config, isAllowedUpstream } from "./config.js";
import { UpstreamError, fetchPlaybackToken, playlistUrlFor } from "./streamfree.js";
import { TtlCache } from "./cache.js";

/** token cache: `${key}|${quality}` -> {embedUrl, token, expiresAt, referer} */
const tokens = new TtlCache(config.tokenTtlMs);

/** Which playlist path last worked per stream key, so we do not retry a dead one every segment. */
const pathHints = new Map();

const PATH_CANDIDATES = ["live", "live-cdn", "live-externalcdn"];

/** Playable sources of a fixture, best first, live ones only when any are live. */
export function playableSources(fixture) {
  const live = fixture.sources.filter((source) => source.live && source.suffix);
  if (live.length) return live;
  return fixture.sources.filter((source) => source.suffix);
}

/** The source to use for a fixture, honouring an explicit `?q=` quality when it exists. */
export function pickSource(fixture, wantedQuality) {
  const sources = playableSources(fixture);
  if (!sources.length) return null;
  if (wantedQuality) {
    const exact = sources.find(
      (source) =>
        source.quality.toLowerCase() === String(wantedQuality).toLowerCase() ||
        source.suffix === String(wantedQuality).toLowerCase(),
    );
    if (exact) return exact;
  }
  return sources[0];
}

/** Resolve (and cache) the playback token for one quality of one stream. */
async function tokenFor(fixture, source) {
  const cacheKey = `${fixture.key}|${source.suffix}`;
  return tokens.get(cacheKey, async () => {
    const resolved = await fetchPlaybackToken(fixture.category, fixture.key, source.suffix);
    return { ...resolved, referer: resolved.embedUrl };
  });
}

/**
 * Fetch the upstream playlist for [fixture] at [source].
 *
 * Tries the last known good path first, then the others. A 403 means the token went stale (or the
 * path rejects it), so the token is dropped and fetched again once before giving up.
 */
export async function openPlaylist(fixture, source) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await tokenFor(fixture, source);
    const hinted = pathHints.get(fixture.key);
    const paths = hinted
      ? [hinted, ...PATH_CANDIDATES.filter((path) => path !== hinted)]
      : PATH_CANDIDATES;

    for (const path of paths) {
      const playlistUrl = playlistUrlFor(source.suffix, fixture.key, token.token, { path });
      const response = await fetch(playlistUrl, {
        headers: {
          "user-agent": config.userAgent,
          accept: "*/*",
          referer: token.referer,
        },
      }).catch((error) => {
        lastError = new UpstreamError(`Playlist unreachable (${error?.message || error})`, 502);
        return null;
      });
      if (!response) continue;

      if (response.ok) {
        const body = await response.text();
        if (!body.includes("#EXTM3U")) {
          lastError = new UpstreamError("Upstream did not return a playlist", 502);
          continue;
        }
        pathHints.set(fixture.key, path);
        return { body, playlistUrl, referer: token.referer, quality: source.quality, path };
      }

      lastError = new UpstreamError(`Playlist ${response.status} for ${fixture.key}`, response.status);
      if (response.status === 403 || response.status === 401) break; // stale token: refresh below
    }

    if (lastError?.status === 403 || lastError?.status === 401) {
      tokens.delete(`${fixture.key}|${source.suffix}`);
      continue;
    }
    break;
  }

  throw lastError || new UpstreamError(`No playlist for ${fixture.key}`, 502);
}

/**
 * Rewrite a playlist so every media URL points back at this addon.
 *
 * Only the URI-bearing tags and the bare segment lines change; `#EXT-X-STREAM-INF` variants are
 * flattened to the one rendition we already resolved, which is what a live single-rendition stream
 * has anyway.
 */
export function rewritePlaylist(body, playlistUrl, relayBase) {
  const resolve = (uri) => {
    try {
      return new URL(uri, playlistUrl).href;
    } catch {
      return "";
    }
  };
  const relay = (absolute) => `${relayBase}${encodeURIComponent(absolute)}`;

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // #EXT-X-MAP:URI="…", #EXT-X-KEY:URI="…" — keep the tag, relay the URI.
        return trimmed.replace(/URI="([^"]+)"/g, (whole, uri) => {
          const absolute = resolve(uri);
          return absolute && isAllowedUpstream(safeHost(absolute))
            ? `URI="${relay(absolute)}"`
            : whole;
        });
      }
      const absolute = resolve(trimmed);
      if (!absolute) return line;
      return isAllowedUpstream(safeHost(absolute)) ? relay(absolute) : line;
    })
    .join("\n");
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Fetch one upstream segment/init section for the relay. The caller has already checked the host
 * allow-list. Returns the raw Response so the caller can pipe the body straight through.
 */
export async function fetchSegment(url, referer) {
  if (!isAllowedUpstream(safeHost(url))) {
    throw new UpstreamError("Host not allowed", 403);
  }
  const response = await fetch(url, {
    headers: {
      "user-agent": config.userAgent,
      accept: "*/*",
      referer: referer || `${config.cdnBase}/`,
    },
  });
  if (!response.ok) {
    throw new UpstreamError(`Segment ${response.status}`, response.status);
  }
  return response;
}

/** Test seam: forget every cached token and path hint. */
export function resetResolverState() {
  tokens.clear();
  pathHints.clear();
}

export { tokens as tokenCache };
