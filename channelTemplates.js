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

  const templates      = extractTemplateNames(xml);
  const gallery        = extractGallery(xml);
  const channelGroups  = extractChannelGroups(xml);
  const directTakeMap  = extractDirectTakeMap(xml);
  const typeChannelMap = extractTypeChannelMap(xml);

  // Merge type-based channels (e.g. PLAYSOUND type=215, ACCESSORIES type=220)
  // into the flat templates map so computeUnused can match them via stripTypePrefix.
  for (const names of typeChannelMap.values()) {
    for (const name of names) {
      if (!templates.has(name.toUpperCase())) templates.set(name.toUpperCase(), name);
    }
  }

  // Merge DirectTake template names so they appear in unused detection.
  for (const name of directTakeMap.values()) {
    if (!templates.has(name.toUpperCase())) templates.set(name.toUpperCase(), name);
  }

  console.log(`[ChannelTemplates] Loaded ${templates.size} templates from: ${resolvedPath}` + (gallery ? ` (gallery: ${gallery})` : '') + (directTakeMap.size > 0 ? ` (${directTakeMap.size} direct takes)` : ''));
  if (channelGroups.size > 0) {
    console.log(`[ChannelTemplates] ${channelGroups.size} channel(s) found`);
  }
  if (templates.size === 0) {
    console.warn('[ChannelTemplates] Warning: no template names found — check XML structure');
  }

  return { templates, gallery, channelGroups, directTakeMap, typeChannelMap };
}

/**
 * Extract channel groups from the XML.
 *
 * The XML structure is:
 *   <channels name="GBN">          ← category / group
 *     <channel name="CAMERA 1" />  ← template
 *     <channel name="CAMERA 2" />
 *   </channels>
 *   <channels name="FREE SPEECH NATION">
 *     ...
 *   </channels>
 *
 * Returns: Map<groupName, string[]> — display names of channels per group.
 * Returns an empty Map if no <channels name="..."> elements are found.
 */
function extractChannelGroups(xml) {
  const groups = new Map();
  const nameAttr = /\bname=["']([^"']+)["']/i;

  // Match each <channels ...> ... </channels> block (the category level)
  const groupPattern = /<channels\b([^>]*)>([\s\S]*?)<\/channels>/gi;
  let gm;
  while ((gm = groupPattern.exec(xml)) !== null) {
    const groupNameMatch = nameAttr.exec(gm[1]);
    if (!groupNameMatch) continue;
    const groupName = groupNameMatch[1].trim();

    // Within the group, collect <channel name="..."> template names
    const templates = [];
    const channelPattern = /<channel\b([^>]*)>/gi;
    let cm;
    while ((cm = channelPattern.exec(gm[2])) !== null) {
      const tNameMatch = nameAttr.exec(cm[1]);
      if (tNameMatch) {
        const name = tNameMatch[1].trim();
        if (name) templates.push(name);
      }
    }

    if (templates.length > 0) groups.set(groupName, templates);
  }

  return groups;
}

/**
 * Build a Map<type_number_string, string[]> from all <channel type="N" name="..."> elements.
 * Used for template types like PLAYSOUND (215) and ACCESSORIES (220) whose channels
 * are identified by numeric type attribute rather than by group membership.
 */
function extractTypeChannelMap(xml) {
  const map       = new Map();
  const nameAttr  = /\bname=["']([^"']+)["']/i;
  const typeAttr  = /\btype=["'](\d+)["']/i;
  const chPattern = /<channel\b([^>]*)>/gi;

  let m;
  while ((m = chPattern.exec(xml)) !== null) {
    const typeMatch = typeAttr.exec(m[1]);
    if (!typeMatch) continue;
    const nameMatch = nameAttr.exec(m[1]);
    if (!nameMatch) continue;
    const typeNum = typeMatch[1];
    const name    = nameMatch[1].trim();
    if (!name) continue;
    if (!map.has(typeNum)) map.set(typeNum, []);
    map.get(typeNum).push(name);
  }

  return map;
}

/**
 * Build a Map<recallnr, name> from the <channels name="DirectTakes"> group.
 * Matches the group name case-insensitively.
 */
function extractDirectTakeMap(xml) {
  const map          = new Map();
  const nameAttr     = /\bname=["']([^"']+)["']/i;
  const recallAttr   = /\brecallnr=["']([^"']+)["']/i;
  const groupPattern = /<channels\b([^>]*)>([\s\S]*?)<\/channels>/gi;

  let gm;
  while ((gm = groupPattern.exec(xml)) !== null) {
    const groupName = nameAttr.exec(gm[1]);
    if (!groupName || groupName[1].trim().toUpperCase() !== 'DIRECTTAKES') continue;

    const channelPattern = /<channel\b([^>]*)>/gi;
    let cm;
    while ((cm = channelPattern.exec(gm[2])) !== null) {
      const recall = recallAttr.exec(cm[1]);
      const tname  = nameAttr.exec(cm[1]);
      if (recall && tname) map.set(recall[1].trim(), tname[1].trim());
    }
    break;
  }

  return map;
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
  const nameAttr = /\bname=["']([^"']+)["']/i;

  // Primary: collect names from <channel> elements within <channels> groups
  // (Mosart ChannelTemplates.xml structure: <channels name="GBN"><channel name="..." /></channels>)
  const groupPattern = /<channels\b[^>]*>([\s\S]*?)<\/channels>/gi;
  let gm;
  while ((gm = groupPattern.exec(xml)) !== null) {
    const channelPattern = /<channel\b([^>]*)>/gi;
    let cm;
    while ((cm = channelPattern.exec(gm[1])) !== null) {
      const nm = nameAttr.exec(cm[1]);
      if (nm) { const n = nm[1].trim(); if (n) map.set(n.toUpperCase(), n); }
    }
  }

  // Fallback: tags whose name contains "template" (handles older XML variants)
  if (map.size === 0) {
    const tagPattern = /<([A-Za-z][A-Za-z0-9_:-]*)[^>]*>/gi;
    let match;
    while ((match = tagPattern.exec(xml)) !== null) {
      if (!/template/i.test(match[1])) continue;
      const nm = nameAttr.exec(match[0]);
      if (nm) { const n = nm[1].trim(); if (n) map.set(n.toUpperCase(), n); }
    }
  }

  return map;
}

/**
 * Strip the Mosart channel-type prefix from a log template display name.
 *
 * Log names are stored as "TYPE + TEMPLATE_NAME" (e.g. "PACKAGE + TOP HEAD towerA").
 * Channel names in ChannelTemplates.xml are just "TOP HEAD towerA".
 * Stripping the prefix lets us match the two correctly.
 *
 * If there is no " + " separator the name is returned unchanged.
 */
function stripTypePrefix(name) {
  const idx = name.indexOf(' + ');
  return idx >= 0 ? name.slice(idx + 3) : name;
}

/**
 * Given:
 *   knownTemplates  — Map<UPPER, displayName> from ChannelTemplates.xml
 *   usedTemplates   — object { displayName: count } from log stats
 *
 * Returns an array of unused template display names, sorted alphabetically.
 */
function computeUnused(knownTemplates, usedTemplates) {
  // Strip type prefix before comparing — log names are "TYPE + TEMPLATE_NAME"
  // but channel names in ChannelTemplates.xml are just "TEMPLATE_NAME".
  const usedUpper = new Set(
    Object.keys(usedTemplates).map(n => stripTypePrefix(n).toUpperCase())
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

/**
 * Like computeUnused, but grouped by channel.
 *
 * Returns an array of { channel, templates } objects, sorted alphabetically
 * by channel name. Templates within each channel are also sorted alphabetically.
 * Unused templates not found in any channel group are collected under "Other".
 */
function computeUnusedByChannel(channelGroups, usedTemplates) {
  const usedUpper = new Set(Object.keys(usedTemplates).map(n => stripTypePrefix(n).toUpperCase()));
  const result = [];

  const sortedChannels = [...channelGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [channelName, templateNames] of sortedChannels) {
    const unused = templateNames
      .filter(n => !usedUpper.has(n.toUpperCase()))
      .sort((a, b) => a.localeCompare(b));
    if (unused.length > 0) result.push({ channel: channelName, templates: unused });
  }

  return result;
}

module.exports = { loadChannelTemplates, computeUnused, computeUnusedByChannel, stripTypePrefix, DEFAULT_PATH };
