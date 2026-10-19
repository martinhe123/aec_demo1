export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export const deepCopy = (value) => JSON.parse(JSON.stringify(value));

let toastTimer;

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function formatArea(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M sf`;
  if (value >= 1000) return `${Math.round(value / 1000)}K sf`;
  return `${Math.round(value)} sf`;
}

export function formatCurrency(value) {
  const sign = value < 0 ? "−" : "";
  const amount = Math.abs(value);
  if (amount >= 1_000_000_000) return `${sign}$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${sign}$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1000) return `${sign}$${Math.round(amount / 1000)}K`;
  return `${sign}$${Math.round(amount)}`;
}

export function formatDimension(value) {
  if (value > 1000) return `${formatNumber(value / 304.8)} ft`;
  return formatNumber(value);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2500);
}

export function programColor(project, program, programs) {
  return project.assumptions?.[program]?.color || programs[program]?.color || "#cbd2cc";
}
