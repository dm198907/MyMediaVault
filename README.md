# 🎬 MyMediaVault

A self-hosted media library dashboard for **rclone + Google Drive (gcrypt)** users. Parses `rclone lsl` output and builds a visual library with posters, episode tracking, missing episode detection, and metadata from OMDb, TMDB, and AniList.

![Version](https://img.shields.io/badge/version-2.0-f5c518?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20SQLite-60a5fa?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-4ade80?style=flat-square)

---

## Screenshots

> Tile grid view with posters, quality badges, progress bars, and missing episode indicators.

---

## Features

### 📺 Library
- Parses `rclone lsl` / `lsf` / plain path output
- Auto-groups files into TV shows and movies
- Detects episodes in standard (`S01E01`) and anime (`- 24 -`) naming formats
- **Duplicate detection** — flags same episode from multiple release groups
- **Subtitle tracking** — detects `.srt` / `.ass` files per episode
- **Quality badges** — `4K` `1080p` `720p` parsed from filenames
- **Audio badges** — `FLAC` `DTS` `TrueHD` `AAC` parsed from filenames
- **Collection progress bars** — shows % complete vs total episodes

### 🔍 Metadata (3 sources)
| Source | Used for | Key required |
|--------|----------|-------------|
| **OMDb** | Primary — TV + Movies | Free at omdbapi.com |
| **TMDB** | Fallback when OMDb fails | Free at themoviedb.org |
| **AniList** | Anime titles | None — free GraphQL API |

- Posters, ratings, plot, cast, genre, runtime
- Full episode list per season for accurate missing detection
- Episode titles shown on hover
- Direct IMDb / TMDB / AniList links

### 💾 SQLite Database (server-side)
- All metadata cached in `vault.db` — survives browser clears
- Persists across devices and browsers
- File list saved — auto-loads on every refresh, no re-paste needed
- Manual IMDb ID override per show/movie — stored permanently
- Export / Import DB as JSON for backup

### 🎨 UI
- **4 themes** — Dark, Light, AMOLED, Nord
- **Tile grid** and **Poster wall** (Netflix-style fullscreen) view modes
- Slide-in detail panel with blurred poster hero
- Filter: All / Missing / Complete / Duplicates / Anime
- Sort: Name / Size / IMDb Rating / Episodes / Progress
- Movies sort: Size / Rating / Decade / Runtime / Genre
- **Export missing episodes** as CSV

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite |
| Backend | Express.js |
| Database | SQLite via better-sqlite3 |
| Reverse proxy | Caddy |
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

## Production (Caddy)

### Build
```bash
npm run build
cp -r dist/ /your/caddy/www/media-vault/
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
cat > /etc/systemd/system/media-vault.service << 'EOF2'
[Unit]
Description=Media Vault SQLite API
After=network.target

[Service]
WorkingDirectory=/path/to/MyMediaVault
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5s
StartLimitIntervalSec=0
User=root

[Install]
WantedBy=multi-user.target
EOF2

systemctl enable media-vault
systemctl start media-vault
```

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
2. Click **▶ PARSE** — restores all cached metadata instantly
3. Click **⬇ ENRICH ALL** — fetches missing metadata from OMDb/TMDB
4. From now on, just refresh the page — everything auto-loads from SQLite

### API Keys
| Key | Where to get | Notes |
|-----|-------------|-------|
| OMDb | [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) | Free — 1000 req/day |
| TMDB | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | Free — unlimited |
| AniList | Not needed | Free GraphQL, no key |

---

## File naming support

| Format | Example | Detected as |
|--------|---------|-------------|
| Standard | `Show - S01E01 - Title.mkv` | S1 E1 |
| Dot separated | `Show.S01E01.Title.mkv` | S1 E1 |
| Space in SxEx | `Show - S01 E01.mkv` | S1 E1 |
| Anime absolute | `Show - 24 (1080p).mkv` | S1 E24 |
| Anime brackets | `[Group] Show - 01 [hash].mkv` | S1 E1 |

---

## Project Structure

```
MyMediaVault/
├── src/
│   └── App.jsx          # Full React frontend (modularization planned)
├── server.js            # Express + SQLite API server
├── vault.db             # SQLite database (gitignored)
├── public/
├── index.html
├── vite.config.js
└── package.json
```

### Planned modularization
```
src/
├── api/db.js            # SQLite API client
├── utils/parse.js       # File parsing + quality detection
├── utils/omdb.js        # OMDb + TMDB + AniList fetch
├── components/
│   ├── DetailPanel.jsx
│   ├── ShowTile.jsx
│   ├── MovieTile.jsx
│   ├── DbInspector.jsx
│   └── ManualIdPanel.jsx
└── App.jsx              # State + layout only
```

---

## Roadmap

- [ ] Auto-run rclone lsl on schedule
- [ ] Sonarr/Radarr API import
- [ ] Telegram/Discord webhook for missing episodes
- [ ] Multi-remote support
- [ ] AniDB support
- [ ] Batch re-fetch stale cache

---

## License

MIT — use freely, PRs welcome.
