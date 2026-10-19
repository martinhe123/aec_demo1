export function parseStl(buffer) {
  const view = new DataView(buffer);
  const isBinary = buffer.byteLength >= 84 && 84 + view.getUint32(80, true) * 50 === buffer.byteLength;
  const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  const trianglePoints = [];
  let triangles = 0;
  const include = (x, y, z) => {
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
    bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
  };
  if (isBinary) {
    triangles = view.getUint32(80, true);
    for (let face = 0; face < triangles; face += 1) {
      const offset = 84 + face * 50 + 12;
      const facePoints = [];
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const point = offset + vertex * 12;
        const vertexPoint = { x: view.getFloat32(point, true), y: view.getFloat32(point + 4, true), z: view.getFloat32(point + 8, true) };
        include(vertexPoint.x, vertexPoint.y, vertexPoint.z);
        facePoints.push(vertexPoint);
      }
      trianglePoints.push(facePoints);
    }
  } else {
    const text = new TextDecoder().decode(buffer);
    const matches = [...text.matchAll(/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/gi)];
    const vertices = matches.map((match) => ({ x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) }));
    vertices.forEach((point) => include(point.x, point.y, point.z));
    triangles = Math.floor(matches.length / 3);
    for (let index = 0; index < triangles; index += 1) trianglePoints.push(vertices.slice(index * 3, index * 3 + 3));
  }
  if (!triangles || !Number.isFinite(bounds.minX)) throw new Error("No triangles found");
  const rawWidth = Math.abs(bounds.maxX - bounds.minX);
  const rawDepth = Math.abs(bounds.maxY - bounds.minY);
  const rawHeight = Math.abs(bounds.maxZ - bounds.minZ);
  const unitScale = Math.max(rawWidth, rawDepth, rawHeight) > 2000 ? 1 / 304.8 : 1;
  return {
    triangles,
    width: rawWidth * unitScale,
    depth: rawDepth * unitScale,
    height: rawHeight * unitScale,
    elevationWidth: Math.max(rawWidth, rawDepth) * unitScale,
    footprint: rawWidth * rawDepth * unitScale * unitScale,
    unitScale: 1,
    sourceUnitScale: unitScale,
    profile: buildStlElevationProfile(trianglePoints, bounds, unitScale)
  };
}

function buildStlElevationProfile(triangles, bounds, unitScale) {
  const useY = (bounds.maxY - bounds.minY) > (bounds.maxX - bounds.minX);
  const axis = (point) => useY ? point.y : point.x;
  const axisMin = useY ? bounds.minY : bounds.minX;
  const axisMax = useY ? bounds.maxY : bounds.maxX;
  const height = bounds.maxZ - bounds.minZ;
  const binCount = 80;
  const stride = Math.max(1, Math.ceil(triangles.length / 50000));
  const sample = triangles.filter((_, index) => index % stride === 0);
  const profile = [];
  for (let bin = 0; bin <= binCount; bin += 1) {
    const z = bounds.minZ + height * (bin / binCount);
    let left = Infinity;
    let right = -Infinity;
    sample.forEach((triangle) => {
      for (let edge = 0; edge < 3; edge += 1) {
        const first = triangle[edge];
        const second = triangle[(edge + 1) % 3];
        const low = Math.min(first.z, second.z);
        const high = Math.max(first.z, second.z);
        if (z < low - 1e-6 || z > high + 1e-6) continue;
        if (Math.abs(second.z - first.z) < 1e-8) {
          left = Math.min(left, axis(first), axis(second));
          right = Math.max(right, axis(first), axis(second));
        } else {
          const ratio = (z - first.z) / (second.z - first.z);
          const value = axis(first) + (axis(second) - axis(first)) * ratio;
          left = Math.min(left, value);
          right = Math.max(right, value);
        }
      }
    });
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      left = axisMin;
      right = axisMax;
    }
    profile.push({
      z: Number(((z - bounds.minZ) * unitScale).toFixed(3)),
      left: Number(((left - axisMin) * unitScale).toFixed(3)),
      right: Number(((right - axisMin) * unitScale).toFixed(3))
    });
  }
  return profile;
}
