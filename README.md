# Harmonia

Harmonia is a Discord voice bot that combines multilingual text-to-speech and music playback. It supports queued speech, platform music streaming through Lavalink, autoplay modes, playlists and favorites, moderation controls, and optional dashboard and health endpoints.

## Highlights

- Multilingual TTS with Edge neural voices
- Optional fallback providers: Piper and macOS `say`
- 36 supported TTS locales
- Shared per-guild queue for speech and music
- Music playback from YouTube, YouTube Music, Spotify, SoundCloud, Deezer, and direct audio URLs
- Autoplay modes: `strict-original`, `artist-continuity`, `discovery`, `radio`
- Favorites, named playlists, lyrics lookup, and effect presets
- Auto-TTS for text channels and a dedicated message-based music request channel
- Access control, blocked words, admin and DJ roles, and 24/7 stay-connected mode
- SQLite-backed persistence for guild settings, history, favorites, playlists, and autoplay memory
- Optional web dashboard at `/`, JSON snapshot at `/dashboard.json`, and health check at `/health`

## Stack

- Node.js 22.x
- `discord.js` 14
- `@discordjs/voice`
- `lavalink-client`
- `better-sqlite3`
- `node-edge-tts`
- `ffmpeg-static`
- Piper (optional)
- Lavalink v4 + Java 17+ for streaming-platform music playback

## Requirements

- Node.js 22+
- A Discord bot token and application client ID
- Java 17+ and Lavalink if you want YouTube, YouTube Music, Spotify, SoundCloud, or Deezer playback

Without Lavalink, Harmonia can still play direct audio URLs such as `.mp3`, `.m4a`, and similar streams.

## Quick Start

1. Clone the repo.
2. Copy `.env.example` to `.env`.
3. Set `DISCORD_BOT_TOKEN` and `CLIENT_ID`.
4. If you want faster dev command deploys, set `GUILD_ID`.
5. If you want streaming-platform music playback, start Lavalink and set `LAVALINK_HOSTS` and `LAVALINK_AUTH`.
6. Install dependencies:

```bash
npm install
```

7. Deploy slash commands:

```bash
npm run deploy
```

8. Start the bot:

```bash
npm start
```

## Important Environment Variables

Use `.env.example` as a starting template. These are the settings that matter most in practice.

### Required

- `DISCORD_BOT_TOKEN`: Discord bot token
- `CLIENT_ID`: Discord application client ID

### Common

- `GUILD_ID`: optional guild-scoped command deploys for development
- `PORT`: HTTP port when the web server is enabled
- `ENABLE_HTTP_SERVER`: set to `true` to expose `/`, `/dashboard.json`, and `/health`
- `ENABLE_MESSAGE_CONTENT_INTENT`: required for `/autotts` and the message-based music request channel
- `DATA_DIR`: runtime data directory; defaults to `./data`, with a `/tmp/harmonia-data` fallback when needed

### TTS

- `TTS_PROVIDER_ORDER`: provider order, for example `edge,piper` on Linux or `edge,piper,system` on macOS
- `PIPER_BINARY_URL`
- `PIPER_INSTALL_DIR`
- `PIPER_PATH`
- `PIPER_MODEL_DIR`
- `PIPER_MODEL_MAP`: explicit locale-to-model-path mapping
- `PIPER_MODEL_MANIFEST`: model download manifest for `npm run setup:piper`

### Music / Lavalink

- `LAVALINK_HOSTS`: comma-separated `host:port` list
- `LAVALINK_AUTH`: Lavalink password
- `LAVALINK_SECURE`: set to `true` for TLS-enabled nodes
- `SEARCH_ENGINE`: preferred text search source
- `MUSIC_TEXT_SEARCH_SOURCES`: ordered sources used for text resolution and autoplay seeding

### Optional Provider Credentials

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_PREFER_ANONYMOUS_TOKEN`
- `SPOTIFY_TOKEN_ENDPOINT`
- `YOUTUBE_OAUTH_REFRESH_TOKEN`

## TTS Provider Behavior

- Edge is the primary TTS provider.
- Piper is the main fallback on Linux and other non-macOS hosts.
- The `system` provider uses macOS `say` and is only available on macOS.
- `npm run setup:piper` is safe to run even when Piper env vars are unset; it skips downloads when nothing is configured.

## Lavalink Setup

Lavalink is required for YouTube, YouTube Music, Spotify, SoundCloud, and Deezer playback. The included config is already wired for Harmonia's resolver and autoplay flow.

### Quickest Option: Docker Compose

```bash
export LAVALINK_SERVER_PASSWORD=yourlavalinkpassword
docker compose -f docker-compose.lavalink.yml up -d --build
```

Then set these in the bot's `.env`:

```text
LAVALINK_HOSTS=localhost:2333
LAVALINK_AUTH=yourlavalinkpassword
LAVALINK_SECURE=false
```

### Optional Lavalink Extras

- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` improve Spotify-backed resolution and recommendations
- `YOUTUBE_OAUTH_REFRESH_TOKEN` helps the YouTube plugin handle more playback cases

### Included Files

- `lavalink.yml`: Lavalink configuration used by the companion service
- `Dockerfile.lavalink`: container image for Lavalink
- `docker-compose.lavalink.yml`: local orchestration for Lavalink

## Persistence

Harmonia stores runtime data under `DATA_DIR`.

- SQLite database: `harmonia.db`
- Per-user language defaults: `user-settings.json`
- Pending language-picker requests and speech reveal tokens are in-memory only

On ephemeral hosts such as Heroku dynos or Render services without a disk mount, this data will not survive restarts unless `DATA_DIR` points to persistent storage.

## Commands

Use `/help` in Discord for the current command guide. The main command surface is:

### Speech

- `/help`
- `/speak`
- `/languages`
- `/autotts`
- `/join`
- `/leave`
- `/dequeue`

### Music Playback

- `/play`
- `/insert`
- `/pause`
- `/resume`
- `/previous`
- `/restart`
- `/rewind`
- `/forward`
- `/nowplaying`
- `/skip`
- `/skipto`
- `/stop`
- `/clearqueue`
- `/remove`
- `/move`
- `/shuffle`
- `/unshuffle`
- `/volume`
- `/seek`
- `/loop`
- `/effects`
- `/queue`

### Library and Discovery

- `/autoplay`
- `/radio`
- `/favorite`
- `/favorites`
- `/lyrics`
- `/playlist`

### Reporting

- `/history`
- `/stats`

### Server Configuration

- `/settings`
- `/setmylanguage`
- `/setlanguage`
- `/setidle`
- `/247`
- `/musicchannel`
- `/setchunk`
- `/access`
- `/filter`
- `/setadminrole`
- `/setdjrole`
- `/resetsettings`

### Web Routes

- `/`
- `/dashboard.json`
- `/health`

## Scripts

- `npm start`: start the bot
- `npm run deploy`: deploy slash commands
- `npm run setup:piper`: download and install Piper assets if configured
- `npm test`: run the test suite
- `npm run validate:autoplay`: show the current autoplay validation checklist

## Deployment Notes

### Local or Self-Hosted

- This is the simplest and most reliable way to run Harmonia continuously.
- If you do not need the dashboard or health routes, set `ENABLE_HTTP_SERVER=false`.

### Heroku

- Run Harmonia as a `worker`, not a `web` dyno.
- The included `Procfile` uses a `release` phase for `npm run deploy` and a `worker` process for `npm start`.
- Heroku storage is ephemeral, so `DATA_DIR` will not persist unless you move state elsewhere.
- Piper can be bundled during build via `heroku-postbuild`.

### Render

- The included `render.yaml` is set up for a web service with `/health`.
- Keep the HTTP server enabled on Render so the service has a port to bind to.
- Render's free tier sleeps when idle, so it is not reliable for a 24/7 Discord bot.
- Mount a persistent disk and point `DATA_DIR` at it if you want settings and history to survive restarts.

The current source code and this README are the source of truth for the live implementation.
