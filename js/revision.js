import { PROGRAMS } from "./constants.js?v=physical1";
import { getFootprintSqFt } from "./economics.js?v=physical3";
import { $, escapeHtml, formatArea, formatCurrency, formatNumber } from "./utils.js";

export function renderRevision(version) {
  renderBasis(version);
  renderProgramParameters(version);
  renderInterpretedRanges(version);
}

function renderBasis(version) {
  const footprint = getFootprintSqFt(version.stl);
  const footprintSource = version.stl ? "STL bounding box" : "23,000 sf fallback";
  const interpretation = version.analysisMode === "openai"
    ? "OpenAI"
    : version.analysisMode === "demo" ? "Demo fallback" : "Not interpreted";

  $("#revisionBasis").innerHTML = `
    <div><span>Footprint input</span><strong>${formatArea(footprint)}</strong><small>${footprintSource}</small></div>
    <div><span>Stack source</span><strong>${interpretation}</strong><small>${version.zones.length} interpreted zones</small></div>
    <div><span>Value basis</span><strong>Efficient area</strong><small>Gross area × program efficiency</small></div>
    <div><span>Cost basis</span><strong>Gross area</strong><small>Before soft costs</small></div>
  `;
}

function renderProgramParameters(version) {
  $("#revisionParameterTable").innerHTML = Object.entries(PROGRAMS).map(([program, defaults]) => {
    const values = version.assumptions?.[program] || defaults;
    const changedFields = version.revisionHighlights?.parameters?.[program] || [];
    const changed = (field) => changedFields.includes(field) ? "revision-change" : "";
    const height = Number(values.height) || 11;
    const efficiency = Math.min(1, Math.max(0, Number(values.efficiency ?? 1)));
    return `
      <tr>
        <td class="${changedFields.length ? "revision-change" : ""}">${escapeHtml(program)}</td>
        <td class="${changed("height")}">${formatNumber(height)} ft</td>
        <td class="${changed("efficiency")}">${Math.round(efficiency * 100)}%</td>
        <td class="${changed("value")}">${formatCurrency(Number(values.value || 0))}</td>
        <td class="${changed("cost")}">${formatCurrency(Number(values.cost || 0))}</td>
      </tr>
    `;
  }).join("");
}

function renderInterpretedRanges(version) {
  $("#revisionZoneSource").textContent = version.analysisMode === "openai"
    ? "OpenAI response from the reference stack image"
    : version.analysisMode === "demo" ? "Demo fallback interpretation" : "Interpret a stack image to populate these ranges";

  const changedRanges = version.revisionHighlights?.ranges || [];
  $("#revisionZoneTable").innerHTML = version.zones.length
    ? version.zones.map((zone) => {
      const changed = changedRanges.some((range) => zone.top > range.bottom && zone.bottom < range.top);
      return `
      <tr class="${changed ? "revision-change-row" : ""}">
        <td>${formatNumber(zone.bottom)} ft</td>
        <td>${formatNumber(zone.top)} ft</td>
        <td>${Object.entries(zone.mix).map(([program, ratio]) => `${escapeHtml(program)} ${Math.round(ratio * 100)}%`).join(" · ")}</td>
      </tr>
    `;
    }).join("")
    : '<tr><td colspan="3">No interpreted program ranges yet.</td></tr>';
}
