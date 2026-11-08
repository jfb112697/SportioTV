<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/brand/assets/png/sportio-logo-light.png">
    <img src="docs/brand/assets/png/sportio-logo.png" alt="Sportio" width="360">
  </picture>
</p>

<p align="center">
  <b>Live TV and sports for Android TV</b><br>
  <sub>ESPN fixtures, scores and standings — matched against your own channels, one tap to play</sub>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Android%20TV-3DDC84?logo=android&logoColor=white">
  <img alt="Kotlin" src="https://img.shields.io/badge/Kotlin-2.4.20-7F52FF?logo=kotlin&logoColor=white">
  <img alt="Compose for TV" src="https://img.shields.io/badge/Jetpack%20Compose-for%20TV-4285F4?logo=jetpackcompose&logoColor=white">
  <img alt="Player" src="https://img.shields.io/badge/engines-libmpv%20%2B%20ExoPlayer-FB8C00">
  <img alt="License" src="https://img.shields.io/badge/license-GPLv3-blue">
  <a href="https://hosted.weblate.org/engage/owntv/">
    <img alt="Translation status" src="https://hosted.weblate.org/widget/owntv/svg-badge.svg">
  </a>
</p>

<p align="center">
  <a href="https://github.com/trenntl/SportioTV/actions/workflows/android.yml">
    <img alt="Android CI" src="https://github.com/trenntl/SportioTV/actions/workflows/android.yml/badge.svg">
  </a>
</p>

---
Sportio is a native **Android TV** app for **live TV and sports**, built with Kotlin and Jetpack
Compose for TV. Its **Sports Hub** shows ESPN fixtures, scores, standings and tables for 81 leagues
and matches every fixture against **your own live channels** — names and guide text, both teams
required — so one tap starts playback. It runs **two playback engines** — libmpv (FFmpeg) for the
widest compatibility, ExoPlayer (Media3) for near-instant Live TV — and it is a *player only*: you
bring your own **Xtream** login, **M3U** playlist (URL or a local file) or **Stalker/Ministra**
portal.

> ⚠️ Sportio ships **no** channels, playlists, subscriptions or streams. You are responsible for the
> sources you add.

Open source, GPLv3. Forked from [OwnTV](https://github.com/ahXN00/OwnTV) — thanks for the shoulders.
**Android TV only** — leanback launcher, D-pad first.

---

## ✨ Features

### 🏟️ Sports Hub
- **81 leagues** (ESPN catalogue, 16 active by default) with an Add-leagues picker
- **Live / Upcoming / Past tabs** and a Favourites rail (active leagues, followed teams and athletes)
- **Fixture → channel matching** across channel names and guide text, with a language filter
  (exact event channels always pass); single-sport views for tennis, Formula 1 and more
- **Manage leagues, teams and athletes from a phone** (QR companion page over Wi-Fi)
- **Hosted sports addon** (this fork): add a StreamFree addon server as a source and its live
  fixtures arrive as channels with a guide — see [docs/ADDON.md](docs/ADDON.md)

### 📡 Live TV
- **Two engines** — mpv for compatibility, ExoPlayer for instant start, with automatic fallback
- **4K HDR** direct rendering, auto frame rate, surround with stereo safety net, 150% volume boost
- Subtitles, closed captions and OpenSubtitles search; resume, mini-player, audio-only mode
- **TV Guide** (XMLTV) with live Now marker, catch-up up to 7 days, live rewind
- **Protected (DRM) channels** — Widevine and ClearKey, read from the playlist
- Custom **DNS**, per-playlist player and latency settings
- An **error log you can export** for any stream that misbehaves

### 🎨 Look & robustness
- Sportio green theme, app icon and wordmark; **Dark and Light themes** across app and player
- Interface and popup font sizing, glass effect, your own accent colour
- **25 interface languages**, RTL-aware, chosen on the fresh-install welcome screen
- **Backup & Restore** to a single `.own` file, optionally encrypted, locally or over Wi-Fi
- Profiles with PIN locks, per-profile startup, favourites and history
- In-app updates; memory-safe lists, auto-reconnect and offline detection throughout

> The full feature reference lives in [docs/](docs/INDEX.md); end-user docs are in
> [extras/USER_GUIDE.md](extras/USER_GUIDE.md).

## 💚 Support me

If Sportio is useful to you, you can support development here:
[coinsend.to/@trentl](https://coinsend.to/@trentl)

---

## 🧱 Tech stack

| Area | Choice |
|------|--------|
| Language | Kotlin 2.4.20 (no `kotlin-android` plugin) |
| Build | AGP 9.4.0 / Gradle 9.7.1, KSP2 2.3.11 |
| UI | Jetpack Compose for TV (`androidx.tv:tv-material` 1.1.0), Compose BOM 2026.08.00 |
| Media | **libmpv** (FFmpeg) · **ExoPlayer/Media3** 1.11.1 |
| Database | Room 2.8.5 + Paging 3.5.1 + FTS4 |
| DI · Network · Images | Koin 4.2.2 · OkHttp 5 · Coil 3.6.0 |

`minSdk 26`, `targetSdk 36`, `compileSdk 37`, `applicationId tv.sportio.app`.

### Project layout

This repository is the **Android TV app**. Everything underneath it — database, sync, parsers, EPG,
backup, settings storage, the playback engines and every translated string — is a separate core
library, [**SportioTV_Core**](https://github.com/trenntl/SportioTV_Core), published as
`tv.own.owntv:core` / `:player-core`.

```
SportioTV/  (this repo)
tv.own.owntv/
├── player/      the TV player HUD, surfaces and mini-player
├── ui/          theme + reusable components
├── features/    setup, shell, live, sport, epg, profiles, settings
└── di/          Koin modules
```

## 📥 Installing (Fire TV / Android TV)

Grab the signed APK from the [**latest release**](https://github.com/trenntl/SportioTV/releases/latest).
This link always points at the newest build:

```
https://github.com/trenntl/SportioTV/releases/latest/download/Sportio.apk
```

- **On Fire TV, the easiest path is the Downloader app:** install it from the Amazon app store,
  enter the code **5135027**, and it downloads the newest `Sportio.apk` for you. The URL above can
  also be typed into Downloader directly.
- Otherwise sideload with *Send files to TV*, a USB drive, or `adb install Sportio.apk`.

> Install only from this repository's Releases. Each release ships **two APKs**:
> `Sportio.apk` (arm — every real TV box) and `Sportio-x86_64-vX.X.X.apk` (emulators and rare
> Intel boxes).

> Coming from the previous project home? Installs update in place (same signature) — see the
> [release notes](CHANGELOG.md).

## 🛠️ Building & running

> Only if you want to build from source — otherwise just install the APK.

Gradle downloads the core library from Sportio's public Maven repository by itself — **no account
or token needed**.

1. **Get the code** — `git clone https://github.com/trenntl/SportioTV.git` (or download the ZIP).
2. **Open it** in [Android Studio](https://developer.android.com/studio) and let Gradle sync.
3. **Pick the build variant** — `standard` for real devices and arm emulators, `x86_64` for x86_64
   emulators. This matters: the native player only loads on a matching ABI.
4. **Run** ▶. Minimum **Android 8.0 / API 26**.

Command line: `./gradlew assembleDebug` (`gradlew.bat` on Windows). The APK lands in
`app/build/outputs/apk/`.

## 🤝 Contributing

Bug reports and ideas are welcome — open an issue or a pull request. Please keep the project's
live-TV-and-sports positioning and match the existing code style. Agent rules live in
[AGENTS.md](AGENTS.md); the docs map is at [docs/INDEX.md](docs/INDEX.md).

<!-- i18n-contribution:start -->
## Help translate OwnTV

If your language is already available, contribute interface translations across OwnTV's six Android resource components on [Hosted Weblate](https://hosted.weblate.org/projects/owntv/). If it is not listed, [open a language request ticket](https://github.com/ahXN00/OwnTV/issues/new?template=feature_request.yml&title=%5BLanguage%5D%20Add%20) first. A maintainer will review the request, register the locale, and prepare its base translation files on Hosted Weblate. Once the language appears on Hosted Weblate, you can start translating it there. The strings themselves live in [OwnTV's core library repository](https://github.com/ahXN00/OwnTV_Core), together with the language contributor guide covering identifiers, validation, and promotion policy.
<!-- i18n-contribution:end -->

## 🙏 Credits

<img src="extras/partner-logos/Weblate_logo.svg" alt="Weblate" width="200">

Sportio speaks 25 languages through translations made on
[**Weblate**](https://weblate.org/), which hosts the project free of charge for libre software.
Thank you to Weblate and to every translator. (Strings live upstream — translation happens on the
OwnTV project and merges down.)

<img src="extras/partner-logos/tmdb_logo.svg" alt="TMDB" width="200">

Metadata and trailers are provided by [TMDB](https://www.themoviedb.org/).
**This product uses the TMDB API but is not endorsed or certified by TMDB.**

<img src="extras/partner-logos/opensubtitles_logo.svg" alt="OpenSubtitles" width="200">

Subtitle search & download is powered by [OpenSubtitles.com](https://www.opensubtitles.com/).
**This product uses the OpenSubtitles API but is not endorsed or certified by OpenSubtitles.** You sign
in with your own OpenSubtitles account and are subject to their terms and download quotas.

Forked from **[OwnTV](https://github.com/ahXN00/OwnTV)** — database, sync, parsers, player engines
and the design system come from there. Core lives on as
**[SportioTV_Core](https://github.com/trenntl/SportioTV_Core)**.

### ▶️ Playback engines

- **[mpv](https://mpv.io/)** (via [libmpv](https://github.com/mpv-android/mpv-android), built on
  [FFmpeg](https://ffmpeg.org/)) — the default engine, for the widest IPTV/codec, audio and HDR support.
- **[Media3 / ExoPlayer](https://github.com/androidx/media)** — the fast-start engine for Live TV
  preview and HLS.

## ⚖️ Legal

Sportio is a media **player** only. It ships with no channels, playlists, subscriptions, or content, and
does not endorse or facilitate access to unauthorized streams. Users are solely responsible for the
sources they add and for complying with the laws and rights that apply to them.

## 📄 License

Released under the **GNU General Public License v3.0 (GPLv3)** — see [LICENSE](LICENSE).

---

<sub>Sportio — live TV and sports for Android TV. Forked from OwnTV, built with the help of AI.</sub>
