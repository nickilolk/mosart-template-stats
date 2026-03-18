/**
 * parser.js
 * Stateful line-by-line parser for Viz Mosart log files.
 * Watches for ExSwitchBackGrounds and TakeExternals events and extracts template names.
 */

/**
 * Shared cleanup: split a raw "X+Y" string, strip noise, and join as "X + Y".
 */
function joinTemplateParts(raw) {
  const combined = raw
    .split('+')
    .map(t => t.replace(/\s*\(\d+\)\s*/g, '').trim())       // strip slot numbers like (1)
    .map(t => t.replace(/\s+Autotake\s+\d+\s*$/i, '').trim()) // strip trailing "Autotake 187"
    .filter(t => t.length > 0)
    .join(' + ');
  return combined.length > 0 ? combined : null;
}

/**
 * ExSwitchBackGrounds: "...Template=FULL SOUND CLIPS(1)+CHANNEL SEQUENCE "
 */
function parseTemplates(cdataContent) {
  const m = cdataContent.match(/Template=([^\]]+)/);
  if (!m) return [];
  const name = joinTemplateParts(m[1]);
  return name ? [name] : [];
}

/**
 * Extract the Story value from ExSwitchBackGrounds CDATA.
 * Input: "Slug=105.123, Story=TITLES J-DESK , Template=..."
 * Output: "TITLES J-DESK"
 */
function parseStory(cdataContent) {
  const m = cdataContent.match(/Story=([^,\]]+)/);
  return m ? m[1].trim() : null;
}

/**
 * TakeExternals: "External Type ACCESSORIES+COUNTDOWN performed"
 */
function parseTakeExternals(cdataContent) {
  const m = cdataContent.match(/External Type (.+?) performed/i);
  if (!m) return [];
  const name = joinTemplateParts(m[1]);
  return name ? [name] : [];
}

/**
 * ExDirectTake: "Directtake Nr 868 0 - 868 OPEN REPLAY GROUP"
 * Output: "DIRECTTAKE + 868 OPEN REPLAY GROUP"
 */
function parseExDirectTake(cdataContent) {
  const m = cdataContent.match(/Directtake Nr \d+ \d+ - (.+)/i);
  if (!m) return [];
  const name = m[1].trim();
  return name.length > 0 ? [`DIRECTTAKE + ${name}`] : [];
}

/**
 * Stateful parser. Feed it one line at a time.
 * It remembers if the previous line was an ExSwitchBackGrounds event
 * and extracts templates from the following CDATA line.
 */
class LogParser {
  constructor(onTemplate) {
    this.onTemplate = onTemplate; // callback(templateName: string, meta: object)
    this.pendingEvent = null;     // holds attributes from the event line
  }

  processLine(line) {
    const trimmed = line.trim();

    // Detect events we care about
    if (trimmed.includes('method="ExSwitchBackGrounds"')) {
      this.pendingEvent = { ...extractEventAttributes(trimmed), method: 'ExSwitchBackGrounds' };
      return;
    }
    if (trimmed.includes('method="TakeExternals"')) {
      this.pendingEvent = { ...extractEventAttributes(trimmed), method: 'TakeExternals' };
      return;
    }
    if (trimmed.includes('method="ExDirectTake"')) {
      this.pendingEvent = { ...extractEventAttributes(trimmed), method: 'ExDirectTake' };
      return;
    }

    // If we're waiting for a CDATA value line
    if (this.pendingEvent && trimmed.includes('<![CDATA[')) {
      const cdataMatch = trimmed.match(/<!\[CDATA\[(.*?)\]\]>/s);
      if (cdataMatch) {
        const templates =
          this.pendingEvent.method === 'TakeExternals' ? parseTakeExternals(cdataMatch[1]) :
          this.pendingEvent.method === 'ExDirectTake'  ? parseExDirectTake(cdataMatch[1]) :
          parseTemplates(cdataMatch[1]);
        const story = this.pendingEvent.method === 'ExSwitchBackGrounds'
          ? parseStory(cdataMatch[1]) : null;
        const meta = { ...this.pendingEvent, story };
        templates.forEach(name => this.onTemplate(name, meta));
      }
      this.pendingEvent = null;
      return;
    }

    // If a new <event> tag appears before we got a CDATA, discard the pending
    if (this.pendingEvent && trimmed.startsWith('<event ')) {
      this.pendingEvent = null;
    }
  }
}

/**
 * Extract useful attributes from an <event ...> opening tag.
 */
function extractEventAttributes(line) {
  const get = attr => {
    const m = line.match(new RegExp(`${attr}="([^"]+)"`));
    return m ? m[1] : null;
  };
  return {
    time:     get('time'),
    hostname: get('hostname'),
    version:  get('version'),
  };
}

module.exports = { LogParser, parseTemplates, parseTakeExternals, parseExDirectTake };
