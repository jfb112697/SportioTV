/**
 * Purpose: the HTTP surface of the StreamFree addon — Stremio-shaped JSON, an M3U playlist and an
 * XMLTV guide for Sportio, plus the playlist/segment relay that makes the streams playable.
 * Status: 2026-11-07.
 *
 * No framework: node:http and the built-in fetch are enough, and a dependency-free image is one less
 * thing that can fail on a small server.
 */

import http from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import { config } from "./config.js";
import { TtlCache } from "./cache.js";
import { UpstreamError, fetchSources } from "./streamfree.js";
import { loadCatalogue, loadFixtures, toFixture } from "./fixtures.js";
import {
  fetchSegment,
  openPlaylist,
  pickSource,
  playableSources,
  rewritePlaylist,
} from "./resolver.js";
import {
  buildManifest,
  buildM3u,
  buildXmltv,
  catalogMetas,
  keyFromAddonId,
  metaFor,
  streamLinks,
} from "./outputs.js";
import { renderIndex, renderWatch, renderLogo } from "./ui.js";

const catalogueCache = new TtlCache(config.catalogTtlMs);

/** The addon's own base URL as the client sees it (PUBLIC_BASE_URL wins, else the request's Host). */
function baseUrl(req) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const first = (value) => String(value || "").split(",")[0].trim();
  const proto = first(req.headers["x-forwarded-proto"]) || "http";
  const host = first(req.headers["x-forwarded-host"]) || req.headers.host || `localhost:${config.port}`;
  return `${proto}://${host}`;
}

function send(res, status, body, contentType, extraHeaders = {}) {
  const headers = {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    ...extraHeaders,
  };
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

/** Every handler returns a promise; failures become a JSON error with the upstream status. */
function fail(res, error) {
  const status = error instanceof UpstreamError ? error.status : 500;
  const message = error?.message || "Unexpected error";
  if (status >= 500) console.error(`[addon] ${message}`);
  json(res, status, { error: message });
}

async function publishedFixtures(req, { category, includePast = false } = {}) {
  const base = baseUrl(req);
  const catalogue = await loadCatalogue(catalogueCache);
  let fixtures = await loadFixtures(catalogue, base, { includePast });
  if (category && category.toLowerCase() !== "all") {
    fixtures = fixtures.filter((fixture) => fixture.category.toLowerCase() === category.toLowerCase());
  }
  return fixtures;
}

/**
 * One fixture by key. The catalogue is the normal source; when a stream has just gone up (or already
 * dropped off the board) the per-stream sources endpoint still answers, so fall back to it and build
 * the fixture from the path's category.
 */
async function fixtureByKey(req, key, categoryHint) {
  const base = baseUrl(req);
  const catalogue = await loadCatalogue(catalogueCache);
  const entry = catalogue.find((candidate) => candidate.stream_key === key);
  if (entry) return toFixture(entry, base);

  const sources = await fetchSources(key);
  if (!sources.length) throw new UpstreamError(`Unknown stream: ${key}`, 404);
  return toFixture(
    { stream_key: key, category: categoryHint || "other", sources, name: key },
    base,
  );
}

// ---------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------

async function handlePlay(req, res, url) {
  const [, , category, file] = url.pathname.split("/");
  const key = decodeURIComponent(String(file || "")).replace(/\.m3u8$/i, "");
  if (!key) return json(res, 400, { error: "Missing stream key" });

  const fixture = await fixtureByKey(req, key, decodeURIComponent(String(category || "")));
  const source = pickSource(fixture, url.searchParams.get("q"));
  if (!source) throw new UpstreamError(`No playable source for ${key}`, 404);

  const opened = await openPlaylist(fixture, source);
  const relayBase = `${baseUrl(req)}/seg?u=`;
  const body = rewritePlaylist(opened.body, opened.playlistUrl, relayBase);

  send(res, 200, body, "application/vnd.apple.mpegurl; charset=utf-8", {
    "cache-control": "no-cache",
    "x-sportio-quality": opened.quality,
  });
}

/**
 * The upstream CDN serves MPEG-TS segments as `application/javascript` on some edges (the segment
 * files are named `.js`). ExoPlayer and mpv both sniff, but a strict HTTP client trusts the header,
 * so anything that is not already an audio/video type is reported as MPEG-TS.
 */
function segmentContentType(upstreamType) {
  const type = String(upstreamType || "").toLowerCase();
  if (type.startsWith("video/") || type.startsWith("audio/")) return upstreamType;
  if (type.includes("mpegurl")) return "application/vnd.apple.mpegurl";
  return "video/mp2t";
}

async function handleSegment(req, res, url) {
  const upstreamUrl = url.searchParams.get("u");
  if (!upstreamUrl) return json(res, 400, { error: "Missing u parameter" });

  const referer =
    url.searchParams.get("r") || `${config.cdnBase}/`;
  const upstream = await fetchSegment(upstreamUrl, referer);

  res.writeHead(200, {
    "content-type": segmentContentType(upstream.headers.get("content-type")),
    "content-length": upstream.headers.get("content-length") || undefined,
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body).pipe(res);
}

async function handleCatalog(req, res, url) {
  const genre = url.searchParams.get("genre") || "";
  const fixtures = await publishedFixtures(req, { category: genre });
  json(res, 200, { metas: catalogMetas(fixtures, baseUrl(req)) });
}

async function handleMeta(req, res, id) {
  const fixture = await fixtureByKey(req, keyFromAddonId(id), "");
  json(res, 200, { meta: metaFor(fixture, baseUrl(req)) });
}

async function handleStream(req, res, id) {
  const fixture = await fixtureByKey(req, keyFromAddonId(id), "");
  const streams = streamLinks(fixture, baseUrl(req));
  json(res, 200, { streams });
}

async function handleM3u(req, res, url) {
  const fixtures = await publishedFixtures(req, {
    category: url.searchParams.get("category") || "",
  });
  send(res, 200, buildM3u(fixtures, baseUrl(req)), "audio/x-mpegurl; charset=utf-8");
}

async function handleEpg(req, res, url) {
  const fixtures = await publishedFixtures(req, {
    category: url.searchParams.get("category") || "",
    includePast: true,
  });
  send(res, 200, buildXmltv(fixtures), "application/xml; charset=utf-8");
}

async function handleIndex(req, res, url) {
  const fixtures = await publishedFixtures(req, { category: url.searchParams.get("category") || "" });
  send(res, 200, renderIndex(fixtures, baseUrl(req), config), "text/html; charset=utf-8");
}

async function handleWatch(req, res, key) {
  const fixture = await fixtureByKey(req, key, "");
  send(res, 200, renderWatch(fixture, baseUrl(req)), "text/html; charset=utf-8");
}

async function handleApiFixtures(req, res, url) {
  const fixtures = await publishedFixtures(req, { category: url.searchParams.get("category") || "" });
  json(res, 200, { count: fixtures.length, fixtures });
}

async function handleApiStreams(req, res, key) {
  const fixture = await fixtureByKey(req, key, "");
  json(res, 200, { fixture, streams: streamLinks(fixture, baseUrl(req)) });
}

/** Router. Path patterns are matched by hand — there are only a dozen of them. */
async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,OPTIONS",
      "access-control-allow-headers": "*",
    });
    return res.end();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);

  // --- health / metadata -------------------------------------------------------------------
  if (path === "/health") {
    return json(res, 200, { status: "ok", version: "1.0.0", uptime: Math.round(process.uptime()) });
  }
  if (path === "/manifest.json") return json(res, 200, buildManifest(baseUrl(req)));
  if (path === "/logo.svg") return send(res, 200, renderLogo(), "image/svg+xml");

  // --- playlist / guide --------------------------------------------------------------------
  if (path === "/playlist.m3u" || path === "/playlist.m3u8" || path === "/m3u") {
    return handleM3u(req, res, url);
  }
  if (path === "/epg.xml" || path === "/xmltv.xml") return handleEpg(req, res, url);

  // --- relay -------------------------------------------------------------------------------
  if (segments[0] === "seg") return handleSegment(req, res, url);
  if (segments[0] === "play" && segments.length >= 3) return handlePlay(req, res, url);

  // --- stremio-shaped API ------------------------------------------------------------------
  if (path === "/catalog" || (segments[0] === "catalog" && segments.length >= 2)) {
    return handleCatalog(req, res, url);
  }
  if (segments[0] === "meta" && segments.length >= 3) {
    return handleMeta(req, res, segments[segments.length - 1]);
  }
  if (segments[0] === "stream" && segments.length >= 3) {
    return handleStream(req, res, segments[segments.length - 1]);
  }

  // --- plain API ---------------------------------------------------------------------------
  if (path === "/api/fixtures.json") return handleApiFixtures(req, res, url);
  if (segments[0] === "api" && segments[1] === "streams" && segments[2]) {
    return handleApiStreams(req, res, decodeURIComponent(segments[2]).replace(/\.json$/i, ""));
  }

  // --- web UI ------------------------------------------------------------------------------
  if (path === "/") return handleIndex(req, res, url);
  if (segments[0] === "watch" && segments[1]) return handleWatch(req, res, decodeURIComponent(segments[1]));

  return json(res, 404, { error: "Not found", path });
}

export function createServer() {
  return http.createServer((req, res) => {
    const started = Date.now();
    route(req, res)
      .catch((error) => fail(res, error))
      .finally(() => {
        if (config.logRequests) {
          console.log(`${req.method} ${req.url} -> ${res.statusCode} ${Date.now() - started}ms`);
        }
      });
  });
}

/**
 * Only when run directly (`node src/server.js`); tests import createServer instead. Compared through
 * pathToFileURL so Windows drive paths (`D:\…`) match the `file:///D:/…` form import.meta.url has.
 */
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain || process.env.ADDON_AUTOSTART === "1") {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`[addon] StreamFree addon listening on http://${config.host}:${config.port}`);
    console.log(`[addon] playlist: /playlist.m3u   guide: /epg.xml   manifest: /manifest.json`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { playableSources };
