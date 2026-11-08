# Hosted addon — StreamFree fixtures as a source

*Zweck: das StreamFree-Addon (Ordner `addon/`) — was es liefert, wie es auf `server.local` läuft und wie
Sportio es als Quelle aufnimmt. Stand: 2026-11-07.*

## Was es ist

Ein kleiner Dienst ohne Abhängigkeiten (Node 22, `node:http` + `fetch`), der **StreamFree**
(`strmfree.pk`) liest und die laufenden Sport-Events als **Playlist + Guide + JSON-API** veröffentlicht.
Der Name kommt daher, dass die API bewusst die Form von Stremio-Addons hat (`manifest.json`, `catalog`,
`meta`, `stream`) — sie braucht aber kein SDK und kein Stremio.

Warum das eine Playlist ist und kein neuer Quellentyp in der App: die Spiele kommen als Kanäle mit
`tvg-id`/`tvg-name` und einer XMLTV-Programmzeile an. Damit greift der bestehende Import, die
Aktualisierung, der EPG-Ablauf und vor allem das **Sender-Matching des Sport-Hubs** unverändert —
der Kanalname ist der Spielname, also genau das, was `SportsMatcher` gegen ESPN abgleicht.

## Endpunkte

| Pfad | Zweck |
|---|---|
| `/` | Web-Board: was gerade läuft, mit Adressen zum Kopieren |
| `/playlist.m3u` | **Das importiert Sportio.** Ein Kanal pro Event |
| `/epg.xml` | XMLTV-Guide, ein Programm pro Event (Anpfiff −15 min bis +3 h) |
| `/play/<category>/<key>.m3u8` | Aufgelöste, abspielbare Playlist eines Events (`?q=540p` für SD) |
| `/seg?u=<url>` | Segment-Relay (setzt Referer und Token, umgeht CORS) |
| `/manifest.json` | Stremio-förmiges Manifest |
| `/catalog/tv/streamfree.json` | Stremio-Katalog (`?genre=basketball`) |
| `/meta/tv/<id>.json`, `/stream/tv/<id>.json` | Stremio-Meta und -Streams (`sf:`-IDs) |
| `/api/fixtures.json` | Rohliste für die Vorschau in der App |
| `/api/streams/<key>.json` | Ein Event mit seinen Stream-Links |
| `/health` | Healthcheck (Compose nutzt ihn) |

## Warum der Resolver nötig ist

StreamFree liefert die Playlist nur mit einem kurzlebigen `?_t=&_e=&_n=`-Token **und** mit
`Referer: https://strmfree.st/embed/…`. Ohne beides: 403. Ein TV-Player schickt weder das eine noch das
andere. Das Addon holt sich das Token aus der Embed-Seite (`const _0x = {...}`), öffnet damit die
Playlist und schreibt jede Segment-URL auf sich selbst um (`/seg?u=…`). Der Player sieht damit nur
stabile, offene URLs.

Das Segment-Relay ist **kein offener Proxy**: `ALLOWED_UPSTREAM_HOSTS` (siehe `src/config.js`) erlaubt
nur StreamFree-/TikTok-CDN-Hosts, alles andere wird mit 403 abgelehnt.

## Konfiguration

Alles per Umgebungsvariable (siehe `compose.yaml`):

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `7100` | Port im Container |
| `PUBLIC_BASE_URL` | leer | Leer = aus dem `Host`-Header ableiten. Nur setzen, wenn ein Proxy den Host umschreibt |
| `LEAGUE_FILTERS` | leer | Leer = alle Kategorien. Sonst z. B. `basketball:nba,football:nfl` |
| `DEFAULT_TIMEZONE` | `America/New_York` | Zeitzone im Web-Board |
| `CATALOG_TTL_MS` | `30000` | Katalog-Cache |
| `TOKEN_TTL_MS` | `6h` | Token-Cache (Upstream-Token leben ~8 h) |
| `ALLOWED_UPSTREAM_HOSTS` | — | Zusätzliche Relay-Ziele, kommasepariert |

## Deployment auf `server.local`

Der Stack liegt dort unter `~/sportio-addon` und läuft als eigener Container auf **Port 7100**
(die bestehende `live-sports`-Instanz auf 7000 bleibt unangetastet):

```bash
ssh jeremy@server.local
cd ~/sportio-addon
docker compose up -d --build
docker compose logs -f
curl -s localhost:7100/health
```

Zum Aktualisieren: `src/` erneut kopieren (oder das Repo dort klonen), dann
`docker compose up -d --build`.

## In Sportio hinzufügen

Einstellungen › Playlists › **Add a source** › **Sports addon** (oder im Einrichtungs-Assistenten
„Add content“ › Sports addon). Adresse `http://server.local:7100`, **Check addon** zeigt das Board,
**Add as playlist** importiert `/playlist.m3u` und trägt `/epg.xml` als Guide ein.

Danach sind die Events normale Live-Kanäle; der Sport-Hub gleicht sie mit den ESPN-Fixtures ab.

## Tests

```bash
cd addon
npm test            # node:test, keine Abhängigkeiten
```

Die Kotlin-Seite (`AddonClientTest`) prüft das Parsen von `/api/fixtures.json` und die URL-Normalisierung.

## Grenzen

- StreamFree ist eine fremde Seite ohne Zusage: Token-Format, Pfade und Katalogform können sich ändern.
  Alles davon steckt in `src/streamfree.js` (Token + URLs) und `src/fixtures.js` (Katalog).
- Nur Live-Events. StreamFree nimmt einen Stream nach Spielende vom Server, das Addon listet ihn dann
  nicht mehr — ein importierter Kanal wird für dieses Event also leer.
- Keine Aufzeichnung, kein Catch-up: die Playlist ist ein Live-Fenster von wenigen Minuten.
