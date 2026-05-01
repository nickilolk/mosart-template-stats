/**
 * newsroomSettings.js
 * Loads newsroomsettings.xml and extracts the tag-name → Mosart-type mapping
 * from <mmConstants>/<inewstags>/<tags>/<tag name="..." type="...">.
 *
 * Also provides the hardcoded numeric-type → Mosart-type-name table, and
 * helper functions to normalise template display names coming from log lines.
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_PATH = 'C:\\channeltemplates\\newsroomsettings.xml';

// Mosart numeric channel type → standard type name
const NUMERIC_TYPE_MAP = {
  '0':   'CAMERA',
  '1':   'PACKAGE',
  '2':   'VOICEOVER',
  '3':   'LIVE',
  '4':   'FULLSCREENGRAPHICS',
  '5':   'DVE',
  '6':   'JINGLE',
  '7':   'TELEPHONEINTERVIEW',
  '8':   'FLOATS',
  '9':   'BREAK',
  '215': 'PLAYSOUND',
  '220': 'ACCESSORIES',
};

/**
 * Load newsroomsettings.xml and return a Map<LOCAL_TAG_NAME_UPPER, MOSART_TYPE_UPPER>
 * built from <mmConstants>/<inewstags>/<tags>/<tag name="..." type="...">.
 *
 * Returns null if the file cannot be read (non-fatal — server still runs without it).
 */
function loadNewsroomSettings(filePath) {
  const resolvedPath = path.resolve(filePath || DEFAULT_PATH);

  let xml;
  try {
    xml = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    console.warn(`[NewsroomSettings] Could not read file: ${resolvedPath}`);
    console.warn(`[NewsroomSettings] Reason: ${err.message}`);
    return null;
  }

  const tagMap = extractTagMap(xml);
  console.log(`[NewsroomSettings] Loaded ${tagMap.size} tag mappings from: ${resolvedPath}`);
  return tagMap;
}

/**
 * Parse the <tags> block and return Map<localNameUpper, mosartTypeUpper>.
 */
function extractTagMap(xml) {
  const map = new Map();

  const tagsMatch = xml.match(/<tags\b[^>]*>([\s\S]*?)<\/tags>/i);
  if (!tagsMatch) return map;

  const nameAttr   = /\bname=["']([^"']+)["']/i;
  const typeAttr   = /\btype=["']([^"']+)["']/i;
  const tagPattern = /<tag\b([^>]*)\/?>/gi;

  let m;
  while ((m = tagPattern.exec(tagsMatch[1])) !== null) {
    const nm = nameAttr.exec(m[1]);
    const tm = typeAttr.exec(m[1]);
    if (nm && tm) {
      map.set(nm[1].trim().toUpperCase(), tm[1].trim().toUpperCase());
    }
  }

  return map;
}

/**
 * Resolve a raw channel-type string from a log line to the standard Mosart type name.
 *
 * Resolution order:
 *   1. Numeric string  → NUMERIC_TYPE_MAP  (e.g. "1"       → "PACKAGE")
 *   2. Local tag name  → tagMap            (e.g. "INDSLAG"  → "PACKAGE")
 *   3. Unknown         → uppercased as-is  (e.g. "PACKAGE"  → "PACKAGE")
 *
 * @param {string}   raw     The raw type string from the log (before the " + " separator)
 * @param {Map|null} tagMap  From loadNewsroomSettings(), or null
 * @returns {string}         Standard Mosart type name, always upper-case
 */
function resolveChannelType(raw, tagMap) {
  const upper = raw.trim().toUpperCase();

  if (NUMERIC_TYPE_MAP[upper]) return NUMERIC_TYPE_MAP[upper];
  if (tagMap && tagMap.has(upper)) return tagMap.get(upper);

  return upper;   // already standard, or unknown — normalise case at minimum
}

/**
 * Normalise the type prefix in a template display name.
 *
 *   "INDSLAG + TOP HEAD towerA"  → "PACKAGE + TOP HEAD towerA"
 *   "1 + TOP HEAD towerA"        → "PACKAGE + TOP HEAD towerA"
 *   "PACKAGE + TOP HEAD towerA"  → "PACKAGE + TOP HEAD towerA"
 *   "TOP HEAD towerA" (no sep)   → "TOP HEAD towerA"  (returned unchanged)
 *
 * @param {string}   displayName  Full template name as produced by the parser
 * @param {Map|null} tagMap       From loadNewsroomSettings(), or null
 * @returns {string}
 */
function normalizeTemplateName(displayName, tagMap) {
  const idx = displayName.indexOf(' + ');
  if (idx < 0) return displayName;   // no type prefix — leave unchanged

  const rawType    = displayName.slice(0, idx);
  const tplName    = displayName.slice(idx + 3);
  const resolvedType = resolveChannelType(rawType, tagMap);

  return resolvedType + ' + ' + tplName;
}

module.exports = {
  loadNewsroomSettings,
  resolveChannelType,
  normalizeTemplateName,
  NUMERIC_TYPE_MAP,
  DEFAULT_PATH,
};
