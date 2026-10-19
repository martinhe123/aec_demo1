import { API_BASE, DEFAULT_ZONES } from "./constants.js";
import { deepCopy } from "./utils.js";

export async function analyzeStack(image, fileName) {
  try {
    const response = await fetch(`${API_BASE}/api/analyze-stack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, fileName })
    });
    if (!response.ok) throw new Error(`Analysis failed (${response.status})`);
    const result = await response.json();
    console.info(`[Forma] Stack interpretation response used by the UI:\n${JSON.stringify(result, null, 2)}`);
    return result;
  } catch (error) {
    console.info("Using local demo interpretation", error);
    const fallback = { zones: deepCopy(DEFAULT_ZONES), mode: "demo" };
    console.info(`[Forma] Stack interpretation response used by the UI:\n${JSON.stringify(fallback, null, 2)}`);
    return fallback;
  }
}

export async function reviseScheme(message, version) {
  const assumptions = Object.fromEntries(Object.entries(version.assumptions || {}).map(([program, values]) => [program, {
    height: Number(values.height) || 11,
    efficiency: Number(values.efficiency ?? 1),
    value: Number(values.value) || 0,
    cost: Number(values.cost) || 0
  }]));
  const response = await fetch(`${API_BASE}/api/revise-scheme`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, zones: version.zones, assumptions })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Revision failed (${response.status})`);
  }
  const result = await response.json();
  console.info(`[Forma] Structured revision response used by the UI:\n${JSON.stringify(result, null, 2)}`);
  return result;
}
