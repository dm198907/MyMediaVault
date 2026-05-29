# ?? MyMediaVault

A self-hosted media library dashboard for **rclone + Google Drive (gcrypt)** users. Parses `rclone lsl` output and builds a visual library with posters, episode tracking, missing episode detection, and metadata from OMDb, TMDB, and AniList.

![Version](https://img.shields.io/badge/version-2.1-f5c518?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%2019%20%2B%20Express%20%2B%20SQLite-60a5fa?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-4ade80?style=flat-square)

---

## What's New in v2.1

### ?? Bug Fixes
- **Anime season detection** — folder-aware season parsing (e.g. `Season 2/` ? S02, not S01 for everything)
- **Anime absolute episode regex** — files like `Show - 24.mkv` no longer fall through to the Movies list
- **Sonarr-style absolute episode remapping** — shows where all files are in S01 with absolute numbering (e.g. DBZ Kai S01E099 = S02E01) are now correctly split into multiple seasons matching OMDb
- **Per-season OMDb offset normalisation** — shows where OMDb lists S02 episodes as E49–E96 (absolute) but your files use per-season E01–E24 (relative) are now matched correctly (e.g. Fairy Tail)
- **Smart offset detection** — seasons where *both* OMDb and local files use absolute numbering (e.g. Fairy Tail S09: E278–E328) are never incorrectly normalised
- **Fully-missing seasons now visible** — seasons you don't have any files for (e.g. Season 2 you haven't downloaded yet) now appear with all episodes shown in red, so you know exactly what to grab
- **OMDb enricher fetches all seasons** — previously only locally-detected seasons were fetched; now all seasons known to OMDb (`totalSeasons`) are fetched and cached

### ? New Features
- **Source badge** — every detail panel shows whether data came from `OMDB`, `TMDB`, or `ANILIST` with a direct clickable link to the source page
- **Manual AniList ID** — AniList ID input is now available for **all** shows (not just auto-detected anime), so you can force any show to use AniList data
- **Build timestamp in header** — green build stamp in the top bar so you always know which version is running

---

## Features

### ?? Library
- Parses `rclone lsl` / `lsf` / plain path output
- Auto-groups files into TV shows and movies
- Detects episodes in standard (`S01E01`) and anime (`- 24 -`) naming formats
- **Folder-aware season detection** — reads `Season 2/` folder structure for anime using absolute numbering
- **Sonarr-style absolute episode remapping** — maps absolute-numbered files to correct OMDb seasons
- **Per-season offset normalisation** — handles shows where OMDb and local use different numbering conventions
- **Duplicate detection** — flags same episode from multiple release groups
- **Subtitle tracking** — detects `.srt` / `.ass` files per episode
- **Quality badges** — `4K` `1080p` `720p` parsed from filenames
- **Audio badges** — `FLAC` `DTS` `TrueHD` `AAC` parsed from filenames
- **Collection progress bars** — shows % complete vs total episodes

### ?? Metadata (3 sources)
| Source | Used for | Key required |
|--------|----------|-------------|
| **OMDb** | Primary — TV + Movies | Free at omdbapi.com |
| **TMDB** | Fallback when OMDb fails | Free at themoviedb.org |
| **AniList** | Anime titles | None — free GraphQL API |

- Posters, ratings, plot, cast, genre, runtime
- Full episode list per season for accurate missing detection
- Episode titles shown in missing list
- **Source badge** — shows which API provided the data with a direct link
- Direct IMDb / TMDB / AniList links per show

### ?? SQLite Database (server-side)
- All metadata cached in `vault.db` — survives browser clears
- Persists across devices and browsers
- File list saved — auto-loads on every refresh, no re-paste needed
- Manual IMDb ID override per show/movie — stored permanently
- **Manual AniList ID** input for any show
- Export / Import DB as JSON for backup

### ?? UI
- **4 themes** — Dark, Light, AMOLED, Nord
- **Tile grid** and **Poster wall** view modes
- Slide-in detail panel with blurred poster hero
- Filter: All / Missing / Complete / Duplicates / Anime
- Sort: Name / Size / IMDb Rating / Episodes / Progress
- Movies sort: Size / Rating / Decade / Runtime / Genre
- **Export missing episodes** as CSV

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite 8 |
| Backend | Express.js 5 |
| Database | SQLite via better-sqlite3 |
| Reverse proxy | Caddy (Docker) |
| APIs | OMDb · TMDB · AniList GraphQL |

---

## Installation

### Prerequisites
- Node.js 20+
- rclone configured with a gcrypt remote

### 1. Clone and install
```bash
git clone https://github.com/dm198907/MyMediaVault.git
cd MyMediaVault
npm install
```

### 2. Run the backend (SQLite API)
```bash
node server.js
# API runs on http://localhost:3001
# DB created at ./vault.db
```

### 3. Run the frontend
```bash
npm run dev -- --host 0.0.0.0
# Open http://your-server-ip:5173
```

---

## Production (Caddy via Docker)

### Build
```bash
npm run build
# Copy dist into your Caddy container:
docker cp dist/. caddy:/var/www/media-vault/
```

### Caddyfile block
```caddy
https://your.domain.com:8116 {
    tls /path/to/cert.crt /path/to/cert.key

    handle /api/* {
        reverse_proxy 172.17.0.1:3001
    }

    handle {
        root * /var/www/media-vault
        file_server
        try_files {path} /index.html
    }
}
```

### Run server.js as a systemd service
```bash
cat > /etc/systemd/system/media-vault.service << 'EOF'
[Unit]
Description=Media Vault SQLite API
After=network.target

[Service]
WorkingDirectory=/path/to/MyMediaVault
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5s
User=mediavault

[Install]
WantedBy=multi-user.target
EOF

systemctl enable media-vault
systemctl start media-vault
```

> ?? **Security**: Create a dedicated `mediavault` user instead of running as `root`.

---

## Usage

### Generate file list from rclone
```bash
# Full library
rclone lsl gcrypt: --fast-list > mediafile.txt

# Specific folders
rclone lsl gcrypt:TV --fast-list > mediafile.txt
rclone lsl gcrypt:Movies --fast-list >> mediafile.txt
```

### Dashboard workflow
1. Paste `mediafile.txt` contents into the textarea
2. Click **? PARSE** — restores all cached metadata instantly
3. Click **? ENRICH ALL** — fetches missing metadata from OMDb/TMDB
4. From now on, just refresh the page — everything auto-loads from SQLite

### API Keys
| Key | Where to get | Notes |
|-----|-------------|-------|
| OMDb | [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) | Free — 1000 req/day |
| TMDB | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | Free — unlimited |
| AniList | Not needed | Free GraphQL, no key |

---

## File Naming Support

| Format | Example | Detected as |
|--------|---------|-------------|
| Standard | `Show.S01E01.Title.mkv` | S1 E1 |
| Space separated | `Show - S01E01 - Title.mkv` | S1 E1 |
| Anime absolute | `Show - 24 (1080p).mkv` | Season from folder, E24 |
| Anime with dot | `Show - 24.mkv` | Season from folder, E24 |
| Anime brackets | `[Group] Show - 01 [hash].mkv` | S1 E1 |
| Absolute in folder | `Season 2/Show - 38.mkv` | S2 E38 |

### Anime Season Handling

MyMediaVault handles the three common anime library layouts:

| Layout | Example | How it's handled |
|--------|---------|-----------------|
| **All in S01, absolute** | DBZ Kai S01E001–S01E141 | Sonarr-style remap using OMDb episode counts as offsets |
| **Per-season relative** | Fairy Tail S02E01–E24 | OMDb absolute episode numbers normalised to 1-based per season |
| **Per-season absolute** | Fairy Tail S09E278–E328 | Detected automatically — no offset applied |

---

## Project Structure

```
MyMediaVault/
+-- src/
¦   +-- App.jsx          # Full React frontend (modularisation planned)
+-- server.js            # Express + SQLite API server
+-- vault.db             # SQLite database (gitignored)
+-- public/
+-- index.html
+-- vite.config.js
+-- package.json
```

### Planned modularisation (v3.0)
```
src/
+-- api/db.js
+-- utils/parse.js
+-- utils/metadata.js
+-- components/
¦   +-- DetailPanel.jsx
¦   +-- ShowTile.jsx
¦   +-- MovieTile.jsx
¦   +-- ManualIdPanel.jsx
+-- App.jsx
```

---

## Roadmap

- [ ] Auto-run rclone lsl on schedule (`node-cron` + `POST /api/refresh`)
- [ ] TypeScript migration
- [ ] Watched / unwatched tracking per episode
- [ ] Storage breakdown chart (donut/treemap by show/genre)
- [ ] Telegram / Discord webhook for new missing episodes
- [ ] Stale cache refresh (re-fetch entries older than N days)
- [ ] PWA + mobile layout
- [ ] Keyboard shortcuts (`/` search, Esc close, ?/? navigate)
- [ ] Sonarr / Radarr API import
- [ ] Multi-remote support

---

## Changelog

### v2.1 (May 2026)
- Sonarr-style absolute episode remapping
- Per-season OMDb offset normalisation with smart detection
- Fully-missing seasons now visible in detail panel
- OMDb enricher now fetches all `totalSeasons`, not just local ones
- Source badge (OMDB / TMDB / ANILIST) with direct links in detail panel
- Manual AniList ID input available for all shows
- Build timestamp in header
- Folder-aware season extraction for anime
- Anime episode regex fix (dot boundary)

### v2.0
- Initial public release
- OMDb + TMDB + AniList metadata
- SQLite caching
- Duplicate detection
- Missing episode CSV export

---

## License

MIT — use freely, PRs welcome.