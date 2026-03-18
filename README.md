# Mosart Template Stats

Real-time template usage statistics for Viz Mosart, parsed from live log files.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env to point LOG_FOLDER at your Mosart log directory
npm start
```

Then open http://localhost:3000

## Network drives

If your logs are on a network share, set in `.env`:
```
LOG_FOLDER=\\\\SERVER\\Share\\MosartLogs
USE_POLLING=true
POLLING_INTERVAL=1000
```

## What it tracks

Watches for `ExSwitchBackGrounds` events and extracts all template names
from the `Template=` field, splitting on `+` and stripping slot numbers like `(1)`.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express + WebSocket server, stats store, REST API |
| `watcher.js` | Folder watcher using chokidar, tails growing .log files |
| `parser.js` | Stateful line parser, extracts template names |
| `public/index.html` | Self-contained dashboard frontend |
