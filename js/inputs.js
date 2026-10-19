import { analyzeStack } from "./api.js?v=logging1";
import { DEFAULT_ZONES } from "./constants.js";
import { saveStlBuffer } from "./state.js?v=hierarchy1";
import { parseStl } from "./stl.js";
import { $, deepCopy, escapeHtml, formatDimension, formatNumber, readAsDataUrl, showToast } from "./utils.js";

export function renderInputs(project) {
  const hasStack = Boolean(project.stackImage);
  $("#stackPreview").classList.toggle("hidden", !hasStack);
  $("#stackPrompt").classList.toggle("hidden", hasStack);
  if (hasStack) $("#stackPreview").src = project.stackImage;
  $("#analyzeButton").disabled = !hasStack;
  $("#analyzeButton").textContent = project.zones.length ? "Reinterpret diagram" : "Interpret diagram";
  setStepStatus("#stackStatus", project.zones.length ? `${project.zones.length} zones` : "Required", Boolean(project.zones.length));
  setStepStatus("#stlStatus", project.stl ? "Ready" : "Required", Boolean(project.stl));
  $("#stlFileName").textContent = project.stl?.fileName || "Upload STL model";
  $("#stlFileMeta").textContent = project.stl
    ? `${formatNumber(project.stl.triangles)} triangles · ${formatDimension(project.stl.width)} × ${formatDimension(project.stl.depth)} × ${formatDimension(project.stl.height)}`
    : "Binary or ASCII STL";
  $("#analysisNote").textContent = project.analysisMode === "openai"
    ? "Interpreted with OpenAI · review conceptual output"
    : project.analysisMode === "demo"
      ? "Demo interpretation used · add a server key for live AI"
      : "OpenAI when configured · demo interpretation otherwise";
  renderReferenceGallery(project);
}

export function renderReferenceGallery(project) {
  const gallery = $("#referenceGallery");
  if (!project.references.length) {
    gallery.innerHTML = "";
    return;
  }
  const activeIndex = Math.min(Math.max(Number(project.activeReference) || 0, 0), project.references.length - 1);
  project.activeReference = activeIndex;
  const activeImage = project.references[activeIndex];
  gallery.innerHTML = `
    <div class="reference-stage">
      <img src="${activeImage.data}" alt="Selected scheme reference" />
      <div class="reference-caption"><span>${escapeHtml(activeImage.name)}</span><span>${activeIndex + 1} / ${project.references.length}</span></div>
    </div>
    <div class="reference-strip" aria-label="Reference image selector">
      ${project.references.map((image, index) => `
        <button class="reference-thumb ${index === activeIndex ? "active" : ""}" data-reference-index="${index}" type="button" aria-label="Show ${escapeHtml(image.name)}">
          <img src="${image.data}" alt="" />
        </button>
      `).join("")}
    </div>`;
}

export async function handleStackFile(project, file) {
  if (!file) return false;
  if (!file.type.startsWith("image/")) {
    showToast("Please choose an image file.");
    return false;
  }
  project.stackImage = await readAsDataUrl(file);
  project.stackFileName = file.name;
  project.zones = [];
  project.analysisMode = null;
  return true;
}

export async function interpretStack(project) {
  if (!project?.stackImage) return false;
  const button = $("#analyzeButton");
  button.disabled = true;
  button.textContent = "Reading diagram…";
  const result = await analyzeStack(project.stackImage, project.stackFileName);
  project.zones = normalizeZones(result.zones);
  project.analysisMode = result.mode || "demo";
  project.messages.push({ role: "assistant", text: `I found ${project.zones.length} vertical zones. The scheme and conceptual economics are now connected to the stack.` });
  showToast(project.analysisMode === "openai" ? "Stack interpreted with OpenAI." : "Demo stack interpretation applied.");
  return true;
}

export async function handleStlFile(project, file) {
  if (!file) return false;
  if (!file.name.toLowerCase().endsWith(".stl")) {
    showToast("Please choose an STL file.");
    return false;
  }
  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseStl(buffer);
    await saveStlBuffer(project.id, buffer);
    project.stl = { fileName: file.name, ...parsed };
    showToast(`Model ready: ${formatNumber(parsed.triangles)} triangles.`);
    return true;
  } catch (error) {
    console.error(error);
    showToast("That STL could not be read.");
    return false;
  }
}

export async function handleReferenceFiles(project, files) {
  const firstNewIndex = project.references.length;
  const selected = [...files].slice(0, Math.max(0, 6 - project.references.length));
  for (const file of selected) {
    if (file.type.startsWith("image/")) project.references.push({ name: file.name, data: await optimizeReferenceImage(file) });
  }
  if (project.references.length > firstNewIndex) project.activeReference = firstNewIndex;
  return project.references.length > firstNewIndex;
}

function normalizeZones(zones) {
  if (!Array.isArray(zones)) return deepCopy(DEFAULT_ZONES);
  return zones.map((zone) => {
    const bottom = Number(zone.bottom);
    const top = Number(zone.top);
    const rawMix = Array.isArray(zone.mix)
      ? Object.fromEntries(zone.mix.map((item) => [String(item.program).toLowerCase(), Number(item.ratio)]))
      : zone.mix;
    const mix = {};
    Object.entries(rawMix || {}).forEach(([program, ratio]) => {
      const cleanProgram = normalizeProgramName(program);
      const cleanRatio = Math.max(0, Number(ratio) || 0);
      if (cleanProgram && cleanRatio) mix[cleanProgram] = cleanRatio;
    });
    const total = Object.values(mix).reduce((sum, value) => sum + value, 0) || 1;
    Object.keys(mix).forEach((program) => { mix[program] /= total; });
    return { name: zone.name || `${bottom}'-${top}'`, bottom, top, mix };
  }).filter((zone) => Number.isFinite(zone.bottom) && Number.isFinite(zone.top) && zone.top > zone.bottom && Object.keys(zone.mix).length).sort((a, b) => a.bottom - b.bottom);
}

function normalizeProgramName(program) {
  const name = String(program).trim().toLowerCase();
  const aliases = { "boh/service": "boh", "back of house": "boh", "back-of-house": "boh", mech: "mechanical", apartment: "apartments", condo: "condos" };
  return aliases[name] || name;
}

async function optimizeReferenceImage(file) {
  const source = await readAsDataUrl(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = source;
  });
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#f4f5f1";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function setStepStatus(selector, text, complete) {
  const element = $(selector);
  element.textContent = text;
  element.classList.toggle("complete", complete);
}
