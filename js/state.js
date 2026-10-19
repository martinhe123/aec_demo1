import { $ } from "./utils.js";

const stlBufferCache = new Map();

// The prototype is session-only. Remove data written by earlier persistent versions.
localStorage.removeItem("forma-aec-prototype-v1");
indexedDB.deleteDatabase("forma-aec-models-v1");

export const store = { projects: [], activeId: null };

export function activeProject() {
  return store.projects.find((project) => project.id === store.activeId) || null;
}

export function activeScheme() {
  const project = activeProject();
  return project?.schemes.find((scheme) => scheme.id === project.activeSchemeId) || null;
}

export function activeVersion() {
  const scheme = activeScheme();
  return scheme?.versions.find((version) => version.id === scheme.activeVersionId) || null;
}

export function saveStore() {
  $("#savedState").textContent = "Session only";
}

export async function saveStlBuffer(projectId, buffer) {
  stlBufferCache.set(projectId, buffer);
}

export async function getStlBuffer(projectId) {
  return stlBufferCache.get(projectId) || null;
}
