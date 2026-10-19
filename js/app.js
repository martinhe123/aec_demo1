import { handleChat, renderMessages } from "./chat.js?v=revision2";
import { renderComparison, updateComparisonSelection } from "./comparison.js?v=economics3";
import { PROGRAMS } from "./constants.js?v=physical1";
import { applyAssumptions, openAssumptions, renderEconomics } from "./economics.js?v=physical3";
import {
  handleReferenceFiles,
  handleStackFile,
  handleStlFile,
  interpretStack,
  renderInputs,
  renderReferenceGallery
} from "./inputs.js?v=logging1";
import { renderRevision } from "./revision.js?v=economics3";
import { invalidateThreeViewer, renderScheme } from "./scheme.js?v=economics3";
import {
  activeProject,
  activeScheme,
  activeVersion,
  getStlBuffer,
  saveStlBuffer,
  saveStore,
  store
} from "./state.js?v=hierarchy1";
import { $, $$, deepCopy, escapeHtml, showToast } from "./utils.js";

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function createVersion(number = 1, source = null) {
  if (source) return { ...deepCopy(source), id: makeId(), number, createdAt: new Date().toISOString() };
  return {
    id: makeId(),
    number,
    createdAt: new Date().toISOString(),
    stackImage: null,
    stackFileName: null,
    zones: [],
    analysisMode: null,
    stl: null,
    references: [],
    assumptions: deepCopy(PROGRAMS),
    messages: [
      { role: "assistant", text: "Once the stack is interpreted, ask me to change a program within an elevation range." }
    ]
  };
}

function createScheme(name) {
  const firstVersion = createVersion();
  return {
    id: makeId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    versions: [firstVersion],
    activeVersionId: firstVersion.id
  };
}

function createProject(name) {
  const firstScheme = createScheme("Scheme 1");
  const project = {
    id: makeId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    schemes: [firstScheme],
    activeSchemeId: firstScheme.id
  };
  store.projects.unshift(project);
  store.activeId = project.id;
  window.location.hash = "inputs";
  commit();
}

async function cloneStlBuffer(sourceVersion, targetVersion) {
  if (!sourceVersion?.stl) return;
  const buffer = await getStlBuffer(sourceVersion.id);
  if (buffer) await saveStlBuffer(targetVersion.id, buffer);
}

function commit() {
  saveStore();
  render();
}

function render() {
  renderProjectList();
  const project = activeProject();
  const scheme = activeScheme();
  const version = activeVersion();
  const hasWorkspace = Boolean(project && scheme && version);
  $("#welcomeView").classList.toggle("hidden", hasWorkspace);
  $("#workspaceView").classList.toggle("hidden", !hasWorkspace);
  if (!hasWorkspace) return;

  $("#breadcrumbName").textContent = project.name;
  $("#breadcrumbScheme").textContent = scheme.name;
  $("#projectTitle").textContent = project.name;
  $("#versionPill").textContent = `v${version.number}${version.revisionBaseline ? " · Draft" : ""}`;
  renderSchemeControls(project, scheme, version);
  renderInputs(version);
  renderScheme(version);
  renderEconomics(version);
  renderMessages(version);
  renderRevision(version);
  renderComparison(project);
  showPhase(phaseTargetFromHash(), false);
}

function renderProjectList() {
  $("#projectList").innerHTML = store.projects.map((project) => {
    const selectedScheme = project.schemes.find((scheme) => scheme.id === project.activeSchemeId) || project.schemes[0];
    const version = selectedScheme?.versions.find((item) => item.id === selectedScheme.activeVersionId) || selectedScheme?.versions.at(-1);
    const summary = selectedScheme ? `${selectedScheme.name} · v${version?.number || 1}` : "No schemes";
    return `
      <button class="project-item ${project.id === store.activeId ? "active" : ""}" data-project-id="${project.id}" type="button">
        <span>${escapeHtml(project.name.slice(0, 2).toUpperCase())}</span>
        <span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(summary)}</small></span>
      </button>
    `;
  }).join("");
}

function renderSchemeControls(project, scheme, version) {
  $("#schemeSelect").innerHTML = project.schemes.map((item) =>
    `<option value="${item.id}" ${item.id === scheme.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`
  ).join("");
  $("#versionSelect").innerHTML = [...scheme.versions].reverse().map((item) =>
    `<option value="${item.id}" ${item.id === version.id ? "selected" : ""}>Version ${item.number}${item.revisionBaseline ? " (draft)" : ""}</option>`
  ).join("");
}

function phaseTargetFromHash() {
  const phase = window.location.hash.replace(/^#/, "");
  const targets = { inputs: "inputsSection", scheme: "schemeSection", economics: "economicsSection", revision: "versionRevisionSection", comparison: "comparisonSection" };
  return targets[phase] || "inputsSection";
}

function showPhase(targetId, updateHistory = true) {
  const validTargets = ["inputsSection", "schemeSection", "economicsSection", "versionRevisionSection", "comparisonSection"];
  const resolvedTarget = validTargets.includes(targetId) ? targetId : "inputsSection";
  $$(".phase-page").forEach((section) => section.classList.toggle("active-page", section.id === resolvedTarget));
  $$(".phase-tab").forEach((button) => button.classList.toggle("active", button.dataset.target === resolvedTarget));
  if (updateHistory) {
    const routes = { inputsSection: "inputs", schemeSection: "scheme", economicsSection: "economics", versionRevisionSection: "revision", comparisonSection: "comparison" };
    const route = routes[resolvedTarget];
    if (window.location.hash !== `#${route}`) window.location.hash = route;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openProjectDialog() {
  $("#projectNameInput").value = "";
  $("#projectDialog").showModal();
  setTimeout(() => $("#projectNameInput").focus(), 40);
}

function openSchemeDialog() {
  const project = activeProject();
  $("#schemeNameInput").value = `Scheme ${project.schemes.length + 1}`;
  $("#schemeDialog").showModal();
  setTimeout(() => $("#schemeNameInput").select(), 40);
}

async function saveNewVersion() {
  const scheme = activeScheme();
  const current = activeVersion();
  if (!scheme || !current) return null;
  const nextNumber = Math.max(...scheme.versions.map((version) => version.number)) + 1;
  const draft = deepCopy(current);
  const baseline = draft.revisionBaseline ? deepCopy(draft.revisionBaseline) : null;
  delete draft.revisionBaseline;
  delete draft.revisionHighlights;
  const next = createVersion(nextNumber, draft);
  if (baseline) {
    const currentIndex = scheme.versions.findIndex((version) => version.id === current.id);
    if (currentIndex >= 0) scheme.versions[currentIndex] = baseline;
  }
  scheme.versions.push(next);
  scheme.activeVersionId = next.id;
  await cloneStlBuffer(current, next);
  return next;
}

$("#newProjectButton").addEventListener("click", openProjectDialog);
$("#welcomeCreateButton").addEventListener("click", openProjectDialog);
$("#cancelProjectButton").addEventListener("click", () => $("#projectDialog").close());
$("#projectForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#projectNameInput").value.trim();
  if (!name) return;
  createProject(name);
  $("#projectDialog").close();
});

$("#newSchemeButton").addEventListener("click", openSchemeDialog);
$("#cancelSchemeButton").addEventListener("click", () => $("#schemeDialog").close());
$("#schemeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const project = activeProject();
  const name = $("#schemeNameInput").value.trim();
  if (!project || !name) return;
  const scheme = createScheme(name);
  project.schemes.push(scheme);
  project.activeSchemeId = scheme.id;
  invalidateThreeViewer();
  $("#schemeDialog").close();
  window.location.hash = "inputs";
  commit();
  showToast(`${scheme.name} created.`);
});

$("#projectList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-id]");
  if (!button) return;
  store.activeId = button.dataset.projectId;
  invalidateThreeViewer();
  window.location.hash = "inputs";
  commit();
});

$("#schemeSelect").addEventListener("change", (event) => {
  activeProject().activeSchemeId = event.target.value;
  invalidateThreeViewer();
  commit();
});

$("#versionSelect").addEventListener("change", (event) => {
  activeScheme().activeVersionId = event.target.value;
  invalidateThreeViewer();
  commit();
});

$("#stackInput").addEventListener("change", async (event) => {
  if (await handleStackFile(activeVersion(), event.target.files[0])) commit();
});

$("#stlInput").addEventListener("change", async (event) => {
  if (await handleStlFile(activeVersion(), event.target.files[0])) {
    invalidateThreeViewer();
    commit();
  }
});

$("#referenceInput").addEventListener("change", async (event) => {
  if (await handleReferenceFiles(activeVersion(), event.target.files)) commit();
});

$("#referenceGallery").addEventListener("click", (event) => {
  const button = event.target.closest("[data-reference-index]");
  if (!button) return;
  const version = activeVersion();
  version.activeReference = Number(button.dataset.referenceIndex);
  saveStore();
  renderReferenceGallery(version);
});

$("#analyzeButton").addEventListener("click", async () => {
  const version = activeVersion();
  if (await interpretStack(version)) commit();
});

$("#saveVersionButton").addEventListener("click", async () => {
  const next = await saveNewVersion();
  if (!next) return;
  next.messages.push({ role: "assistant", text: `Saved the current scheme as version ${next.number}.` });
  commit();
  showToast(`Scheme v${next.number} saved.`);
});

$("#editAssumptionsButton").addEventListener("click", () => openAssumptions(activeVersion()));
$("#cancelAssumptionsButton").addEventListener("click", () => $("#assumptionsDialog").close());
$("#assumptionsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  applyAssumptions(activeVersion());
  $("#assumptionsDialog").close();
  commit();
  showToast("Concept assumptions updated.");
});

$("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#chatInput");
  const current = activeVersion();
  if (!current || !input.value.trim()) return;
  const candidate = createVersion(current.number, current);
  const submitButton = event.currentTarget.querySelector("button[type='submit']");
  input.disabled = true;
  submitButton.disabled = true;
  const result = await handleChat(candidate, input.value);
  input.value = "";
  input.disabled = false;
  submitButton.disabled = false;
  input.focus();
  if (!result.handled) return;

  if (result.changed) {
    const scheme = activeScheme();
    if (!current.revisionBaseline) candidate.revisionBaseline = deepCopy(current);
    candidate.id = current.id;
    candidate.number = current.number;
    candidate.createdAt = current.createdAt;
    const currentIndex = scheme.versions.findIndex((version) => version.id === current.id);
    scheme.versions[currentIndex] = candidate;
    scheme.activeVersionId = candidate.id;
    showToast("Draft updated. Save when ready.");
  } else {
    current.messages = candidate.messages;
  }
  commit();
});

$("#comparisonSection").addEventListener("change", (event) => {
  const select = event.target.closest("[data-compare-side]");
  if (!select) return;
  updateComparisonSelection(activeProject(), select.dataset.compareSide, select.dataset.compareField, select.value);
  commit();
});

$$(".segmented-control button").forEach((button) => button.addEventListener("click", () => {
  $$(".segmented-control button").forEach((item) => item.classList.toggle("active", item === button));
  $("#massingView").classList.toggle("hidden", button.dataset.view !== "massing");
  $("#stackView").classList.toggle("hidden", button.dataset.view !== "stack");
}));

$$(".phase-tab").forEach((button) => button.addEventListener("click", () => showPhase(button.dataset.target)));
window.addEventListener("hashchange", () => showPhase(phaseTargetFromHash(), false));

const stackDropzone = $("#stackDropzone");
["dragenter", "dragover"].forEach((name) => stackDropzone.addEventListener(name, (event) => {
  event.preventDefault();
  stackDropzone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => stackDropzone.addEventListener(name, (event) => {
  event.preventDefault();
  stackDropzone.classList.remove("dragging");
}));
stackDropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer.files[0];
  if (file && await handleStackFile(activeVersion(), file)) commit();
});

render();
