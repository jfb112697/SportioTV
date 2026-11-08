/**
 * Purpose: the small server-rendered web UI â€” a board of what is live (with the URLs Sportio needs),
 * and a player page for a single fixture. Status: 2026-11-07.
 *
 * Kept as template strings rather than a framework: it is three pages, and the addon's real consumers
 * are the JSON API and the M3U playlist.
 */

import { playableSources } from "./resolver.js";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function timeLabel(start, timeZone) {
  if (!start) return "";
  try {
    return new Date(start * 1000).toLocaleString("en-US", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(start * 1000).toISOString();
  }
}

const STYLE = `
  :root { color-scheme: dark; --bg:#0b0f0d; --panel:#121a16; --line:#22302a; --text:#e8f2ec;
          --muted:#8fa79b; --accent:#4ade80; --live:#ef4444; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  a { color:inherit; }
  header { padding:28px 24px 18px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 6px; font-size:22px; letter-spacing:-.01em; }
  .sub { color:var(--muted); font-size:13px; }
  .sub code { background:var(--panel); border:1px solid var(--line); border-radius:6px;
              padding:2px 6px; color:var(--accent); }
  main { padding:20px 24px 64px; max-width:1100px; }
  .group { margin:26px 0 10px; font-size:12px; text-transform:uppercase;
           letter-spacing:.12em; color:var(--muted); }
  .row { display:grid; grid-template-columns:1fr auto; gap:14px; align-items:center;
         background:var(--panel); border:1px solid var(--line); border-radius:12px;
         padding:14px 16px; margin-bottom:10px; }
  .name { font-weight:600; }
  .meta { color:var(--muted); font-size:12.5px; margin-top:3px; }
  .pill { display:inline-block; border-radius:999px; padding:1px 9px; font-size:11px;
          font-weight:700; letter-spacing:.06em; text-transform:uppercase;
          border:1px solid var(--line); color:var(--muted); margin-right:6px; }
  .pill.live { background:var(--live); border-color:var(--live); color:#fff; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .btn { display:inline-block; text-decoration:none; border:1px solid var(--line);
         background:#18241e; color:var(--text); border-radius:8px; padding:7px 12px;
         font-size:13px; font-weight:600; cursor:pointer; }
  .btn:hover { border-color:var(--accent); }
  .btn.primary { background:var(--accent); border-color:var(--accent); color:#06240f; }
  .empty { color:var(--muted); padding:40px 0; }
  .urls { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
  .urls a { font-size:13px; color:var(--accent); text-decoration:none;
            border:1px solid var(--line); border-radius:8px; padding:6px 10px; }
  .urls a:hover { border-color:var(--accent); }
  video { width:100%; max-height:70vh; background:#000; border-radius:12px;
          border:1px solid var(--line); }
  .back { color:var(--muted); text-decoration:none; font-size:13px; }
  .back:hover { color:var(--text); }
`;

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body>${body}</body></html>`;
}

/** The board: every published fixture, grouped by league, with the Sportio URLs on top. */
export function renderIndex(fixtures, base, config) {
  const groups = new Map();
  for (const fixture of fixtures) {
    const key = fixture.league || fixture.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fixture);
  }

  const rows = [...groups.entries()]
    .map(([league, items]) => {
      const body = items
        .map((fixture) => {
          const qualities = fixture.sources
            .filter((source) => source.live)
            .map((source) => source.quality)
            .join(" Â· ");
          return `<div class="row">
  <div>
    <div class="name">${esc(fixture.name)}</div>
    <div class="meta">
      <span class="pill${fixture.live ? " live" : ""}">${fixture.live ? "live" : "soon"}</span>
      ${esc(timeLabel(fixture.start, config.timezone))}${qualities ? ` Â· ${esc(qualities)}` : ""}
      ${fixture.teams.length === 2 ? ` Â· ${esc(fixture.teams[0].name)} vs ${esc(fixture.teams[1].name)}` : ""}
    </div>
  </div>
  <div class="actions">
    <a class="btn" href="/watch/${encodeURIComponent(fixture.key)}">Watch</a>
    <a class="btn" href="${esc(fixture.url)}">Playlist</a>
  </div>
</div>`;
        })
        .join("\n");
      return `<div class="group">${esc(league)} Â· ${items.length}</div>\n${body}`;
    })
    .join("\n");

  const body = `
<header>
  <h1>StreamFree Sports addon</h1>
  <div class="sub">${fixtures.length} fixtures Â· ${fixtures.filter((f) => f.live).length} live now Â·
    times in ${esc(config.timezone)}</div>
  <div class="urls">
    <a href="/playlist.m3u">/playlist.m3u</a>
    <a href="/epg.xml">/epg.xml</a>
    <a href="/manifest.json">/manifest.json</a>
    <a href="/api/fixtures.json">/api/fixtures.json</a>
  </div>
  <div class="sub" style="margin-top:12px">Add to Sportio with
    <code>${esc(base)}/playlist.m3u</code> (guide: <code>${esc(base)}/epg.xml</code>)</div>
</header>
<main>${rows || '<div class="empty">Nothing live right now â€” check back near kick-off.</div>'}</main>`;

  return page("StreamFree Sports addon", body);
}

/** One fixture, played in the browser (hls.js when the browser has no native HLS). */
export function renderWatch(fixture, base) {
  const source = playableSources(fixture)[0];
  const playlist = source
    ? `${base}/play/${encodeURIComponent(fixture.category)}/${encodeURIComponent(fixture.key)}.m3u8?q=${encodeURIComponent(source.suffix)}`
    : "";
  const qualities = playableSources(fixture)
    .map(
      (item) =>
        `<a class="btn" href="${esc(
          `${base}/play/${encodeURIComponent(fixture.category)}/${encodeURIComponent(fixture.key)}.m3u8?q=${encodeURIComponent(item.suffix)}`,
        )}">${esc(item.quality || item.suffix)}</a>`,
    )
    .join(" ");

  const body = `
<header>
  <a class="back" href="/">â† all fixtures</a>
  <h1 style="margin-top:12px">${esc(fixture.name)}</h1>
  <div class="sub">${esc(fixture.league)} Â· ${esc(timeLabel(fixture.start, "America/New_York"))}${
    fixture.live ? ' Â· <span class="pill live">live</span>' : ""
  }</div>
</header>
<main>
  ${playlist ? `<video id="player" controls autoplay playsinline src="${esc(playlist)}"></video>` : '<div class="empty">No playable source yet.</div>'}
  <div class="urls" style="margin-top:16px">${qualities}</div>
</main>
<script>
  (function () {
    var video = document.getElementById('player');
    if (!video || video.canPlayType('application/vnd.apple.mpegurl')) return;
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    script.onload = function () {
      if (!window.Hls || !window.Hls.isSupported()) return;
      var hls = new window.Hls({ lowLatencyMode: true });
      hls.loadSource(video.src);
      hls.attachMedia(video);
    };
    document.head.appendChild(script);
  })();
</script>`;
  return page(fixture.name, body);
}

/** Placeholder logo so a Stremio client has something to show. */
export function renderLogo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#0b0f0d"/>
  <circle cx="256" cy="256" r="132" fill="none" stroke="#4ade80" stroke-width="26"/>
  <path d="M256 124c46 34 74 78 74 132s-28 98-74 132c-46-34-74-78-74-132s28-98 74-132z"
        fill="none" stroke="#4ade80" stroke-width="18" opacity=".7"/>
  <path d="M124 256h264" stroke="#4ade80" stroke-width="18" opacity=".7"/>
</svg>`;
}

