/**
 * Purpose: the StreamFree side of the addon — catalogue, per-stream sources, and the two pieces of
 * scraping that turn an embed page into a playable HLS playlist (the `_0x` token table and the
 * stream-key lookup). Status: 2026-11-07.
 *
 * Everything here is read-only HTTP against strmfree.pk / strmfree.st. Nothing is stored, and the
 * upstream requests are cached so a client polling the addon does not become a client polling them.
 */

import { config } from "./config.js";

const REQUEST_TIMEOUT_MS = 12_000;

/** A failed upstream call, carrying the status so callers can tell "gone" from "broken". */
export class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "UpstreamError";
    this.status = status || 502;
  }
}

/** fetch() with a timeout, a browser UA and no credentials. */
async function upstream(url, { referer, accept = "*/*", timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const headers = {
    "user-agent": config.userAgent,
    accept,
    "accept-language": "en-US,en;q=0.9",
  };
  if (referer) headers.referer = referer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new UpstreamError(`Upstream timed out: ${url}`, 504);
    }
    throw new UpstreamError(`Upstream unreachable: ${url} (${error?.message || error})`, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function upstreamJson(url, options) {
  const response = await upstream(url, { ...options, accept: "application/json" });
  if (!response.ok) {
    throw new UpstreamError(`Upstream ${response.status} for ${url}`, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new UpstreamError(`Upstream sent non-JSON for ${url}`, 502);
  }
}

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

/**
 * Every stream StreamFree currently has up, flattened. The API answers `{count, streams: [...]}`
 * where each entry already carries its `sources` list, so one call is enough for the whole board.
 */
export async function fetchCatalogue() {
  const body = await upstreamJson(`${config.siteBase}/api/v1/streams`);
  const streams = Array.isArray(body?.streams) ? body.streams : [];
  return streams.filter((stream) => stream && stream.stream_key);
}

/** The live source list for one stream key (`{stream_key, sources:[{quality,url,live}]}`). */
export async function fetchSources(streamKey) {
  const body = await upstreamJson(
    `${config.siteBase}/api/v1/sources/${encodeURIComponent(streamKey)}`,
  );
  const sources = Array.isArray(body?.sources) ? body.sources : [];
  return sources.filter((source) => source && source.url);
}

/**
 * Which CDN the origin currently points this stream at (`origin`, `externalcdn`, ...). Only used to
 * pick a preferred playlist path; every path is retried, so a failure here is not fatal.
 */
export async function fetchStreamKey(streamKey) {
  const url = `${config.cdnBase}/get-stream-key/${encodeURIComponent(streamKey)}`;
  try {
    const body = await upstreamJson(url);
    return {
      serverName: body?.server_name || "origin",
      isExternal: Boolean(body?.is_external),
      externalUrl: body?.external_url || "",
    };
  } catch {
    return { serverName: "origin", isExternal: false, externalUrl: "" };
  }
}

// ---------------------------------------------------------------------------------------------
// Embed page -> playback token
// ---------------------------------------------------------------------------------------------

/** The quality suffix StreamFree appends to a stream key, e.g. `...cavaliers1080p` -> `1080p`. */
export function qualitySuffix(embedUrl, streamKey) {
  try {
    const path = new URL(embedUrl).pathname;
    const last = path.split("/").filter(Boolean).pop() || "";
    if (streamKey && last.startsWith(streamKey)) {
      const suffix = last.slice(streamKey.length);
      if (suffix) return suffix;
    }
    const match = last.match(/(\d{3,4}p)$/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

/**
 * Pull the `_0x` token table out of an embed page.
 *
 * The page inlines `const _0x = {"1080p": {"_e": <expiry>, "_n": <nonce>, "_t": <token>}, ...}` and
 * appends `?_t=&_e=&_n=` to the playlist URL. The literal is JSON, so parse it; if a future build
 * writes it unquoted, fall back to a field-by-field scan rather than failing the request.
 */
export function parseTokenTable(html) {
  const match = String(html || "").match(/const\s+_0x\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    const table = {};
    // Tolerates quoted or bare keys/values, in the `_e, _n, _t` order the page writes them.
    const entry =
      /["']?(\d{3,4}p)["']?\s*:\s*\{\s*["']?_e["']?\s*:\s*(\d+)\s*,\s*["']?_n["']?\s*:\s*["']([^"']*)["']\s*,\s*["']?_t["']?\s*:\s*["']([^"']*)["']/g;
    let found;
    while ((found = entry.exec(match[1])) !== null) {
      table[found[1]] = { _e: Number(found[2]), _n: found[3], _t: found[4] };
    }
    return table;
  }
}

/**
 * Fetch an embed page and return the playback token for [quality].
 *
 * The token is bound to a Referer (the embed page itself), so the referer travels with it in the
 * result — the playlist request is rejected with 403 without it.
 */
export async function fetchPlaybackToken(category, streamKey, quality) {
  const embedUrl = `${config.cdnBase}/embed/${encodeURIComponent(category)}/${encodeURIComponent(
    streamKey,
  )}${quality}`;
  const response = await upstream(embedUrl, {
    referer: `${config.siteBase}/`,
    accept: "text/html,application/xhtml+xml",
  });
  if (!response.ok) {
    throw new UpstreamError(`Embed page ${response.status} for ${embedUrl}`, response.status);
  }
  const html = await response.text();
  const table = parseTokenTable(html);
  const entry = table[quality];
  if (!entry?._t) {
    throw new UpstreamError(`No playback token for ${streamKey}${quality}`, 502);
  }
  return {
    embedUrl,
    quality,
    token: { t: entry._t, e: entry._e, n: entry._n },
    /** Unix seconds at which the token stops being accepted, when the page says so. */
    expiresAt: Number(entry._e) > 0 ? Number(entry._e) * 1000 : 0,
  };
}

/**
 * The playable playlist for a token. `live` is StreamFree's origin path, `live-cdn` the same stream
 * behind their CDN. Both need the token and the embed referer.
 */
export function playlistUrlFor(quality, streamKey, token, { path = "live" } = {}) {
  const variant = `${streamKey}${quality}`;
  const base = `${config.cdnBase}/${path}/${encodeURIComponent(variant)}/index.m3u8`;
  return `${base}?_t=${encodeURIComponent(token.t)}&_e=${encodeURIComponent(
    String(token.e),
  )}&_n=${encodeURIComponent(token.n)}`;
}
