/**
 * channelTemplates.js
 * Loads and parses C:\channeltemplate\channeltemplates.xml (or configured path).
 * Returns a Set of all template names defined in the system.
 *
 * The comparison against log-observed templates is case-insensitive.
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_PATH = 'C:\\channeltemplate\\channeltemplates.xml';

/**
 * Load ChannelTemplates.xml and return a map of:
 *   { normalised_upper_name -> displayName }
 *
 * We store the original display name for rendering, but look up by
 * uppercased key so that comparison with log data is case-insensitive.
 */
function loadChannelTemplates(filePath) {
  const resolvedPath = path.resolve(filePath || DEFAULT_PATH);

  let xml;
  try {
    xml = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    console.warn(`[ChannelTemplates] Could not read file: ${resolvedPath}`);
    console.warn(`[ChannelTemplates] Reason: ${err.message}`);
    return null;  // non-fatal — server still runs without it
  }

  const templates = extractTemplateNames(xml);
  const gallery   = extractGallery(xml);

  console.log(`[ChannelTemplates] Loaded ${templates.size} templates from: ${resolvedPath}` + (gallery ? ` (gallery: ${gallery})` : ''));
  if (templates.size === 0) {
    console.warn('[ChannelTemplates] Warning: no template names found — check XML structure');
  }

  return { templates, gallery };
}

/**
 * Extract all unique template names from the XML.
 *
 * Mosart ChannelTemplates.xml uses elements like:
 *   <ChannelTemplate name="FULL SOUND CLIPS" ... />
 *   <Template name="SOME TEMPLATE" ... />
 *
 * We collect the `name` attribute from any element whose tag contains
 * "template" (case-insensitive) — this handles variations across versions.
 *
 * Returns: Map<upperCaseName, originalName>
 */
function extractTemplateNames(xml) {
  const map = new Map();

  // Match any opening or self-closing tag: <TagName attr="val" ... >
  // We then filter to tags whose name contains "template" (case-insensitive).
  // This handles: <ChannelTemplate ...>, <Template ...>, <mosartTemplate ...>, etc.
  const tagPattern = /<([A-Za-z][A-Za-z0-9_:-]*)[^>]*>/gi;
  const nameAttr   = /\bname=["']([^"']+)["']/i;

  let match;
  while ((match = tagPattern.exec(xml)) !== null) {
    const tagName = match[1];
    if (!/template/i.test(tagName)) continue;   // only template-related elements

    const nameMatch = nameAttr.exec(match[0]);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      if (name) map.set(name.toUpperCase(), name);
    }
  }

  // Safety net: if XML uses a non-"template" element name, collect all name= values
  if (map.size === 0) {
    console.warn('[ChannelTemplates] Tag-based extraction found nothing — trying name= fallback');
    const allNames = /\bname=["']([^"']+)["']/gi;
    let m2;
    while ((m2 = allNames.exec(xml)) !== null) {
      const name = m2[1].trim();
      if (name && name.length > 1) map.set(name.toUpperCase(), name);
    }
  }

  return map;
}

/**
 * Given:
 *   knownTemplates  — Map<UPPER, displayName> from ChannelTemplates.xml
 *   usedTemplates   — object { displayName: count } from log stats
 *
 * Returns an array of unused template display names, sorted alphabetically.
 */
function computeUnused(knownTemplates, usedTemplates) {
  // Build a set of uppercased names that appear in logs
  const usedUpper = new Set(
    Object.keys(usedTemplates).map(n => n.toUpperCase())
  );

  const unused = [];
  for (const [upper, display] of knownTemplates.entries()) {
    if (!usedUpper.has(upper)) {
      unused.push(display);
    }
  }

  return unused.sort((a, b) => a.localeCompare(b));
}

/**
 * Extract the gallery attribute from the root <channeltemplates> tag.
 * Returns the gallery name string, or null if not found.
 */
function extractGallery(xml) {
  const m = xml.match(/<channeltemplates[^>]+\bgallery=["']([^"']+)["']/i);
  return m ? m[1].trim() : null;
}

module.exports = { loadChannelTemplates, computeUnused, DEFAULT_PATH };
