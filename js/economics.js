import { PROGRAMS } from "./constants.js?v=physical1";
import { $, deepCopy, escapeHtml, formatArea, formatCurrency, programColor } from "./utils.js";

export function calculateProgramTotals(project) {
  if (!project.zones.length) return {};
  const footprint = getFootprintSqFt(project.stl);
  const totals = {};
  project.zones.forEach((zone) => {
    Object.entries(zone.mix).forEach(([program, ratio]) => {
      const assumptions = project.assumptions?.[program] || PROGRAMS[program] || { value: 450, cost: 300, height: 11, efficiency: 1 };
      const floorHeight = Math.max(1, Number(assumptions.height) || 11);
      const efficiency = Math.min(1, Math.max(0, Number(assumptions.efficiency ?? 1)));
      const floors = Math.max(1, (zone.top - zone.bottom) / floorHeight);
      const grossArea = footprint * floors * ratio;
      const efficientArea = grossArea * efficiency;
      totals[program] ||= { area: 0, efficientArea: 0, value: 0, cost: 0, zoneCount: 0 };
      totals[program].area += grossArea;
      totals[program].efficientArea += efficientArea;
      totals[program].value += efficientArea * Number(assumptions.value || 0);
      totals[program].cost += grossArea * Number(assumptions.cost || 0);
      totals[program].zoneCount += 1;
    });
  });
  return totals;
}

export function renderEconomics(project) {
  const totals = calculateProgramTotals(project);
  const summary = summarizeTotals(totals);
  const baselineTotals = project.revisionBaseline ? calculateProgramTotals(project.revisionBaseline) : null;
  const baselineSummary = baselineTotals ? summarizeTotals(baselineTotals) : null;
  const margin = summary.value - summary.cost;
  const marginPercent = summary.value ? margin / summary.value : 0;

  setMetric("#grossArea", summary.area, baselineSummary?.area);
  setMetric("#estimatedValue", summary.value, baselineSummary?.value);
  setMetric("#estimatedCost", summary.cost, baselineSummary?.cost);
  setMetric("#estimatedMargin", margin, baselineSummary ? baselineSummary.value - baselineSummary.cost : null);
  $("#grossArea").textContent = summary.area ? formatArea(summary.area) : "—";
  $("#estimatedValue").textContent = summary.value ? formatCurrency(summary.value) : "—";
  $("#estimatedCost").textContent = summary.cost ? formatCurrency(summary.cost) : "—";
  $("#estimatedMargin").textContent = summary.value ? formatCurrency(margin) : "—";
  $("#marginPercent").textContent = summary.value ? `${Math.round(marginPercent * 100)}% of value · before soft costs` : "Before soft costs";
  $("#marginPercent").classList.toggle("economics-change", Boolean(baselineSummary) && valuesDiffer(marginPercent, baselineSummary.value ? (baselineSummary.value - baselineSummary.cost) / baselineSummary.value : 0));
  $("#estimatedMargin").style.color = margin < 0 ? "#b34b40" : "";

  const programs = baselineTotals
    ? [...new Set([...Object.keys(totals), ...Object.keys(baselineTotals)])]
    : Object.keys(totals);
  $("#economicsTable").innerHTML = programs.length
    ? programs.sort((a, b) => (totals[b]?.area || 0) - (totals[a]?.area || 0)).map((program) => {
      const data = totals[program] || { area: 0, value: 0, cost: 0 };
      const baseline = baselineTotals?.[program];
      const areaChanged = Boolean(baselineTotals) && valuesDiffer(data.area, baseline?.area || 0);
      const valueChanged = Boolean(baselineTotals) && valuesDiffer(data.value, baseline?.value || 0);
      const costChanged = Boolean(baselineTotals) && valuesDiffer(data.cost, baseline?.cost || 0);
      const programChanged = areaChanged || valueChanged || costChanged;
      return `
      <tr>
        <td class="${programChanged ? "economics-change" : ""}"><span class="table-program" style="--program-color:${programColor(project, program, PROGRAMS)}"><i></i>${escapeHtml(program)}</span></td>
        <td class="${areaChanged ? "economics-change" : ""}">${formatArea(data.area)}</td>
        <td class="${valueChanged ? "economics-change" : ""}">${formatCurrency(data.value)}</td>
        <td class="${costChanged ? "economics-change" : ""}">${formatCurrency(data.cost)}</td>
      </tr>
    `;
    }).join("")
    : '<tr><td colspan="4">Program economics appear after the stack is interpreted.</td></tr>';
}

function summarizeTotals(totals) {
  return Object.values(totals).reduce((result, item) => ({
    area: result.area + item.area,
    value: result.value + item.value,
    cost: result.cost + item.cost
  }), { area: 0, value: 0, cost: 0 });
}

function setMetric(selector, current, baseline) {
  $(selector).classList.toggle("economics-change", baseline !== undefined && baseline !== null && valuesDiffer(current, baseline));
}

function valuesDiffer(current, baseline) {
  const scale = Math.max(1, Math.abs(current), Math.abs(baseline));
  return Math.abs(current - baseline) > scale * 1e-9;
}

export function openAssumptions(project) {
  const activePrograms = [...new Set(project.zones.flatMap((zone) => Object.keys(zone.mix)))];
  const programs = activePrograms.length ? activePrograms : Object.keys(PROGRAMS);
  $("#assumptionsFields").innerHTML = programs.map((program) => {
    const values = project.assumptions?.[program] || PROGRAMS[program] || { value: 450, cost: 300 };
    return `<div class="assumption-row" style="--program-color:${programColor(project, program, PROGRAMS)}">
      <span><i></i>${escapeHtml(program)}</span>
      <div class="assumption-inputs">
        <label>Value / SF<input type="number" min="0" step="5" name="value:${escapeHtml(program)}" value="${values.value}" /></label>
        <label>Cost / SF<input type="number" min="0" step="5" name="cost:${escapeHtml(program)}" value="${values.cost}" /></label>
      </div>
    </div>`;
  }).join("");
  $("#assumptionsDialog").showModal();
}

export function applyAssumptions(project) {
  new FormData($("#assumptionsForm")).forEach((value, key) => {
    const [field, program] = key.split(":");
    project.assumptions[program] ||= deepCopy(PROGRAMS[program] || { color: "#cbd2cc", value: 450, cost: 300 });
    project.assumptions[program][field] = Number(value);
  });
}

export function getFootprintSqFt(stl) {
  if (!stl) return 23000;
  let width = stl.width;
  let depth = stl.depth;
  if (Math.max(width, depth) > 1000) {
    width /= 304.8;
    depth /= 304.8;
  }
  const footprint = Math.abs(width * depth);
  return Math.min(80000, Math.max(7000, footprint || 23000));
}
