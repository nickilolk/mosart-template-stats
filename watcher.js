/**
 * watcher.js
 * Watches a folder for Viz Mosart log files.
 *
 * - .log files are tailed in real-time as they grow
 * - .xml files (completed logs) are parsed in full when they appear
 * - Supports both local paths and UNC/network share paths
 * - Use USE_POLLING=true in .env for network drives
 */

const chokidar = require('chokidar');
const fs        = require('fs');
const path      = require('path');
const { LogParser } = require('./parser');

const STARTUP_CHUNK = 256 * 1024; // bytes per tick during initial file load

class LogWatcher {
  constructor(folder, onTemplate, options = {}) {
    this.folder       = path.resolve(folder);
    this.onTemplate   = onTemplate;
    this.onStatus     = options.onStatus     || null;
    this.usePolling   = options.usePolling   || false;
    this.pollInterval = options.pollInterval || 1000;

    // Per-file state
    this.positions    = new Map(); // filepath -> byte offset
    this.parsers      = new Map(); // filepath -> LogParser instance
    this.lineBuffers  = new Map(); // filepath -> partial line string

    // Startup serialization — files are read one at a time to avoid OOM
    this._startupQueue = [];
    this._startupBusy  = false;
    this._startupTotal = 0;
    this._startupDone  = 0;
  }

  start() {
    const watchOptions = {
      persistent:      true,
      ignoreInitial:   false,
      awaitWriteFinish: false,
      usePolling:      this.usePolling,
      interval:        this.pollInterval,
      binaryInterval:  this.pollInterval,
    };

    const watcher = chokidar.watch(
      [path.join(this.folder, '*.log'), path.join(this.folder, '*.xml')],
      watchOptions
    );

    watcher
      .on('add',    filePath => this._onAdded(filePath))
      .on('change', filePath => this._onChanged(filePath))
      .on('unlink', filePath => this._onRemoved(filePath))
      .on('error',  err     => console.error('[Watcher error]', err));

    console.log(`[Watcher] Monitoring: ${this.folder}`);
    console.log(`[Watcher] Polling mode: ${this.usePolling ? `yes (${this.pollInterval}ms)` : 'no (native fs events)'}`);
  }

  _onAdded(filePath) {
    console.log(`[Watcher] Tracking: ${path.basename(filePath)}`);
    this.positions.set(filePath, 0);
    this.parsers.set(filePath, new LogParser(this.onTemplate));
    this.lineBuffers.set(filePath, '');
    this._startupTotal++;
    this._startupQueue.push(filePath);
    if (!this._startupBusy) {
      this._startupBusy = true;
      // Defer so all synchronous 'add' events fire first — ensures _startupTotal is complete
      setImmediate(() => this._nextStartupFile());
    }
  }

  _onChanged(filePath) {
    this._readNewBytes(filePath);
  }

  _onRemoved(filePath) {
    this.positions.delete(filePath);
    this.parsers.delete(filePath);
    this.lineBuffers.delete(filePath);
  }

  // ── Startup: serialized, chunked reads ───────────────────────────────────────

  _nextStartupFile() {
    if (this._startupQueue.length === 0) {
      this._startupBusy = false;
      if (this.onStatus) this.onStatus('done', this._startupDone, this._startupTotal);
      return;
    }
    if (this.onStatus) this.onStatus('processing', this._startupDone, this._startupTotal);
    this._readStartupChunk(this._startupQueue.shift());
  }

  _readStartupChunk(filePath) {
    const position = this.positions.get(filePath) ?? 0;
    const parser   = this.parsers.get(filePath);
    if (!parser) { setImmediate(() => this._nextStartupFile()); return; }

    let fd, fileSize;
    try {
      fd       = fs.openSync(filePath, 'r');
      fileSize = fs.fstatSync(fd).size;

      if (fileSize <= position) {
        setImmediate(() => this._nextStartupFile());
        return;
      }

      const chunkSize = Math.min(STARTUP_CHUNK, fileSize - position);
      const buf       = Buffer.alloc(chunkSize);
      const bytesRead = fs.readSync(fd, buf, 0, chunkSize, position);
      this.positions.set(filePath, position + bytesRead);

      const raw   = this.lineBuffers.get(filePath) + buf.toString('utf8');
      const lines = raw.split('\n');
      this.lineBuffers.set(filePath, lines.pop());
      lines.forEach(line => parser.processLine(line));

    } catch (err) {
      console.error(`[Watcher] Read error on ${path.basename(filePath)}: ${err.message}`);
      setImmediate(() => this._nextStartupFile());
      return;
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
    }

    const newPos = this.positions.get(filePath) ?? 0;
    if (newPos < fileSize) {
      setImmediate(() => this._readStartupChunk(filePath));
    } else {
      this._startupDone++;
      setImmediate(() => this._nextStartupFile());
    }
  }

  // ── Live tailing: reads only new bytes since last position ───────────────────

  _readNewBytes(filePath) {
    const position = this.positions.get(filePath) ?? 0;
    const parser   = this.parsers.get(filePath);
    if (!parser) return;

    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
      const { size } = fs.fstatSync(fd);

      if (size <= position) return;

      const chunkSize = size - position;
      const buf       = Buffer.alloc(chunkSize);
      const bytesRead = fs.readSync(fd, buf, 0, chunkSize, position);

      this.positions.set(filePath, position + bytesRead);

      const raw   = this.lineBuffers.get(filePath) + buf.toString('utf8');
      const lines = raw.split('\n');
      this.lineBuffers.set(filePath, lines.pop());

      lines.forEach(line => parser.processLine(line));

    } catch (err) {
      console.error(`[Watcher] Read error on ${path.basename(filePath)}: ${err.message}`);
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

module.exports = LogWatcher;
