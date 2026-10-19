import { calculateProgramTotals } from "./economics.js?v=physical3";
import { $, escapeHtml, formatArea, formatCurrency } from "./utils.js";

export function renderComparison(project) {
  ensureSelections(project);
  const left = resolveSelection(project, "left");
  const right = resolveSelection(project, "right");
  const pair = findClosestImagePair(left.version.references, right.version.references);
  renderSide(project, "left", left, pair.left);
  renderSide(project, "right", right, pair.right);
}

export function updateComparisonSelection(project, side, field, value) {
  project.comparison ||= {};
  project.comparison[side] ||= {};
  const selection = project.comparison[side];

  if (field === "scheme") {
    const scheme = project.schemes.find((item) => item.id === value) || project.schemes[0];
    selection.schemeId = scheme.id;
    selection.versionId = latestVersion(scheme)?.id || null;
  } else {
    selection.versionId = value;
  }
}

function ensureSelections(project) {
  project.comparison ||= {};
  const leftScheme = project.schemes[0];
  const rightScheme = project.schemes[1] || leftScheme;
  const leftVersion = latestVersion(leftScheme);
  const rightVersion = project.schemes[1]
    ? latestVersion(rightScheme)
    : leftScheme.versions.at(-2) || leftVersion;

  project.comparison.left = validSelection(project, project.comparison.left, leftScheme, leftVersion);
  project.comparison.right = validSelection(project, project.comparison.right, rightScheme, rightVersion);
}

function validSelection(project, selection, fallbackScheme, fallbackVersion) {
  const scheme = project.schemes.find((item) => item.id === selection?.schemeId) || fallbackScheme;
  const version = scheme.versions.find((item) => item.id === selection?.versionId)
    || (scheme.id === fallbackScheme.id ? fallbackVersion : latestVersion(scheme));
  return { schemeId: scheme.id, versionId: version.id };
}

function resolveSelection(project, side) {
  const selection = project.comparison[side];
  const scheme = project.schemes.find((item) => item.id === selection.schemeId);
  return { scheme, version: scheme.versions.find((item) => item.id === selection.versionId) };
}

function renderSide(project, side, resolved, matchedImage) {
  const { scheme, version } = resolved;
  const prefix = side === "left" ? "compareLeft" : "compareRight";

  $(`#${prefix}Scheme`).innerHTML = project.schemes.map((item) =>
    `<option value="${item.id}" ${item.id === scheme.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`
  ).join("");
  $(`#${prefix}Version`).innerHTML = [...scheme.versions].reverse().map((item) =>
    `<option value="${item.id}" ${item.id === version.id ? "selected" : ""}>Version ${item.number}</option>`
  ).join("");

  $(`#${prefix}Title`).textContent = `${scheme.name} · v${version.number}`;
  $(`#${prefix}Render`).innerHTML = renderImage(version, scheme, matchedImage);
  $(`#${prefix}Metrics`).innerHTML = renderMetrics(version);
}

function renderImage(version, scheme, image) {
  if (!version.references.length) {
    return `<div class="comparison-empty"><span>▧</span><strong>No render uploaded</strong><small>Add a reference image to ${escapeHtml(scheme.name)} v${version.number}.</small></div>`;
  }

  const selected = image || version.references[0];
  return `
    <img src="${selected.data}" alt="Filename-matched render for ${escapeHtml(scheme.name)} version ${version.number}" />
    <span class="comparison-render-name">${escapeHtml(selected.name)}</span>
  `;
}

export function findClosestImagePair(leftImages, rightImages) {
  if (!leftImages.length || !rightImages.length) {
    return { left: leftImages[0] || null, right: rightImages[0] || null, score: 0 };
  }

  let best = { left: leftImages[0], right: rightImages[0], score: -1 };
  leftImages.forEach((left) => rightImages.forEach((right) => {
    const score = filenameSimilarity(left.name, right.name);
    if (score > best.score) best = { left, right, score };
  }));
  return best;
}

function filenameSimilarity(leftName, rightName) {
  const left = normalizeFilename(leftName);
  const right = normalizeFilename(rightName);
  const longest = Math.max(left.length, right.length, 1);
  const editScore = 1 - levenshteinDistance(left, right) / longest;

  const leftNumbers = numberTokens(leftName);
  const rightNumbers = numberTokens(rightName);
  const numberMatches = leftNumbers.filter((token) => rightNumbers.includes(token)).length;
  const numberScore = numberMatches / Math.max(leftNumbers.length, rightNumbers.length, 1);
  return editScore * 0.8 + numberScore * 0.2;
}

function normalizeFilename(name) {
  const ignored = new Set(["render", "image", "img", "new", "final", "copy"]);
  return String(name)
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !ignored.has(token))
    .join("");
}

function numberTokens(name) {
  return String(name).toLowerCase().replace(/\.[^.]+$/, "").match(/\d+(?:\.\d+)?/g) || [];
}

function levenshteinDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return row[right.length];
}

function renderMetrics(version) {
  const totals = calculateProgramTotals(version);
  const summary = Object.values(totals).reduce((result, item) => ({
    area: result.area + item.area,
    value: result.value + item.value,
    cost: result.cost + item.cost
  }), { area: 0, value: 0, cost: 0 });
  const margin = summary.value - summary.cost;
  const metrics = [
    ["Gross area", summary.area ? formatArea(summary.area) : "—"],
    ["Est. value", summary.value ? formatCurrency(summary.value) : "—"],
    ["Est. cost", summary.cost ? formatCurrency(summary.cost) : "—"],
    ["Value − cost", summary.value ? formatCurrency(margin) : "—"]
  ];
  return metrics.map(([label, value], index) => `
    <div class="comparison-metric ${index === 1 ? "accent" : ""}">
      <span>${label}</span><strong>${value}</strong>
    </div>
  `).join("");
}

function latestVersion(scheme) {
  return [...scheme.versions].sort((a, b) => b.number - a.number)[0];
}
