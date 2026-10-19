import { PROGRAMS } from "./constants.js?v=physical1";
import { calculateProgramTotals } from "./economics.js?v=physical3";
import { activeVersion, getStlBuffer } from "./state.js?v=hierarchy1";
import { $, escapeHtml, formatArea, formatNumber, programColor } from "./utils.js";

let threeViewerInstance = null;
let loadedThreeKey = null;
let threeLoadToken = 0;

export function invalidateThreeViewer() {
  loadedThreeKey = null;
}

export function renderScheme(project) {
  const zones = project.zones;
  const totalHeight = zones.length ? Math.max(...zones.map((zone) => zone.top)) : 0;
  $("#buildingHeight").textContent = totalHeight ? `${formatNumber(totalHeight)}' total height · orthographic scale` : "Awaiting stack";
  $("#zoneCount").textContent = `${zones.length} zone${zones.length === 1 ? "" : "s"}`;
  renderMassing(project, totalHeight);
  renderStack(project, zones, totalHeight);
  renderLegend(zones);

  const totals = calculateProgramTotals(project);
  $("#programSchedule").innerHTML = Object.entries(totals).length
    ? Object.entries(totals).sort((a, b) => b[1].area - a[1].area).map(([program, data]) => `
      <div class="program-row">
        <i style="--program-color:${programColor(project, program, PROGRAMS)}"></i>
        <div><strong>${escapeHtml(program)}</strong><small>${data.zoneCount} zone${data.zoneCount === 1 ? "" : "s"}</small></div>
        <span>${formatArea(data.area)}</span>
      </div>
    `).join("")
    : '<div class="empty-schedule">Interpret a stack diagram to build the program schedule.</div>';
}

function renderMassing(project, totalHeight) {
  const model = $("#massingModel");
  const viewer = $("#threeViewer");
  if (!project.stl || !project.zones.length) {
    viewer.classList.add("hidden");
    model.classList.remove("hidden");
    model.className = "massing-model empty-model";
    model.innerHTML = '<div class="empty-model-copy"><b>3D</b><span>Upload an STL and interpret the stack to shape the scheme</span></div>';
    return;
  }
  model.classList.remove("hidden");
  model.className = "massing-model scaled-model";
  model.innerHTML = buildScaledElevation(project, project.zones, totalHeight, true);
  activateThreeViewer(project);
}

async function activateThreeViewer(project) {
  const token = ++threeLoadToken;
  const viewerElement = $("#threeViewer");
  const fallbackElement = $("#massingModel");
  if (!window.Forma3D) {
    window.addEventListener("forma3dready", () => {
      if (activeVersion()?.id === project.id) activateThreeViewer(activeVersion());
    }, { once: true });
    return;
  }
  try {
    const buffer = await getStlBuffer(project.id);
    if (token !== threeLoadToken || activeVersion()?.id !== project.id) return;
    if (!buffer) return;
    if (!threeViewerInstance) threeViewerInstance = window.Forma3D.mount(viewerElement);
    const colors = Object.fromEntries(Object.entries(project.assumptions || PROGRAMS).map(([program, data]) => [program, data.color || PROGRAMS[program]?.color]));
    const modelKey = `${project.id}:${project.stl.fileName}:${project.stl.triangles}:${buffer.byteLength}`;
    if (loadedThreeKey === modelKey) threeViewerInstance.updateZones(project.zones, colors);
    else {
      threeViewerInstance.load(buffer, project.zones, colors, project.stl.sourceUnitScale || 1);
      loadedThreeKey = modelKey;
    }
    viewerElement.classList.remove("hidden");
    fallbackElement.classList.add("hidden");
  } catch (error) {
    console.warn("Interactive 3D viewer unavailable; retaining the scaled elevation.", error);
    viewerElement.classList.add("hidden");
    fallbackElement.classList.remove("hidden");
  }
}

function renderStack(project, zones, totalHeight) {
  $("#stackGraphic").innerHTML = zones.length
    ? buildScaledElevation(project, zones, totalHeight, false)
    : '<div class="empty-schedule">Interpret a stack diagram to reconstruct it here.</div>';
}

function buildScaledElevation(project, zones, stackHeight, showFloors) {
  const dimensions = getModelDimensionsFt(project.stl);
  const physicalWidth = Math.max(20, dimensions.width || 160);
  const physicalHeight = Math.max(stackHeight, dimensions.height || stackHeight);
  const margin = Math.max(32, physicalWidth * 0.28);
  const viewMinX = -margin * 0.2;
  const viewWidth = physicalWidth + margin;
  const profile = getScaledProfile(project.stl, physicalWidth, dimensions.height || stackHeight);
  const left = profile.map((point) => `${point.left},${physicalHeight - point.z}`);
  const right = [...profile].reverse().map((point) => `${point.right},${physicalHeight - point.z}`);
  const silhouette = [...left, ...right].join(" ");
  const clipId = `elevation-${showFloors ? "massing" : "stack"}`;
  const gridStep = physicalHeight > 350 ? 50 : 25;
  const gridLines = [];
  for (let elevation = 0; elevation <= physicalHeight; elevation += gridStep) {
    const y = physicalHeight - elevation;
    gridLines.push(`<line x1="${viewMinX}" y1="${y}" x2="${physicalWidth + margin * 0.45}" y2="${y}" class="scale-grid-line" />`);
    if (elevation > 0) gridLines.push(`<text x="${viewMinX + 2}" y="${y - 2}" class="scale-grid-label">${elevation}'</text>`);
  }

  const zoneShapes = zones.map((zone) => {
    let cursor = 0;
    return Object.entries(zone.mix).map(([program, ratio]) => {
      const x = cursor * physicalWidth;
      const width = ratio * physicalWidth;
      cursor += ratio;
      const zoneHeight = zone.top - zone.bottom;
      const label = ratio >= 0.24 && zoneHeight >= 12
        ? `<text x="${x + width / 2}" y="${physicalHeight - zone.bottom - zoneHeight / 2}" class="scaled-zone-label">${escapeHtml(program)}</text>`
        : "";
      return `<g><rect x="${x}" y="${physicalHeight - zone.top}" width="${width}" height="${zoneHeight}" fill="${programColor(project, program, PROGRAMS)}" />${label}</g>`;
    }).join("");
  }).join("");

  const floorLines = [];
  if (showFloors) {
    for (let elevation = 11; elevation < Math.min(physicalHeight, stackHeight); elevation += 11) {
      floorLines.push(`<line x1="0" y1="${physicalHeight - elevation}" x2="${physicalWidth}" y2="${physicalHeight - elevation}" class="floor-line" />`);
    }
  }
  const dimensionX = physicalWidth + Math.max(8, margin * 0.12);
  const scaleLength = physicalWidth >= 50 ? 50 : 20;
  const scaleY = physicalHeight - 5;
  return `
    <svg class="scaled-elevation" viewBox="${viewMinX} 0 ${viewWidth} ${physicalHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="To-scale orthographic building elevation">
      <defs>
        <clipPath id="${clipId}"><polygon points="${silhouette}" /></clipPath>
        <filter id="elevation-shadow" x="-25%" y="-10%" width="160%" height="130%"><feDropShadow dx="4" dy="5" stdDeviation="4" flood-opacity=".14" /></filter>
      </defs>
      <g>${gridLines.join("")}</g>
      <g clip-path="url(#${clipId})" ${showFloors ? 'filter="url(#elevation-shadow)"' : ""}>
        ${zoneShapes}
        ${floorLines.join("")}
      </g>
      <polygon points="${silhouette}" class="scaled-outline" />
      <line x1="${dimensionX}" y1="${physicalHeight - stackHeight}" x2="${dimensionX}" y2="${physicalHeight}" class="dimension-line" />
      <line x1="${dimensionX - 4}" y1="${physicalHeight - stackHeight}" x2="${dimensionX + 4}" y2="${physicalHeight - stackHeight}" class="dimension-line" />
      <line x1="${dimensionX - 4}" y1="${physicalHeight}" x2="${dimensionX + 4}" y2="${physicalHeight}" class="dimension-line" />
      <text x="${dimensionX + 4}" y="${physicalHeight - stackHeight / 2}" class="dimension-label">${formatNumber(stackHeight)}'</text>
      <line x1="0" y1="${scaleY}" x2="${scaleLength}" y2="${scaleY}" class="scale-bar" />
      <text x="${scaleLength / 2}" y="${scaleY - 3}" class="scale-bar-label">${scaleLength}'</text>
    </svg>`;
}

function getModelDimensionsFt(stl) {
  if (!stl) return { width: 160, depth: 160, height: 0 };
  const maxDimension = Math.max(stl.width || 0, stl.depth || 0, stl.height || 0);
  const scale = stl.unitScale || (maxDimension > 2000 ? 1 / 304.8 : 1);
  return { width: (stl.elevationWidth || stl.width) * scale, depth: stl.depth * scale, height: stl.height * scale };
}

function getScaledProfile(stl, width, height) {
  if (stl?.profile?.length) return stl.profile;
  return [{ z: 0, left: 0, right: width }, { z: height, left: 0, right: width }];
}

function renderLegend(zones) {
  const programs = [...new Set(zones.flatMap((zone) => Object.keys(zone.mix)))];
  $("#programLegend").innerHTML = programs.map((program) => `
    <span class="legend-item" style="--legend-color:${PROGRAMS[program]?.color || "#cbd2cc"}"><i></i>${escapeHtml(program)}</span>
  `).join("");
}
