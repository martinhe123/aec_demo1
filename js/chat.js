import { reviseScheme } from "./api.js?v=revision2";
import { PROGRAMS } from "./constants.js";
import { $, deepCopy, escapeHtml } from "./utils.js";

const OPERATION_FIELDS = {
  set_program_height: "height",
  set_program_efficiency: "efficiency",
  set_program_value: "value",
  set_program_cost: "cost"
};

export function renderMessages(version) {
  $("#chatMessages").innerHTML = version.messages.map((message) => `<div class="message ${message.role}">${escapeHtml(message.text)}</div>`).join("");
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

export async function handleChat(version, message) {
  const text = message.trim();
  if (!text) return { handled: false, changed: false };
  version.messages.push({ role: "user", text });

  try {
    const result = await reviseScheme(text, version);
    if (!result.supported) {
      version.messages.push({ role: "assistant", text: result.reply || "That type of revision is not supported yet." });
      return { handled: true, changed: false };
    }
    if (!applyOperationsAtomically(version, result.operations)) {
      version.messages.push({ role: "assistant", text: "I could not safely apply that revision. The current version is unchanged." });
      return { handled: true, changed: false };
    }
    version.messages.push({ role: "assistant", text: result.reply });
    return { handled: true, changed: true };
  } catch (error) {
    console.error("Forma revision request failed", error);
    version.messages.push({
      role: "assistant",
      text: "The revision service is temporarily unavailable. The current version is unchanged."
    });
    return { handled: true, changed: false };
  }
}

export function applyOperationsAtomically(version, operations) {
  if (!Array.isArray(operations) || !operations.length) return false;
  const zones = deepCopy(version.zones || []);
  const assumptions = deepCopy(version.assumptions || PROGRAMS);
  const highlights = deepCopy(version.revisionHighlights || { parameters: {}, ranges: [] });

  for (const operation of operations) {
    const field = OPERATION_FIELDS[operation.type];
    if (field) {
      if (!Object.hasOwn(PROGRAMS, operation.program) || !Number.isFinite(operation.value)) return false;
      if (field === "height" && operation.value <= 0) return false;
      if (field === "efficiency" && (operation.value < 0 || operation.value > 1)) return false;
      if ((field === "value" || field === "cost") && operation.value < 0) return false;
      assumptions[operation.program] ||= deepCopy(PROGRAMS[operation.program]);
      assumptions[operation.program][field] = operation.value;
      highlights.parameters[operation.program] ||= [];
      if (!highlights.parameters[operation.program].includes(field)) highlights.parameters[operation.program].push(field);
      continue;
    }
    if (operation.type !== "set_program_allocation" || !applyAllocation(zones, operation)) return false;
    if (!highlights.ranges.some((range) => range.bottom === operation.bottom && range.top === operation.top)) {
      highlights.ranges.push({ bottom: operation.bottom, top: operation.top });
    }
  }

  version.zones = zones;
  version.assumptions = assumptions;
  version.revisionHighlights = highlights;
  return true;
}

function applyAllocation(zones, operation) {
  const bottom = Number(operation.bottom);
  const top = Number(operation.top);
  if (!Number.isFinite(bottom) || !Number.isFinite(top) || bottom >= top || !zones.length) return false;
  const buildingBottom = Math.min(...zones.map((zone) => zone.bottom));
  const buildingTop = Math.max(...zones.map((zone) => zone.top));
  if (bottom < buildingBottom || top > buildingTop || !Array.isArray(operation.mix) || !operation.mix.length) return false;

  const mix = {};
  for (const item of operation.mix) {
    if (!Object.hasOwn(PROGRAMS, item.program) || !Number.isFinite(item.ratio) || item.ratio < 0 || item.ratio > 1 || Object.hasOwn(mix, item.program)) return false;
    mix[item.program] = item.ratio;
  }
  if (Math.abs(Object.values(mix).reduce((sum, ratio) => sum + ratio, 0) - 1) > 0.001) return false;

  let changed = false;
  const revised = [];
  zones.forEach((zone) => {
    if (zone.top <= bottom || zone.bottom >= top) {
      revised.push(zone);
      return;
    }
    changed = true;
    if (zone.bottom < bottom) revised.push(makeZone(zone.bottom, bottom, zone.mix));
    revised.push(makeZone(Math.max(zone.bottom, bottom), Math.min(zone.top, top), mix));
    if (zone.top > top) revised.push(makeZone(top, zone.top, zone.mix));
  });
  if (!changed) return false;
  zones.splice(0, zones.length, ...mergeAdjacentZones(revised));
  return true;
}

function makeZone(bottom, top, mix) {
  return { name: `${bottom}'-${top}'`, bottom, top, mix: deepCopy(mix) };
}

function mergeAdjacentZones(zones) {
  return zones.reduce((result, zone) => {
    const previous = result.at(-1);
    if (previous && previous.top === zone.bottom && sameMix(previous.mix, zone.mix)) {
      previous.top = zone.top;
      previous.name = `${previous.bottom}'-${previous.top}'`;
    } else result.push(zone);
    return result;
  }, []);
}

function sameMix(left, right) {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}
