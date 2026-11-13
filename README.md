# Aftertone

[简体中文](README.zh-CN.md)

Aftertone is a personal music library and player that runs on your computer and opens in a desktop browser. Import your own audio files, organize them with favorites and playlists, and listen from one place. Audio stays on your disk, while MySQL stores track information, artwork, favorites, and playlists.

## Features

- **Batch import:** Drag in multiple files, follow each track’s progress, skip exact duplicates, and retry failed imports individually.
- **Automatic audio processing:** Keep valid MP3 files as-is. FFmpeg converts supported formats such as M4A, AAC, WAV, FLAC, and Ogg to MP3 for playback.
- **Library management:** Search by title or artist, read embedded tags and artwork on import, and edit titles, artists, albums, and covers.
- **Favorites and playlists:** Save favorite tracks and build custom playlists. Start playback from the library, favorites, or a playlist.
- **Playback controls:** Seek, adjust volume, use Space to play or pause, and switch between sequential playback, repeat-one, and shuffle.
- **Resume playback:** Reopen Aftertone in the same browser to return to the last track and position. Press Play to continue.
- **Playback queue:** Choose Play Next from a track’s menu, then open the queue from the bottom player to reorder upcoming songs. Manually queued songs play before the rest of the original library, favorites, or playlist.
- **Visual themes:** Choose Rainy Night or Forest Green from the theme selector in the header. Your browser remembers the choice, and you can switch while listening.
- **Storage protection:** See how much space your library uses and how much is free. Imports pause when the disk falls below the configured free-space threshold.

## How it works

| Component | Technology |
| --- | --- |
| Browser interface | Vue 3, TypeScript, and Vite |
| API and audio streaming | Java 21, Spring Boot, and HTTP range requests |
| Library data | MySQL 8.4, Spring Data JPA, and Flyway |
| Audio inspection and conversion | FFprobe and FFmpeg |

## Run locally on Windows

Install **Java 21**, **MySQL 8.4**, and **npm**. Use Node.js **22.18+ in the 22.x series** or **24.12+**. If your Node.js version is older, run `./scripts/setup-node.ps1` from the project root to prepare a compatible project runtime. The backend uses the Maven Wrapper.

Run these commands from the project root in PowerShell:

```powershell
.\scripts\setup-ffmpeg.ps1
.\scripts\init-database.ps1 -Port 3306
.\scripts\start-backend.ps1
```

Replace `3306` with your MySQL port if it differs. Run the database initialization only for a fresh installation; it creates a dedicated database and application account. For an existing setup, use the database configuration described in the [Chinese guide](README.zh-CN.md#首次配置数据库--手动配置).

In another PowerShell window, run:

```powershell
.\scripts\start-frontend.ps1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) and import some audio. The interface is currently in Simplified Chinese. The backend and frontend bind to localhost by default.

## Project layout

- `frontend/` — browser interface, player, and frontend tests
- `backend/` — API, audio processing, database migrations, and backend tests
- `scripts/` — Windows setup, startup, and verification scripts
- `docs/` — verification notes and design references

Aftertone is in local development. See the [changelog](CHANGELOG.md) and [roadmap](plan.md) for progress and planned work.
