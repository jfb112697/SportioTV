# docs/INDEX.md — Doku-Landkarte (Stand: 2026-10-20)

> Zweck: einzige Übersicht aller Dokus mit Status. Agents lesen nur, was hier steht.

## Aktiv

| Datei | Zweck | Status |
|---|---|---|
| `../AGENTS.md` | Verbindliche Agent-Regeln (Lesereihenfolge, Freeze, Gates, Verbote) | aktiv, Vorrang vor allem |
| `BUILD.md` | Bauen/Installieren/Emulator (JDK 17, SDK, Gradle-Befehle) | aktiv |
| `ARCHITECTURE.md` | Module, Core-Bezug, TV-only, Sport-Hub-Überblick | aktiv |
| `BRANDING.md` | Was heisst Sportio, was bleibt technisch OwnTV (Naming-Freeze) | aktiv |
| `SPORT-HUB.md` | Sport-Hub + Channel-Matching (konsolidiert) | aktiv, ersetzt `sport-hub-plan.md` + `sport-channel-matching.md` als Einstieg |
| `SPORT-AI.md` | DeepSeek-KI-Empfehlung im Sport-Hub (Ablauf, Datenschutz, lokaler Katalog-Abgleich) | aktiv, Stand 2026-10-20, + Ausnahme Playlist-Import, Key und KI-Schalter in den App-Einstellungen |
| `sport-hub-plan.md` | Ausführliche Sport-Hub-Spezifikation (Phasen 1–7) | aktiv, Detailreferenz |
| `sport-channel-matching.md` | ESPN-Fixture → Sender-Matching (Discovery, Scoring, Tests) | aktiv, Detailreferenz |
| `PLAYLIST-IMPORT.md` | Playlist aus Provider-Nachricht (KI zuerst, Companion-Bestätigung am Handy) | aktiv, Stand 2026-10-20, P0–P3 umgesetzt, KI-Schalter (Core 1.0.71) |
| `ADDON.md` | Hosted StreamFree-Addon (`addon/`): Endpunkte, Resolver, Deployment auf `server.local`, Aufnahme als Playlist in Sportio | aktiv, Stand 2026-11-07 |
| `sport-roadmap.md` | Roadmap Reddit-Feedback + User-Punkte (Sport-Hub, Live-TV Sprachen) | aktiv, Plan 2026-10-14 |
| `i18n-gate.md` | Gate-Befehle + Literal-Workflow | aktiv |
| `internationalization.md` | i18n-Gesamtplan v2 (Phasen 0–3 done) | aktiv, Detailreferenz |
| `i18n.md` | i18n-Authoring-Guide (Keys vs. Labels) | aktiv |
| `RELEASE.md` | Signing, Versionierung, In-App-Updates | aktiv |
| `brand/BRAND_GUIDE_SPORTIO.md` | Verbindliche Sportio-Brand-Referenz v1.0 | aktiv |
| `brand/sportio.tokens.json` | Maschinenlesbare Design-Tokens | aktiv |
| `../README.md` | Öffentliche Projektseite (Sportio) | aktiv |
| `../CHANGELOG.md` | Release-Notes | aktiv |

## Archiv (nicht löschen, nicht als Anleitung nutzen)

| Datei | Warum archiviert |
|---|---|
| `archive/i18n-phase2-language-picker.md` | Implementiert, nur Historie |
| `archive/i18n-phase3-qa.md` | Durch neuere QA-Doku ersetzt |
| `archive/i18n-phase4a-seed-translations.md` | Seed-Plan, superseded |
| `archive/i18n-apk-size-baseline.md` | Phase-0-Referenz, nur Historie |
| `../HANDOFF.md` | Auf Status-Zeiger geschrumpft, Wissen liegt in `docs/` |

## Upstream-Texte (ausserhalb `docs/`, bewusst behalten)

- `../extras/USER_GUIDE.md` — Endnutzer-Handbuch (Upstream-Stand).
- `../extras/OwnTV_Master_Product_Brief.md` — Upstream-Produktspec.
- `../CONTRIBUTING.md` — Upstream-Contrib-Regeln.
