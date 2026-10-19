export const API_BASE = String(window.FORMA_API_BASE || "").replace(/\/$/, "");

export const PROGRAMS = {
  retail: { color: "#f39c8e", value: 680, cost: 390, height: 20, efficiency: 0.90 },
  boh: { color: "#8c9690", value: 90, cost: 210, height: 20, efficiency: 0.90 },
  parking: { color: "#b9bcc1", value: 175, cost: 145, height: 10, efficiency: 0.90 },
  townhome: { color: "#efb36f", value: 710, cost: 340, height: 20, efficiency: 0.80 },
  "undefined residential": { color: "#e9df80", value: 590, cost: 330, height: 10, efficiency: 0.80 },
  apartments: { color: "#e4df8b", value: 575, cost: 320, height: 10, efficiency: 0.70 },
  condos: { color: "#d9ed72", value: 760, cost: 365, height: 11, efficiency: 0.70 },
  amenity: { color: "#f3d7b8", value: 110, cost: 410, height: 15, efficiency: 0.70 },
  mechanical: { color: "#737a78", value: 0, cost: 230, height: 15, efficiency: 0.00 },
  office: { color: "#90b7c5", value: 520, cost: 315 },
  hotel: { color: "#b9a2cf", value: 610, cost: 350 }
};

export const DEFAULT_ZONES = [
  { name: "0'-20'", bottom: 0, top: 20, mix: { retail: 0.63, boh: 0.37 } },
  { name: "20'-40'", bottom: 20, top: 40, mix: { retail: 0.43, parking: 0.57 } },
  { name: "40'-120'", bottom: 40, top: 120, mix: { parking: 0.77, townhome: 0.13, "undefined residential": 0.1 } },
  { name: "120'-135'", bottom: 120, top: 135, mix: { amenity: 1 } },
  { name: "135'-335'", bottom: 135, top: 335, mix: { apartments: 1 } },
  { name: "335'-350'", bottom: 335, top: 350, mix: { amenity: 1 } },
  { name: "350'-559'", bottom: 350, top: 559, mix: { condos: 1 } },
  { name: "559'-574'", bottom: 559, top: 574, mix: { amenity: 1 } },
  { name: "574'-589'", bottom: 574, top: 589, mix: { mechanical: 1 } }
];
