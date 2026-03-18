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

class LogWatcher {
  constructor(folder, onTemplate, options = {}) {
    this.folder       = path.resolve(folder);
    this.onTemplate   = onTemplate;
    this.usePolling   = options.usePolling   || false;
    this.pollInterval = options.pollInterval || 1000;

    // Per-file state
    this.positions    = new Map(); // filepath -> byte offset
    this.parsers      = new Map(); // filepath -> LogParser instance
    this.lineBuffers  = new Map(); // filepath -> partial line string
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
    this._readNewBytes(filePath);
  }

  _onChanged(filePath) {
    this._readNewBytes(filePath);
  }

  _onRemoved(filePath) {
    this.positions.delete(filePath);
    this.parsers.delete(filePath);
    this.lineBuffers.delete(filePath);
  }

  _readNewBytes(filePath) {
    const position = this.positions.get(filePath) ?? 0;
    const parser   = this.parsers.get(filePath);
    if (!parser) return;

    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
      const { size } = fs.fstatSync(fd);

      if (size <= position) return; // Nothing new

      const chunkSize = size - position;
      const buf       = Buffer.alloc(chunkSize);
      const bytesRead = fs.readSync(fd, buf, 0, chunkSize, position);

      this.positions.set(filePath, position + bytesRead);

      // Reconstruct lines, preserving any incomplete trailing line
      const raw       = this.lineBuffers.get(filePath) + buf.toString('utf8');
      const lines     = raw.split('\n');
      this.lineBuffers.set(filePath, lines.pop()); // last may be incomplete

      lines.forEach(line => parser.processLine(line));

    } catch (err) {
      console.error(`[Watcher] Read error on ${path.basename(filePath)}: ${err.message}`);
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch (_) {}
      }
    }
  }
}

module.exports = LogWatcher;
