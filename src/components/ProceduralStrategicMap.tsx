import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BlockoutStructure,
  BlockoutUnit,
  getStructureVisionRadius,
  getUnitVisionRadius,
  MarchWaypoint,
  PlayerState,
} from '../shared/protocol';
import {
  ARID_POCKETS,
  BIOME_SPECS,
  BRIDGE_CROSSINGS,
  CLIMATE_SPECS,
  ClimateKind,
  CONTINENT_LOBES,
  formatWorldCoordKm,
  getBiomeAt,
  getEffectiveClimateAt,
  getMoistureAt,
  getSnowlineElevationAt,
  getTemperatureCAt,
  getTerrainHeight,
  MACRO_LANDMARKS,
  MacroLandmark,
  MOUNTAIN_SPINES,
  RIVER_SEGMENTS,
  SPAWN_PLATEAUS,
  STRATEGIC_ROADS,
  WATER_LEVEL_Y,
  WATERFALL_SITES,
  WORLD_HALF_SIZE,
  WORLD_MAP_SIZE,
} from '../shared/worldMap';

export interface StrategicMapFlyToCommand {
  x: number;
  z: number;
  spanM?: number;
  nonce: number;
}

export interface ProceduralStrategicMapProps {
  structures: Record<string, BlockoutStructure>;
  units: Record<string, BlockoutUnit>;
  players: PlayerState[];
  myPlayerId: string | null;
  activeClimate: ClimateKind;
  viewCenter: { x: number; z: number };
  viewSpanM: number;
  onChangeView: (nextCenter: { x: number; z: number }, nextSpanM: number) => void;
  mode: 'jump' | 'march';
  waypoints: MarchWaypoint[];
  leadDispatchUnit?: BlockoutUnit | null;
  onClickWorld?: (worldX: number, worldZ: number) => void;
  onDoubleClickWorld?: (worldX: number, worldZ: number) => void;
  onRightClickWorld?: (worldX: number, worldZ: number) => void;
  onHoverWorldChange?: (pt: { x: number; z: number } | null) => void;
  onZoomBelowThreshold?: (worldX: number, worldZ: number) => void;
  zoomInto3DThresholdM?: number;
  minSpanM?: number;
  maxSpanM?: number;
  isActive?: boolean;
  flyToCommand?: StrategicMapFlyToCommand | null;
  enableKeyboardNav?: boolean;
  onRequestClose?: () => void;
  showInternalTelemetry?: boolean;
  className?: string;
}

// ============================================================================
// REGIONAL CARTOGRAPHIC WATER & TERRITORY LABELS (THAR AHMAD THEATER)
// ============================================================================
const REGION_WATERMARKS: Array<{
  labelAr: string;
  x: number;
  z: number;
  kind: 'sea' | 'desert' | 'region' | 'mountain';
  minSpan: number;
  maxSpan: number;
}> = [
  { labelAr: 'البحر المتوسط', x: -39500, z: 3500, kind: 'sea', minSpan: 18_000, maxSpan: 140_000 },
  { labelAr: 'الخليج العربي', x: 38200, z: 32500, kind: 'sea', minSpan: 18_000, maxSpan: 140_000 },
  { labelAr: 'بادية الشام', x: -2200, z: 12200, kind: 'desert', minSpan: 20_000, maxSpan: 140_000 },
  { labelAr: 'بلاد الرافدين', x: 18800, z: -8500, kind: 'region', minSpan: 22_000, maxSpan: 140_000 },
  { labelAr: 'الجزيرة الفراتية', x: 1500, z: -20500, kind: 'region', minSpan: 22_000, maxSpan: 110_000 },
  { labelAr: 'بلاد الشام', x: -20500, z: -10500, kind: 'region', minSpan: 22_000, maxSpan: 120_000 },
  { labelAr: 'صحراء النفود وتخوم الحجاز', x: -4500, z: 31500, kind: 'desert', minSpan: 22_000, maxSpan: 140_000 },
  { labelAr: 'جبال طوروس', x: -5500, z: -35500, kind: 'mountain', minSpan: 20_000, maxSpan: 130_000 },
  { labelAr: 'جبال زاغروس', x: 32800, z: -13500, kind: 'mountain', minSpan: 20_000, maxSpan: 130_000 },
];

// ============================================================================
// SHADERS:
// 1) TERRAIN_BAKE_FRAG_SRC: Bakes physical relief + cartographic colors ONCE
//    into a 2048x2048 World Atlas FBO & on-idle 1024x1024 Local Detail FBO.
// 2) COMPOSITE_FRAG_SRC: Ultra-fast <0.2ms per-frame display shader with
//    blended local detail, illuminated antique parchment fog-of-war, live
//    vision glow, and subtle regional weather tinting -> locked 60-120 FPS!
// ============================================================================

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
out vec2 vNdc;
void main() {
  vNdc = aPos;
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const TERRAIN_BAKE_FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uBakeCenter;
uniform vec2 uBakeSpanXZ;
uniform float uBakeMetersPerPx;
uniform float uWorldHalfSize;

uniform int uLobeCount;
uniform vec4 uLobePosRot[21];
uniform vec2 uLobeRadii[21];
uniform int uSpineCount;
uniform vec4 uMountainSpines[8];
uniform int uAridCount;
uniform vec4 uAridPockets[6];

uniform int uPlateauCount;
uniform vec4 uPlateaus[40];
uniform int uRiverSegmentCount;
uniform vec4 uRiverSegments[24];
uniform vec4 uWaterfalls[4];
uniform vec4 uWaterfallMeta[4];

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return a * h + b * (1.0 - h) - k * h * (1.0 - h);
}

float hash2D(highp ivec2 p) {
  highp uint ux = uint(p.x);
  highp uint uy = uint(p.y);
  highp uint n = ux * 374761393u + uy * 668265263u + 1442695041u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return float(n) * (1.0 / 4294967296.0);
}

float valueNoise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  highp ivec2 ip = ivec2(i);
  float a = hash2D(ip);
  float b = hash2D(ip + ivec2(1, 0));
  float c = hash2D(ip + ivec2(0, 1));
  float d = hash2D(ip + ivec2(1, 1));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

float fbm2D(vec2 p, int octaves) {
  float value = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  float norm = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    value += amp * (valueNoise2D(p * freq) * 2.0 - 1.0);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return value / max(0.001, norm);
}

float ridged2D(vec2 p, int octaves) {
  float value = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  float norm = 0.0;
  for (int i = 0; i < 3; i++) {
    if (i >= octaves) break;
    float n = valueNoise2D(p * freq) * 2.0 - 1.0;
    float r = 1.0 - abs(n);
    value += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return value / max(0.001, norm);
}

float distToSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b - a;
  float lenSq = dot(ba, ba);
  if (lenSq == 0.0) return length(p - a);
  float t = clamp(dot(p - a, ba) / lenSq, 0.0, 1.0);
  return length(p - (a + t * ba));
}

float getCoastlineSignedDist(vec2 p) {
  float warpX = fbm2D(p * 0.000085, 3) * 3800.0;
  float warpZ = fbm2D(p * 0.000085 + vec2(7.4, -5.1), 3) * 3800.0;
  vec2 w = p + vec2(warpX, warpZ);

  float minSd = 9.0;
  for (int i = 0; i < 21; i++) {
    if (i >= uLobeCount) break;
    vec4 pr = uLobePosRot[i];
    vec2 rd = uLobeRadii[i];
    vec2 d = w - pr.xy;
    float lx = (d.x * pr.z + d.y * pr.w) / rd.x;
    float lz = (-d.x * pr.w + d.y * pr.z) / rd.y;
    float sd = length(vec2(lx, lz)) - 1.0;
    minSd = (i == 0) ? sd : smin(minSd, sd, 0.13);
  }

  float fjordErosion = fbm2D(p * 0.00034 + vec2(3.7, -8.2), 3) * 0.17;
  return minSd + fjordErosion;
}

float getRiverDistance(vec2 p) {
  float meanderX = p.x + fbm2D(p * 0.00032, 2) * 290.0 + sin(p.y * 0.0018) * 36.0;
  float meanderZ = p.y + fbm2D(p * 0.00032 + vec2(14.3, -9.7), 2) * 290.0 + cos(p.x * 0.0018) * 36.0;
  vec2 mp = vec2(meanderX, meanderZ);

  float minD = 999999.0;
  for (int i = 0; i < 24; i++) {
    if (i >= uRiverSegmentCount) break;
    vec4 seg = uRiverSegments[i];
    minD = min(minD, distToSegment(mp, seg.xy, seg.zw));
  }
  return minD;
}

float getMountainSpineDistance(vec2 p) {
  float wx = p.x + fbm2D(p * 0.00018, 2) * 950.0;
  float wz = p.y + fbm2D(p * 0.00018 + vec2(6.2, -4.8), 2) * 950.0;
  vec2 wp = vec2(wx, wz);

  float minD = 999999.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uSpineCount) break;
    vec4 s = uMountainSpines[i];
    minD = min(minD, distToSegment(wp, s.xy, s.zw));
  }
  return minD;
}

vec2 getPrevailingWindDir(float z) {
  float latNorm = clamp(z / uWorldHalfSize, -1.0, 1.0);
  float westerliesBlend = 1.0 - smoothstep(-0.08, 0.22, latNorm);
  return vec2(mix(-0.92, 0.94, westerliesBlend), mix(-0.34, 0.20, westerliesBlend));
}

void getOrographicBalanceAt(vec2 p, out float windwardLift, out float leewardShadow, out float onshoreBreeze, out float continentalInterior) {
  vec2 w = getPrevailingWindDir(p.y);
  vec2 u1 = p - w * 2400.0;
  vec2 u2 = p - w * 4400.0;
  vec2 d1 = p + w * 4200.0;

  float hereSpine = getMountainSpineDistance(p);
  float upwindSpine = min(getMountainSpineDistance(u1), getMountainSpineDistance(u2));
  float upwindCoast = getCoastlineSignedDist(u2);
  float downwindCoast = getCoastlineSignedDist(d1);

  leewardShadow = (1.0 - smoothstep(400.0, 2600.0, upwindSpine)) * smoothstep(900.0, 3200.0, hereSpine);
  windwardLift = (1.0 - smoothstep(400.0, 3400.0, hereSpine)) * smoothstep(-0.26, 0.02, upwindCoast);
  onshoreBreeze = max(
    smoothstep(-0.22, 0.06, upwindCoast),
    smoothstep(-0.14, 0.06, downwindCoast) * 0.75
  );
  continentalInterior = smoothstep(0.04, -0.34, min(upwindCoast, downwindCoast)) *
    smoothstep(0.08, -0.18, max(upwindCoast, downwindCoast));
}

float getAridIntensityAt(vec2 p, float coastSd, float leewardShadow, float continentalInterior) {
  float warp = fbm2D(p * 0.00016 + vec2(5.1, -3.9), 2) * 1800.0;
  float maxVal = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= uAridCount) break;
    vec4 ap = uAridPockets[i];
    float d = length(vec2(p.x + warp - ap.x, p.y - warp * 0.7 - ap.y));
    if (d < ap.z) {
      float f = (1.0 - smoothstep(ap.z * 0.25, ap.z, d)) * ap.w;
      maxVal = max(maxVal, f);
    }
  }
  float latNorm = clamp(p.y / uWorldHalfSize, -1.0, 1.0);
  float medCoastShield = (1.0 - smoothstep(-27500.0, -19500.0, p.x)) * (1.0 - smoothstep(12000.0, 21000.0, p.y));
  float taurusNorthShield = 1.0 - smoothstep(-32000.0, -21000.0, p.y);
  float regionalDesertBelt = smoothstep(-0.56, 0.14, latNorm) * (0.76 - medCoastShield * 0.62 - taurusNorthShield * 0.45);
  float leewardLandMask = smoothstep(-0.04, -0.22, coastSd) * continentalInterior;
  float dynamicArid = regionalDesertBelt + leewardShadow * 0.34 * smoothstep(-0.35, 0.12, latNorm) * leewardLandMask;
  return clamp(max(maxVal * (1.0 - medCoastShield * 0.65), dynamicArid), 0.0, 1.0);
}

float getOasisDistance(vec2 p) {
  float mirqabOasis = length(vec2((p.x + 4120.0) * 0.9, p.y - 5180.0));
  float tadmurOasis = length(vec2((p.x + 12200.0) * 0.88, p.y + 4500.0));
  float jawfOasis = length(vec2((p.x + 3800.0) * 0.9, p.y - 27200.0));
  float einTamrOasis = length(vec2((p.x - 12200.0) * 0.88, p.y - 6800.0));
  return min(min(mirqabOasis, tadmurOasis), min(jawfOasis, einTamrOasis));
}

float getTerrainHeightWithCoast(
  vec2 p,
  float coastSd,
  float spineDist,
  float riverDist,
  float oasisDist,
  float arid
) {
  float radialDist = length(p);
  float isletNoise = fbm2D(p * 0.00045 + vec2(-11.2, 6.4), 2);
  float borderFade = 1.0 - smoothstep(43000.0, 48500.0, max(abs(p.x), abs(p.y)));
  float nearCoastBand = smoothstep(0.45, 0.05, coastSd) * smoothstep(-0.02, 0.08, coastSd);
  float isletFactor = smoothstep(0.44, 0.62, isletNoise) * nearCoastBand * borderFade;

  if (coastSd > 0.14 && isletFactor < 0.05) {
    float abyssT = smoothstep(0.0, 0.55, coastSd);
    float bathymetry = fbm2D(p * 0.00022 + vec2(3.1, -4.7), 2) * 0.32;
    return -0.55 - abyssT * 3.2 + bathymetry;
  }

  float mesoNoise = fbm2D(p * 0.0036, 3);
  float macroNoise = fbm2D(p * 0.00038, 3);
  float microDetail = sin(p.x * 0.024) * cos(p.y * 0.024) * 0.28;

  float inlandFactor = smoothstep(0.02, -0.35, coastSd);
  float h = 0.85 + inlandFactor * 2.0 + mesoNoise * 1.45 + macroNoise * 1.75 + microDetail;

  // 1. Domain-warped Tectonic Alpine Mountain Chains (Taurus, Zagros, Lebanon, Sinjar)
  float spineMask = 1.0 - smoothstep(320.0, 3400.0, spineDist);
  if (spineMask > 0.01) {
    vec2 warp = vec2(
      fbm2D(p * 0.00055 + vec2(4.2, -7.8), 2) * 520.0,
      fbm2D(p * 0.00055 + vec2(-9.1, 3.6), 2) * 520.0
    );
    vec2 wp = p + warp;
    float rMain = pow(clamp(ridged2D(wp * 0.00034 + vec2(12.7, -4.3), 3), 0.0, 1.0), 1.35);
    float rPeak = pow(clamp(ridged2D(wp * 0.0016 + vec2(-5.4, 8.9), 2), 0.0, 1.0), 1.45);
    float valleyCut = smoothstep(0.55, 0.92, abs(fbm2D(wp * 0.00095 + vec2(18.2, -14.1), 2))) * 2.6;
    float spineCore = pow(spineMask, 1.25);
    h += spineCore * (5.2 + rMain * 7.8 + rPeak * 5.8) - spineCore * valleyCut * 0.65;
  }

  // 2. Stepped Natural Plateaus / Mesas (الهضاب المتدرجة)
  float mesaField = fbm2D(p * 0.00024 + vec2(17.3, -23.5), 3) * 0.5 + 0.5;
  float mesaMask = smoothstep(0.62, 0.80, mesaField) * inlandFactor * (1.0 - spineMask * 0.65);
  if (mesaMask > 0.01) {
    float rawMesa = mesaMask * 5.2;
    float tierH = 2.4;
    float steppedMesa = (floor(rawMesa / tierH) + smoothstep(0.18, 0.42, fract(rawMesa / tierH))) * tierH;
    h += steppedMesa;
  }

  // 3. Rocky Outcrops & Buttes (النتوءات الصخرية)
  float outcropRaw = ridged2D(p * 0.00145 + vec2(-31.7, 14.9), 2);
  float outcropMask = smoothstep(0.76, 0.93, outcropRaw) * inlandFactor;
  if (outcropMask > 0.01) {
    h += pow(outcropMask, 1.3) * 3.8;
  }

  // 4. Tectonic Fault Canyons & Desert Wadis (الأخاديد والخوانق)
  float canyonWarp = fbm2D(p * 0.00042 + vec2(-6.4, 21.8), 2) * 360.0;
  float faultLine = abs(fbm2D((p + vec2(canyonWarp, -canyonWarp * 0.7)) * 0.00038 + vec2(8.1, -13.4), 2));
  float canyonCut = (1.0 - smoothstep(0.018, 0.058, faultLine)) * smoothstep(0.08, 0.35, inlandFactor) * (1.0 - spineMask * 0.4);
  if (canyonCut > 0.01) {
    float depthMod = 0.65 + 0.35 * (fbm2D(p * 0.00022 + vec2(3.0, 9.0), 2) * 0.5 + 0.5);
    h -= canyonCut * 4.4 * depthMod;
  }

  if (arid > 0.05) {
    float dunes = pow(sin(p.x * 0.026 + cos(p.y * 0.019) * 2.2) * 0.5 + 0.5, 1.45) * 2.4;
    h += arid * dunes * 0.62;
  }

  if (coastSd > -0.09) {
    float seaMix = smoothstep(-0.09, 0.06, coastSd);
    float oceanFloor = -0.35 - smoothstep(0.0, 0.5, max(0.0, coastSd)) * 3.4;
    h = mix(h, oceanFloor, seaMix);
  }

  if (isletFactor > 0.05) {
    h = max(h, -0.3 + isletFactor * 3.4);
  }

  bool isUpstreamOfWaterfall = false;
  for (int i = 0; i < 4; i++) {
    vec4 wf = uWaterfalls[i];
    vec4 wm = uWaterfallMeta[i];
    vec2 d = p - wf.xy;
    float distCliff = length(d);
    if (distCliff < 42.0) {
      float alongFlow = d.x * wf.z + d.y * wf.w;
      float acrossFlow = abs(-d.x * wf.w + d.y * wf.z);
      float smoothW = 1.0 - smoothstep(0.0, 42.0, distCliff);
      if (distCliff < 36.0 && alongFlow < 0.0) isUpstreamOfWaterfall = true;
      if (alongFlow < -2.5) {
        float basinDepress = acrossFlow < wm.z * 0.7 ? -0.7 : 1.8;
        h = mix(h, wm.x + basinDepress, smoothW * 0.92);
      } else if (alongFlow >= -2.5 && alongFlow <= 6.0 && acrossFlow < wm.z * 0.9) {
        float t = (alongFlow + 2.5) / 8.5;
        h = mix(h, mix(wm.x, wm.y, t), smoothW);
      }
    }
  }

  for (int i = 0; i < 40; i++) {
    if (i >= uPlateauCount) break;
    vec4 sp = uPlateaus[i];
    vec2 dp = p - sp.xy;
    if (abs(dp.x) < sp.z && abs(dp.y) < sp.z) {
      float distP = length(dp);
      if (distP < sp.z) {
        h = mix(sp.w, h, smoothstep(sp.z * 0.45, sp.z, distP));
      }
    }
  }

  if (oasisDist < 28.0) {
    h = mix(-1.3, h, smoothstep(14.0, 28.0, oasisDist));
  }

  if (coastSd < 0.02 && riverDist < 15.0 && !isUpstreamOfWaterfall) {
    h = mix(-1.15, h, smoothstep(5.5, 15.0, riverDist));
  }

  float rimDist = max(abs(p.x), abs(p.y));
  if (rimDist > 45500.0 || radialDist > 62000.0) {
    h = mix(h, -3.8, smoothstep(45500.0, 49500.0, rimDist));
  }

  return h;
}

float getTerrainHeightSlopeSample(vec2 p, float approxArid) {
  float coastSd = getCoastlineSignedDist(p);
  if (coastSd > 0.14) {
    return -0.55 - smoothstep(0.0, 0.55, coastSd) * 3.2;
  }
  float spineDist = getMountainSpineDistance(p);
  float mesoNoise = fbm2D(p * 0.0036, 2);
  float macroNoise = fbm2D(p * 0.00038, 2);
  float inlandFactor = smoothstep(0.02, -0.35, coastSd);
  float h = 0.85 + inlandFactor * 2.0 + mesoNoise * 1.45 + macroNoise * 1.75;
  float spineMask = 1.0 - smoothstep(320.0, 3400.0, spineDist);
  if (spineMask > 0.01) {
    vec2 warp = vec2(
      fbm2D(p * 0.00055 + vec2(4.2, -7.8), 2) * 520.0,
      fbm2D(p * 0.00055 + vec2(-9.1, 3.6), 2) * 520.0
    );
    vec2 wp = p + warp;
    float rMain = pow(clamp(ridged2D(wp * 0.00034 + vec2(12.7, -4.3), 2), 0.0, 1.0), 1.35);
    float rPeak = pow(clamp(ridged2D(wp * 0.0016 + vec2(-5.4, 8.9), 2), 0.0, 1.0), 1.45);
    float spineCore = pow(spineMask, 1.25);
    h += spineCore * (5.2 + rMain * 7.8 + rPeak * 5.8);
  }
  float mesaField = fbm2D(p * 0.00024 + vec2(17.3, -23.5), 2) * 0.5 + 0.5;
  float mesaMask = smoothstep(0.62, 0.80, mesaField) * inlandFactor * (1.0 - spineMask * 0.65);
  if (mesaMask > 0.01) {
    float rawMesa = mesaMask * 5.2;
    h += (floor(rawMesa / 2.4) + smoothstep(0.18, 0.42, fract(rawMesa / 2.4))) * 2.4;
  }
  float outcropMask = smoothstep(0.76, 0.93, ridged2D(p * 0.00145 + vec2(-31.7, 14.9), 2)) * inlandFactor;
  if (outcropMask > 0.01) {
    h += pow(outcropMask, 1.3) * 3.8;
  }
  float canyonWarp = fbm2D(p * 0.00042 + vec2(-6.4, 21.8), 2) * 360.0;
  float faultLine = abs(fbm2D((p + vec2(canyonWarp, -canyonWarp * 0.7)) * 0.00038 + vec2(8.1, -13.4), 2));
  float canyonCut = (1.0 - smoothstep(0.018, 0.058, faultLine)) * smoothstep(0.08, 0.35, inlandFactor) * (1.0 - spineMask * 0.4);
  if (canyonCut > 0.01) {
    h -= canyonCut * 4.2;
  }
  if (approxArid > 0.05) {
    float dunes = pow(sin(p.x * 0.026 + cos(p.y * 0.019) * 2.2) * 0.5 + 0.5, 1.45) * 2.4;
    h += approxArid * dunes * 0.62;
  }
  if (coastSd > -0.09) {
    float seaMix = smoothstep(-0.09, 0.06, coastSd);
    h = mix(h, -0.35 - smoothstep(0.0, 0.5, max(0.0, coastSd)) * 3.4, seaMix);
  }
  return h;
}

float getMoistureApprox(
  vec2 p,
  float coastSd,
  float arid,
  float riverDist,
  float oasisDist,
  float windwardLift,
  float leewardShadow,
  float onshoreBreeze,
  float continentalInterior
) {
  float latNorm = clamp(p.y / uWorldHalfSize, -1.0, 1.0);
  float deepInland = smoothstep(-0.06, -0.32, coastSd);
  float medCoastBelt = (1.0 - smoothstep(-29000.0, -19500.0, p.x)) * (1.0 - smoothstep(13000.0, 22000.0, p.y));
  float taurusRimBelt = 1.0 - smoothstep(-35000.0, -22500.0, p.y);
  float arabiaDryDrop = smoothstep(-0.22, 0.48, latNorm) * 0.28;

  float baseHumidity = 0.22 + medCoastBelt * 0.44 + taurusRimBelt * 0.30;
  float aridDrop = arid * 0.46;
  float moistureNoise = fbm2D(p * 0.00012 + vec2(41.0, -19.0), 3) * 0.11;
  float riverBonus = riverDist < 280.0 ? (1.0 - smoothstep(25.0, 280.0, riverDist)) * 0.48 : 0.0;
  float oasisBonus = oasisDist < 210.0 ? (1.0 - smoothstep(22.0, 210.0, oasisDist)) * 0.44 : 0.0;
  return clamp(
    baseHumidity + onshoreBreeze * 0.12 * medCoastBelt + windwardLift * 0.20 * (medCoastBelt + taurusRimBelt) - leewardShadow * 0.16 * deepInland * continentalInterior - arabiaDryDrop - aridDrop + moistureNoise + riverBonus + oasisBonus,
    0.0,
    1.0
  );
}

float getTemperatureApprox(vec2 p, float elev, float coastSd, float arid, float riverDist, float continentalInterior) {
  float latNorm = clamp(p.y / uWorldHalfSize, -1.0, 1.0);
  float sDelta = (latNorm - 0.48) / 0.44;
  float subtropicalPeak = exp(-(sDelta * sDelta)) * 4.5;
  float baseSeaLevelC = 19.5 + latNorm * 14.0 + subtropicalPeak;
  float inland = smoothstep(0.0, -0.38, coastSd) * (0.35 + continentalInterior * 0.65);
  float warmMix = smoothstep(-0.32, 0.18, latNorm);
  float continentality = mix(-inland * 2.4, inland * 3.4, warmMix);
  float aridHeat = arid * 6.0 * smoothstep(-0.14, 0.22, latNorm);
  float riverCooling = riverDist < 160.0 ? -1.4 : 0.0;
  float noiseC = fbm2D(p * 0.0001, 2) * 1.8;
  return baseSeaLevelC + continentality + aridHeat - elev * 1.55 + riverCooling + noiseC;
}

float getSnowlineH(vec2 p, float arid) {
  float latNorm = clamp(p.y / uWorldHalfSize, -1.0, 1.0);
  return 5.3 + smoothstep(-0.78, 0.55, latNorm) * 4.3 + arid * 1.2;
}

float getForestDensityAt(vec2 p, float coastSd, float elev, float moisture, float arid, float snowLine, float riverDist) {
  if (coastSd > -0.025 || elev < 0.35 || elev > snowLine - 0.55) return 0.0;
  if (moisture < 0.42 || arid > 0.36 || riverDist < 14.0) return 0.0;
  float macroGrove = fbm2D(p * 0.00022 + vec2(19.4, -11.7), 3);
  float gladeBreak = fbm2D(p * 0.00095 + vec2(-5.2, 8.3), 2);
  float basePatch = macroGrove * 0.68 + gladeBreak * 0.32;
  float moistBoost = smoothstep(0.42, 0.78, moisture) * 0.46;
  float aridSuppress = smoothstep(0.14, 0.36, arid) * 0.62;
  float elevFade = 1.0 - smoothstep(snowLine - 2.2, snowLine - 0.55, elev);
  float coastFade = smoothstep(-0.025, -0.12, coastSd);
  float riverCorridorBoost = riverDist < 220.0 ? (1.0 - smoothstep(18.0, 220.0, riverDist)) * 0.18 : 0.0;
  return clamp(
    smoothstep(-0.10, 0.36, basePatch + moistBoost + riverCorridorBoost - aridSuppress) * elevFade * coastFade,
    0.0,
    1.0
  );
}

void main() {
  // vUv (0..1) -> top-down world XZ (y flips so north is -Z at top of screen)
  vec2 offset = vec2(vUv.x - 0.5, 0.5 - vUv.y);
  vec2 worldXZ = uBakeCenter + offset * uBakeSpanXZ;
  float metersPerPx = uBakeMetersPerPx;

  float coastSd = getCoastlineSignedDist(worldXZ);
  float riverDist = coastSd < 0.06 ? getRiverDistance(worldXZ) : 9999.0;
  float oasisDist = coastSd < 0.06 ? getOasisDistance(worldXZ) : 9999.0;
  float spineDist = coastSd < 0.16 ? getMountainSpineDistance(worldXZ) : 99999.0;

  float windwardLift = 0.0;
  float leewardShadow = 0.0;
  float onshoreBreeze = 0.0;
  float continentalInterior = 0.0;
  float arid = 0.0;
  if (coastSd < 0.16) {
    getOrographicBalanceAt(worldXZ, windwardLift, leewardShadow, onshoreBreeze, continentalInterior);
    arid = getAridIntensityAt(worldXZ, coastSd, leewardShadow, continentalInterior);
  }

  float h = getTerrainHeightWithCoast(worldXZ, coastSd, spineDist, riverDist, oasisDist, arid);
  float waterLine = -0.25;
  vec3 col;

  if (h < waterLine) {
    // Rich Mediterranean & Arabian Gulf Illuminated Cartographic Sea Palette
    float depthT = clamp((waterLine - h) / 3.4, 0.0, 1.0);
    vec3 shallowCol = vec3(0.14, 0.44, 0.53);
    vec3 midSeaCol  = vec3(0.08, 0.25, 0.36);
    vec3 deepSeaCol = vec3(0.04, 0.13, 0.22);
    col = mix(shallowCol, midSeaCol, smoothstep(0.0, 0.42, depthT));
    col = mix(col, deepSeaCol, smoothstep(0.32, 1.0, depthT));

    // Gentle cartographic wave-ripple contour bands along coastlines (classic atlas engraving)
    float waveBand = sin((waterLine - h) * 18.0);
    float coastalWaveMask = (1.0 - smoothstep(0.08, 0.65, depthT)) * smoothstep(0.01, 0.06, depthT);
    col = mix(col, shallowCol * 1.24, smoothstep(0.75, 0.98, waveBand) * 0.24 * coastalWaveMask);

    // Warm ivory-aqua shoreline shimmer
    float shoreHalo = 1.0 - smoothstep(0.0, 0.24, waterLine - h);
    col = mix(col, vec3(0.68, 0.82, 0.78), shoreHalo * 0.42);
  } else {
    float moisture = getMoistureApprox(worldXZ, coastSd, arid, riverDist, oasisDist, windwardLift, leewardShadow, onshoreBreeze, continentalInterior);
    float tempC = getTemperatureApprox(worldXZ, max(0.0, h), coastSd, arid, riverDist, continentalInterior);
    float snowLine = getSnowlineH(worldXZ, arid);

    // Sculpted NW-to-SE cartographic hillshade
    float sampleStep = max(6.0, min(220.0, metersPerPx * 1.25));
    float hx = getTerrainHeightSlopeSample(worldXZ + vec2(sampleStep, 0.0), arid);
    float hz = getTerrainHeightSlopeSample(worldXZ + vec2(0.0, sampleStep), arid);

    float slopeStrength = clamp(15.0 / max(3.0, sqrt(sampleStep)), 1.0, 2.8);
    vec3 normal = normalize(vec3((h - hx) / sampleStep * slopeStrength * 7.2, 1.0, (h - hz) / sampleStep * slopeStrength * 7.2));
    vec3 sunDir = normalize(vec3(-0.62, 0.76, -0.48));
    float hillshade = clamp(dot(normal, sunDir), 0.36, 1.15);

    // Realistic Satellite Middle East Palette (Anatolia/Taurus Olive, Narrow Levant Green, Vast Buff/Ochre Syria-Iraq & Orange-Red Nafud)
    vec3 cFertileOlive = vec3(0.42, 0.48, 0.29);
    vec3 cHighlandOlive = vec3(0.35, 0.41, 0.26);
    vec3 cSteppeBuff = vec3(0.76, 0.66, 0.49);
    vec3 cCedarForest = vec3(0.20, 0.32, 0.19);
    vec3 cSyrianDesert = vec3(0.84, 0.72, 0.53);
    vec3 cNafudRedSand = vec3(0.79, 0.53, 0.34);
    vec3 cBasaltGorge = vec3(0.47, 0.41, 0.34);
    vec3 cTaurusRock = vec3(0.50, 0.47, 0.43);
    vec3 cSummitSnow = vec3(0.92, 0.91, 0.88);
    vec3 cCoastSand = vec3(0.85, 0.76, 0.58);

    // 1. Dry Middle East Steppe Base -> blends to Olive/Green strictly where Moisture is high (Taurus & Levant Coast)
    float greenCover = smoothstep(0.36, 0.68, moisture) * (1.0 - smoothstep(0.22, 0.56, arid));
    vec3 humidGreen = mix(cFertileOlive, cHighlandOlive, clamp((16.0 - tempC) / 10.0, 0.0, 1.0) * 0.65);
    col = mix(cSteppeBuff, humidGreen, greenCover);
    col = mix(col, cCedarForest, smoothstep(0.60, 0.86, moisture) * greenCover * 0.45);

    // 2. Woodland & Cedar/Oak Forests (Taurus, Kurdistan & Lebanon Coastal Slopes)
    float forestD = getForestDensityAt(worldXZ, coastSd, h, moisture, arid, snowLine, riverDist);
    if (forestD > 0.16) {
      float canopyBlend = smoothstep(0.16, 0.68, forestD);
      float crownTex = fbm2D(worldXZ * 0.0065, 2) * 0.5 + 0.5;
      vec3 deepWood = vec3(0.15, 0.26, 0.16);
      vec3 litWood = vec3(0.26, 0.37, 0.21);
      col = mix(col, mix(deepWood, litWood, smoothstep(0.26, 0.78, crownTex)), canopyBlend * 0.78);
    }

    // 3. Vast Syrian Desert, Iraqi Alluvial Steppe, Jordan Hamad & Red Nafud Sand (matching real satellite view!)
    float desertNoise = fbm2D(worldXZ * 0.00028, 2) * 0.5 + 0.5;
    float southernRedMix = smoothstep(-0.08, 0.62, worldXZ.y / uWorldHalfSize);
    if (arid > 0.08) {
      float sf = smoothstep(0.08, 0.68, arid);
      float duneRipples = sin(worldXZ.x * 0.0045 + worldXZ.y * 0.0028 + desertNoise * 4.0) * 0.5 + 0.5;
      if (h < snowLine - 1.2) {
        vec3 sandTone = mix(cSyrianDesert, cNafudRedSand, clamp(desertNoise * 0.42 + southernRedMix * 0.62, 0.0, 1.0));
        sandTone *= (0.94 + duneRipples * 0.08);
        col = mix(col, sandTone, sf * 0.94);
      } else {
        col = mix(col, mix(cBasaltGorge, cSteppeBuff, 0.45), sf * 0.52);
      }
    }

    // 4. Mountain Foothills, Black Valley Basalt & Zagros/Taurus Escarpments
    if (h > 3.6 || (spineDist < 3000.0 && h > 2.8)) {
      float spineProx = spineDist < 3000.0 ? (1.0 - spineDist / 3000.0) : 0.0;
      float elevW = smoothstep(3.4, 6.8, h);
      float ef = max(spineProx * 0.70, elevW);
      float stepBand = sin(h * 1.4) * 0.5 + 0.5;
      col = mix(col, mix(cBasaltGorge, vec3(0.58, 0.49, 0.39), stepBand * 0.45), ef * 0.72);
    }

    // 5. Shoreline Beaches
    if (h < 0.42) {
      col = mix(cCoastSand, col, smoothstep(waterLine, 0.42, h));
    }

    // 6. Sharp Emerald Irrigated Ribbons strictly along Tigris, Euphrates, Shatt al-Arab, Jordan & Desert Oases
    float lushWidth = max(210.0, metersPerPx * 4.6);
    if (coastSd < 0.02 && riverDist < lushWidth) {
      float rLush = 1.0 - smoothstep(0.0, lushWidth, riverDist);
      col = mix(col, vec3(0.24, 0.47, 0.25), rLush * 0.84);
    }
    if (oasisDist < 220.0) {
      float oLush = 1.0 - smoothstep(18.0, 220.0, oasisDist);
      col = mix(col, vec3(0.22, 0.50, 0.27), oLush * 0.86);
    }

    // 7. Alpine Granite Crags & Taurus/Zagros Snow Summits
    float rockStart = snowLine - 1.8;
    if (h > rockStart) {
      col = mix(col, cTaurusRock, smoothstep(rockStart, snowLine + 0.6, h) * 0.76);
    }
    if (h > snowLine) {
      col = mix(col, cSummitSnow, smoothstep(snowLine, snowLine + 2.8, h) * 0.94);
    }

    // Apply warm sunlit hillshade + subtle sepia relief shadows
    vec3 shadeTint = mix(vec3(0.66, 0.60, 0.54), vec3(1.10, 1.07, 1.00), clamp((hillshade - 0.36) / 0.78, 0.0, 1.0));
    col *= shadeTint;

    // Delicate topographic contour lines
    float contourStep = metersPerPx > 32.0 ? 2.6 : (metersPerPx > 12.0 ? 1.6 : 0.9);
    float cFrac = abs(fract(h / contourStep - 0.5) - 0.5);
    float cAlpha = (1.0 - smoothstep(0.0, 0.075, cFrac)) * 0.14;
    col = mix(col, vec3(0.24, 0.17, 0.10), cAlpha);

    // Crisp antique-ink shoreline border
    if (h < 0.14) {
      float inkEdge = 1.0 - smoothstep(0.0, 0.32, h - waterLine);
      col = mix(col, vec3(0.14, 0.18, 0.20), inkEdge * 0.52);
    }
  }

  // Flowing Tigris, Euphrates, Shatt al-Arab, Khabur, Zab, Orontes & Jordan Rivers
  float minRiverWidth = max(14.0, metersPerPx * 1.45);
  if (coastSd < 0.02 && riverDist < minRiverWidth) {
    float rAlpha = 1.0 - smoothstep(minRiverWidth * 0.30, minRiverWidth, riverDist);
    vec3 riverCol = vec3(0.14, 0.48, 0.62);
    col = mix(col, riverCol, rAlpha * 0.92);
  }

  // Encode normalized elevation in Alpha (water < 0.21, land >= 0.21, high alpine peaks up to 24m)
  float packedH = clamp((h + 5.0) / 28.0, 0.0, 1.0);
  fragColor = vec4(col, packedH);
}
`;

const COMPOSITE_FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

in vec2 vNdc;
out vec4 fragColor;

uniform sampler2D uWorldTex;
uniform sampler2D uDetailTex;
uniform vec4 uDetailBounds;   // minX, minZ, spanX, spanZ
uniform float uDetailBlend;   // 0..1

uniform vec2 uViewCenter;
uniform vec2 uViewSpanXZ;
uniform vec2 uViewportPx;
uniform float uWorldHalfSize;
uniform int uClimateMode;

uniform int uObserverCount;
uniform vec3 uObservers[48];

float hashFast(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uvOffset = vec2(vNdc.x * 0.5, -vNdc.y * 0.5);
  vec2 worldXZ = uViewCenter + uvOffset * uViewSpanXZ;
  float metersPerPx = max(uViewSpanXZ.x / max(1.0, uViewportPx.x), uViewSpanXZ.y / max(1.0, uViewportPx.y));

  // Sample baked full-world 2048x2048 relief texture
  vec2 worldUv = vec2(
    (worldXZ.x + uWorldHalfSize) / (2.0 * uWorldHalfSize),
    1.0 - (worldXZ.y + uWorldHalfSize) / (2.0 * uWorldHalfSize)
  );

  vec4 texSample = texture(uWorldTex, clamp(worldUv, 0.001, 0.999));

  // Smoothly blend high-res local detail tile when zoomed in
  if (uDetailBlend > 0.01 && uDetailBounds.z > 1.0 && uDetailBounds.w > 1.0) {
    vec2 dUv = vec2(
      (worldXZ.x - uDetailBounds.x) / uDetailBounds.z,
      1.0 - (worldXZ.y - uDetailBounds.y) / uDetailBounds.w
    );
    if (dUv.x > 0.0 && dUv.x < 1.0 && dUv.y > 0.0 && dUv.y < 1.0) {
      float edgeX = min(dUv.x, 1.0 - dUv.x);
      float edgeY = min(dUv.y, 1.0 - dUv.y);
      float feather = smoothstep(0.0, 0.07, min(edgeX, edgeY)) * uDetailBlend;
      vec4 detailSample = texture(uDetailTex, dUv);
      texSample = mix(texSample, detailSample, feather);
    }
  }

  vec3 col = texSample.rgb;
  float h = texSample.a * 28.0 - 5.0;
  bool isWater = h < -0.25;

  // Regional atmospheric weather tinting (restrained, physically scoped)
  if (uClimateMode == 1) {
    float coldZone = smoothstep(-6000.0, -28000.0, worldXZ.y) + smoothstep(5.5, 8.5, h);
    col = mix(col, vec3(0.76, 0.85, 0.93), clamp(coldZone, 0.0, 1.0) * 0.24);
  } else if (uClimateMode == 2) {
    float desertZone = smoothstep(-2000.0, 18000.0, worldXZ.y) * (isWater ? 0.0 : 1.0);
    col = mix(col, vec3(0.86, 0.69, 0.40), desertZone * 0.24);
  } else if (uClimateMode == 3) {
    float rainZone = 1.0 - smoothstep(12000.0, 32000.0, worldXZ.y);
    col = mix(col, vec3(0.20, 0.34, 0.45), rainZone * 0.16);
  }

  // Subtle parchment paper grain for tactile medieval atlas look
  float grain = (hashFast(floor(gl_FragCoord.xy * 0.75)) - 0.5) * 0.025;
  col += vec3(grain);

  // Illuminated Parchment Fog-of-War:
  // Unseen areas look like an authentic, crystal-clear aged medieval parchment map (NEVER black mud!).
  // Live-seen areas shine in rich sunlit terrain with a subtle brass sight rim.
  float maxSightFactor = 0.0;
  float minBorderDist = 999999.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uObserverCount) break;
    vec3 obs = uObservers[i];
    float d = length(worldXZ - obs.xy);
    float edgeSoft = max(8.0, obs.z * 0.08);
    float vis = 1.0 - smoothstep(obs.z - edgeSoft, obs.z + edgeSoft * 0.35, d);
    maxSightFactor = max(maxSightFactor, vis);
    minBorderDist = min(minBorderDist, abs(d - obs.z));
  }

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 sepiaLand = mix(vec3(luma) * vec3(0.96, 0.88, 0.72), col, 0.62) * 0.86;
  vec3 sepiaWater = mix(vec3(luma) * vec3(0.62, 0.76, 0.82), col, 0.68) * 0.82;
  vec3 cartographicShroud = isWater ? sepiaWater : sepiaLand;

  col = mix(cartographicShroud, col * 1.06, maxSightFactor);

  // Subtle golden tactical vision rim when zoomed close enough to inspect scout ranges
  if (uObserverCount > 0 && metersPerPx < 240.0) {
    float borderThickness = max(metersPerPx * 1.4, 7.0);
    float rim = (1.0 - smoothstep(0.0, borderThickness, minBorderDist)) * 0.44;
    col = mix(col, vec3(0.96, 0.80, 0.42), rim);
  }

  // Deep antique-atlas frame outside +/- 50 km theater bounds
  float boundDist = max(abs(worldXZ.x), abs(worldXZ.y)) - uWorldHalfSize;
  if (boundDist > 0.0) {
    float outFade = smoothstep(0.0, 5200.0, boundDist);
    col = mix(col, vec3(0.035, 0.085, 0.135), outFade * 0.85);
  }

  // Gentle screen-edge vignette so HUD text stays crisp without obscuring the center
  float vig = smoothstep(0.72, 1.42, length(vNdc));
  col *= (1.0 - vig * 0.18);

  fragColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('StrategicMap shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('StrategicMap link failed:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createRenderTarget(gl: WebGL2RenderingContext, size: number) {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
    return null;
  }
  return { tex, fbo, size };
}

function pickAdaptiveGridStepM(viewSpanM: number): number {
  if (viewSpanM > 75_000) return 20_000;
  if (viewSpanM > 32_000) return 10_000;
  if (viewSpanM > 14_000) return 5_000;
  if (viewSpanM > 4_800) return 1_000;
  if (viewSpanM > 1_800) return 500;
  return 250;
}

function pickScaleBarMeters(metersPerPx: number): number {
  const targetM = metersPerPx * 105;
  const niceSteps = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 25_000, 50_000];
  let best = niceSteps[0];
  let bestDiff = Infinity;
  for (const s of niceSteps) {
    const diff = Math.abs(s - targetM);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillColor: string,
  strokeColor = 'rgba(14, 10, 6, 0.88)',
  strokeWidth = 3.2
) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

interface GlEngineState {
  gl: WebGL2RenderingContext;
  bakeProgram: WebGLProgram;
  compProgram: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  worldTarget: { tex: WebGLTexture; fbo: WebGLFramebuffer; size: number };
  detailTarget: { tex: WebGLTexture; fbo: WebGLFramebuffer; size: number };
  detailBounds: { minX: number; minZ: number; spanX: number; spanZ: number; valid: boolean };
  bakeLocs: {
    uBakeCenter: WebGLUniformLocation | null;
    uBakeSpanXZ: WebGLUniformLocation | null;
    uBakeMetersPerPx: WebGLUniformLocation | null;
  };
  compLocs: {
    uWorldTex: WebGLUniformLocation | null;
    uDetailTex: WebGLUniformLocation | null;
    uDetailBounds: WebGLUniformLocation | null;
    uDetailBlend: WebGLUniformLocation | null;
    uViewCenter: WebGLUniformLocation | null;
    uViewSpanXZ: WebGLUniformLocation | null;
    uViewportPx: WebGLUniformLocation | null;
    uClimateMode: WebGLUniformLocation | null;
    uObserverCount: WebGLUniformLocation | null;
    uObservers: WebGLUniformLocation | null;
  };
}

export const ProceduralStrategicMap: React.FC<ProceduralStrategicMapProps> = React.memo(({
  structures,
  units,
  players,
  myPlayerId,
  activeClimate,
  viewCenter,
  viewSpanM,
  onChangeView,
  mode,
  waypoints,
  leadDispatchUnit,
  onClickWorld,
  onDoubleClickWorld,
  onRightClickWorld,
  onHoverWorldChange,
  onZoomBelowThreshold,
  zoomInto3DThresholdM,
  minSpanM = 850,
  maxSpanM = 130_000,
  isActive = true,
  flyToCommand = null,
  enableKeyboardNav = false,
  onRequestClose,
  showInternalTelemetry = false,
  className = 'w-full h-full',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vectorCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [sizePx, setSizePx] = useState<{ w: number; h: number }>({ w: 640, h: 480 });
  const sizePxRef = useRef(sizePx);
  sizePxRef.current = sizePx;

  const [cursorStyle, setCursorStyle] = useState<'grab' | 'grabbing' | 'pointer' | 'crosshair'>('grab');
  const [hoverLandmark, setHoverLandmark] = useState<MacroLandmark | null>(null);
  const hoverLandmarkRef = useRef<MacroLandmark | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<MacroLandmark | null>(null);
  const telemetryElRef = useRef<HTMLSpanElement | null>(null);

  const glStateRef = useRef<GlEngineState | null>(null);
  const ensureGlInitRef = useRef<(() => void) | null>(null);
  const obsArrBufRef = useRef<Float32Array>(new Float32Array(48 * 3));

  // Pure-RAF Camera Engine (zero React state churn while dragging/zooming!)
  const camRef = useRef({
    x: viewCenter.x,
    z: viewCenter.z,
    span: viewSpanM,
    targetX: viewCenter.x,
    targetZ: viewCenter.z,
    targetSpan: viewSpanM,
    vx: 0,
    vz: 0,
    isDragging: false,
    dirty: true,
    lastCommittedX: viewCenter.x,
    lastCommittedZ: viewCenter.z,
    lastCommittedSpan: viewSpanM,
    lastInteractionMs: 0,
    detailNeedsBake: false,
  });

  const getEffectiveMaxSpan = useCallback(() => {
    const sz = sizePxRef.current;
    const aspect = Math.max(0.25, sz.w / Math.max(1, sz.h));
    if (aspect < 1) {
      // On portrait phones, spanZ = span / aspect; keep vertical span framed around ~112 km instead of 220 km of empty void
      return Math.min(
        propsRef.current.maxSpanM,
        Math.max(42_000, Math.round(WORLD_MAP_SIZE * 1.12 * aspect))
      );
    }
    return propsRef.current.maxSpanM;
  }, []);

  // Sync external prop jumps (e.g. opening the map or clicking zoom buttons) into camRef
  useEffect(() => {
    const c = camRef.current;
    const effMaxSpan = getEffectiveMaxSpan();
    const clampedPropSpan = Math.max(minSpanM, Math.min(effMaxSpan, viewSpanM));
    const dx = Math.abs(viewCenter.x - c.lastCommittedX);
    const dz = Math.abs(viewCenter.z - c.lastCommittedZ);
    const ds = Math.abs(clampedPropSpan - c.lastCommittedSpan);
    if (dx > 2 || dz > 2 || ds > 2) {
      c.targetX = viewCenter.x;
      c.targetZ = viewCenter.z;
      c.targetSpan = clampedPropSpan;
      // Snap immediately if jumping far on first open so there is no awkward cross-map whip
      if (!isActive || Math.hypot(viewCenter.x - c.x, viewCenter.z - c.z) > 35_000) {
        c.x = viewCenter.x;
        c.z = viewCenter.z;
        c.span = clampedPropSpan;
      }
      c.vx = 0;
      c.vz = 0;
      c.lastCommittedX = viewCenter.x;
      c.lastCommittedZ = viewCenter.z;
      c.lastCommittedSpan = clampedPropSpan;
      c.dirty = true;
      c.detailNeedsBake = true;
    }
  }, [viewCenter.x, viewCenter.z, viewSpanM, isActive, minSpanM, getEffectiveMaxSpan]);

  // Smooth animated fly-to command (from Capital Quick-Jump Bar or landmark clicks)
  const lastFlyNonceRef = useRef<number>(0);
  useEffect(() => {
    if (!flyToCommand || flyToCommand.nonce === lastFlyNonceRef.current) return;
    lastFlyNonceRef.current = flyToCommand.nonce;
    const c = camRef.current;
    const effMaxSpan = getEffectiveMaxSpan();
    c.targetX = flyToCommand.x;
    c.targetZ = flyToCommand.z;
    if (typeof flyToCommand.spanM === 'number') {
      c.targetSpan = Math.max(minSpanM, Math.min(effMaxSpan, flyToCommand.spanM));
    }
    c.vx = 0;
    c.vz = 0;
    c.dirty = true;
    c.detailNeedsBake = true;
    c.lastInteractionMs = performance.now();
  }, [flyToCommand, minSpanM, getEffectiveMaxSpan]);

  // Keep latest props in refs so our 60-120fps render loop never needs React effect teardown
  const propsRef = useRef({
    structures,
    units,
    players,
    myPlayerId,
    activeClimate,
    mode,
    waypoints,
    leadDispatchUnit,
    onChangeView,
    onClickWorld,
    onDoubleClickWorld,
    onRightClickWorld,
    onHoverWorldChange,
    onZoomBelowThreshold,
    zoomInto3DThresholdM,
    minSpanM,
    maxSpanM,
    isActive,
    enableKeyboardNav,
    onRequestClose,
    showInternalTelemetry,
  });
  propsRef.current = {
    structures,
    units,
    players,
    myPlayerId,
    activeClimate,
    mode,
    waypoints,
    leadDispatchUnit,
    onChangeView,
    onClickWorld,
    onDoubleClickWorld,
    onRightClickWorld,
    onHoverWorldChange,
    onZoomBelowThreshold,
    zoomInto3DThresholdM,
    minSpanM,
    maxSpanM,
    isActive,
    enableKeyboardNav,
    onRequestClose,
    showInternalTelemetry,
  };

  // Friendly vision circles: skip completely when map is closed!
  const friendlyObservers = useMemo(() => {
    if (!isActive) return [];
    const list: Array<{ x: number; z: number; r: number; priority: number }> = [];
    Object.values(structures).forEach((s) => {
      if (s.ownerId !== myPlayerId) return;
      const r = getStructureVisionRadius(
        s.kind,
        s.level,
        getEffectiveClimateAt(s.x, s.z, activeClimate)
      );
      const priority = s.kind === 'watchtower' ? 0 : s.kind === 'keep' ? 1 : 2;
      list.push({ x: s.x, z: s.z, r, priority });
    });
    Object.values(units).forEach((u) => {
      if (u.ownerId !== myPlayerId) return;
      const r = getUnitVisionRadius(
        u.kind,
        getEffectiveClimateAt(u.x, u.z, activeClimate)
      );
      list.push({ x: u.x, z: u.z, r, priority: u.kind === 'commander' ? 1 : 3 });
    });
    list.sort((a, b) => a.priority - b.priority);
    return list;
  }, [isActive, structures, units, myPlayerId, activeClimate]);

  const friendlyObserversRef = useRef(friendlyObservers);
  friendlyObserversRef.current = friendlyObservers;

  // Mark canvas dirty whenever entities, climate, mode, or waypoints change
  useEffect(() => {
    camRef.current.dirty = true;
  }, [isActive, sizePx, structures, units, players, activeClimate, mode, waypoints, leadDispatchUnit, friendlyObservers, hoverLandmark, selectedLandmark]);

  const isInsideFriendlySight = useCallback((wx: number, wz: number) => {
    const obs = friendlyObserversRef.current;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      const dx = wx - o.x;
      const dz = wz - o.z;
      if (dx * dx + dz * dz <= o.r * o.r) return true;
    }
    return false;
  }, []);

  const clampCenter = useCallback((cx: number, cz: number) => {
    const maxBound = WORLD_HALF_SIZE * 0.94;
    return {
      x: Math.max(-maxBound, Math.min(maxBound, cx)),
      z: Math.max(-maxBound, Math.min(maxBound, cz)),
    };
  }, []);

  // Measure container size (including orientation changes & when map toggles active on mobile)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(120, Math.round(rect.width || el.clientWidth));
      const h = Math.max(120, Math.round(rect.height || el.clientHeight));
      sizePxRef.current = { w, h };
      setSizePx((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      // Clamp span if orientation switched to portrait so map never shrinks into voids
      const effMax = getEffectiveMaxSpan();
      const c = camRef.current;
      if (c.targetSpan > effMax) {
        c.targetSpan = effMax;
        c.span = Math.min(c.span, effMax);
      }
      c.dirty = true;
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
    };
  }, [getEffectiveMaxSpan]);

  // Immediately re-measure & kick WebGL2 when becoming active (mobile browsers skip layout events while hidden)
  useEffect(() => {
    if (!isActive) return;
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const w = Math.max(120, Math.round(rect.width || el.clientWidth));
      const h = Math.max(120, Math.round(rect.height || el.clientHeight));
      sizePxRef.current = { w, h };
      setSizePx((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      const effMax = getEffectiveMaxSpan();
      const c = camRef.current;
      if (c.targetSpan > effMax) {
        c.targetSpan = effMax;
        c.span = Math.min(c.span, effMax);
      }
      c.dirty = true;
    }
    if (!glStateRef.current) {
      ensureGlInitRef.current?.();
    }
  }, [isActive, getEffectiveMaxSpan]);

  // Helper: Bake any rectangular world window into an FBO target using 2x2 scissor-tiled passes
  // (Prevents mobile GPU TDR / watchdog stalls when baking the full procedural relief shader)
  const bakeTerrainIntoTarget = useCallback(
    (
      st: GlEngineState,
      target: { fbo: WebGLFramebuffer; size: number },
      centerX: number,
      centerZ: number,
      spanX: number,
      spanZ: number
    ) => {
      const { gl, bakeProgram, vao, bakeLocs } = st;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.size, target.size);
      gl.useProgram(bakeProgram);
      gl.bindVertexArray(vao);
      gl.uniform2f(bakeLocs.uBakeCenter, centerX, centerZ);
      gl.uniform2f(bakeLocs.uBakeSpanXZ, spanX, spanZ);
      gl.uniform1f(bakeLocs.uBakeMetersPerPx, Math.max(spanX, spanZ) / target.size);

      const half = Math.ceil(target.size / 2);
      gl.enable(gl.SCISSOR_TEST);
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          const sx = tx * half;
          const sy = ty * half;
          const sw = Math.min(half, target.size - sx);
          const sh = Math.min(half, target.size - sy);
          if (sw <= 0 || sh <= 0) continue;
          gl.scissor(sx, sy, sw, sh);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.flush();
        }
      }
      gl.disable(gl.SCISSOR_TEST);

      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    []
  );

  // Initialize WebGL2 Dual-Pass Pipeline & Bake the 2048x2048 World Atlas Texture ONCE
  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let initTimer: number | undefined;

    const initGl = () => {
      if (cancelled || glStateRef.current) return;
      const gl = canvas.getContext('webgl2', {
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      });
      if (!gl) return;

      const bakeProgram = linkProgram(gl, VERTEX_SHADER_SRC, TERRAIN_BAKE_FRAG_SRC);
      const compProgram = linkProgram(gl, VERTEX_SHADER_SRC, COMPOSITE_FRAG_SRC);
      if (!bakeProgram || !compProgram) return;

      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      if (!vao || !vbo) return;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      // Upload static world geometry uniforms ONCE to bakeProgram
      gl.useProgram(bakeProgram);
      gl.uniform1f(gl.getUniformLocation(bakeProgram, 'uWorldHalfSize'), WORLD_HALF_SIZE);

      const lobeCount = Math.min(21, CONTINENT_LOBES.length);
      const lobePosRotArr = new Float32Array(21 * 4);
      const lobeRadiiArr = new Float32Array(21 * 2);
      for (let i = 0; i < lobeCount; i++) {
        const lb = CONTINENT_LOBES[i];
        lobePosRotArr[i * 4] = lb.cx;
        lobePosRotArr[i * 4 + 1] = lb.cz;
        lobePosRotArr[i * 4 + 2] = Math.cos(lb.rotRad);
        lobePosRotArr[i * 4 + 3] = Math.sin(lb.rotRad);
        lobeRadiiArr[i * 2] = lb.rx;
        lobeRadiiArr[i * 2 + 1] = lb.rz;
      }
      gl.uniform1i(gl.getUniformLocation(bakeProgram, 'uLobeCount'), lobeCount);
      gl.uniform4fv(gl.getUniformLocation(bakeProgram, 'uLobePosRot[0]'), lobePosRotArr);
      gl.uniform2fv(gl.getUniformLocation(bakeProgram, 'uLobeRadii[0]'), lobeRadiiArr);

      const spineCount = Math.min(8, MOUNTAIN_SPINES.length);
      const spineArr = new Float32Array(8 * 4);
      for (let i = 0; i < spineCount; i++) {
        const sp = MOUNTAIN_SPINES[i];
        spineArr[i * 4] = sp.ax;
        spineArr[i * 4 + 1] = sp.az;
        spineArr[i * 4 + 2] = sp.bx;
        spineArr[i * 4 + 3] = sp.bz;
      }
      gl.uniform1i(gl.getUniformLocation(bakeProgram, 'uSpineCount'), spineCount);
      gl.uniform4fv(gl.getUniformLocation(bakeProgram, 'uMountainSpines[0]'), spineArr);

      const aridCount = Math.min(6, ARID_POCKETS.length);
      const aridArr = new Float32Array(6 * 4);
      for (let i = 0; i < aridCount; i++) {
        const ap = ARID_POCKETS[i];
        aridArr[i * 4] = ap.x;
        aridArr[i * 4 + 1] = ap.z;
        aridArr[i * 4 + 2] = ap.radius;
        aridArr[i * 4 + 3] = ap.intensity;
      }
      gl.uniform1i(gl.getUniformLocation(bakeProgram, 'uAridCount'), aridCount);
      gl.uniform4fv(gl.getUniformLocation(bakeProgram, 'uAridPockets[0]'), aridArr);

      const plateauCount = Math.min(40, SPAWN_PLATEAUS.length);
      const platArr = new Float32Array(40 * 4);
      for (let i = 0; i < plateauCount; i++) {
        const sp = SPAWN_PLATEAUS[i];
        platArr[i * 4] = sp.x;
        platArr[i * 4 + 1] = sp.z;
        platArr[i * 4 + 2] = sp.radius;
        platArr[i * 4 + 3] = sp.targetElevation;
      }
      gl.uniform1i(gl.getUniformLocation(bakeProgram, 'uPlateauCount'), plateauCount);
      gl.uniform4fv(gl.getUniformLocation(bakeProgram, 'uPlateaus[0]'), platArr);

      const riverCount = Math.min(24, RIVER_SEGMENTS.length);
      const riverArr = new Float32Array(24 * 4);
      for (let i = 0; i < riverCount; i++) {
        const rs = RIVER_SEGMENTS[i];
        riverArr[i * 4] = rs.ax;
        riverArr[i * 4 + 1] = rs.az;
        riverArr[i * 4 + 2] = rs.bx;
        riverArr[i * 4 + 3] = rs.bz;
      }
      gl.uniform1i(gl.getUniformLocation(bakeProgram, 'uRiverSegmentCount'), riverCount);
      gl.uniform4fv(gl.getUniformLocation(bakeProgram, 'uRiverSegments[0]'), riverArr);

      const wfArr = new Float32Array(16);
      const wfMetaArr = new Float32Array(16);
      for (let i = 0; i < Math.min(4, WATERFALL_SITES.length); i++) {
        const wf = WATERFALL_SITES[i];
        wfArr[i * 4] = wf.cliffX;
        wfArr[i * 4 + 1] = wf.cliffZ;
        wfArr[i * 4 + 2] = wf.flowDirX;
        wfArr[i * 4 + 3] = wf.flowDirZ;
        wfMetaArr[i * 4] = wf.topY;
        wfMetaArr[i * 4 + 1] = wf.bottomY;
        wfMetaArr[i * 4 + 2] = wf.width;
        wfMetaArr[i * 4 + 3] = 0;
      }
      gl.uniform4fv(gl.getUniformLocation(bakeProgram, 'uWaterfalls[0]'), wfArr);
      gl.uniform4fv(gl.getUniformLocation(bakeProgram, 'uWaterfallMeta[0]'), wfMetaArr);

      gl.useProgram(compProgram);
      gl.uniform1f(gl.getUniformLocation(compProgram, 'uWorldHalfSize'), WORLD_HALF_SIZE);

      // Allocate Full-World Atlas FBO + Local Detail FBO (mobile-safe resolution to avoid GPU memory/TDR limits)
      const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
      const isMobileGpu =
        typeof window !== 'undefined' &&
        (Math.min(window.innerWidth, window.innerHeight) < 768 || (navigator.maxTouchPoints ?? 0) > 0);
      const worldSize = Math.min(isMobileGpu ? 1024 : 2048, maxTexSize);
      const detailSize = Math.min(isMobileGpu ? 512 : 1024, maxTexSize);
      const worldTarget = createRenderTarget(gl, worldSize);
      const detailTarget = createRenderTarget(gl, detailSize);
      if (!worldTarget || !detailTarget) return;

      const st: GlEngineState = {
        gl,
        bakeProgram,
        compProgram,
        vao,
        vbo,
        worldTarget,
        detailTarget,
        detailBounds: { minX: 0, minZ: 0, spanX: 0, spanZ: 0, valid: false },
        bakeLocs: {
          uBakeCenter: gl.getUniformLocation(bakeProgram, 'uBakeCenter'),
          uBakeSpanXZ: gl.getUniformLocation(bakeProgram, 'uBakeSpanXZ'),
          uBakeMetersPerPx: gl.getUniformLocation(bakeProgram, 'uBakeMetersPerPx'),
        },
        compLocs: {
          uWorldTex: gl.getUniformLocation(compProgram, 'uWorldTex'),
          uDetailTex: gl.getUniformLocation(compProgram, 'uDetailTex'),
          uDetailBounds: gl.getUniformLocation(compProgram, 'uDetailBounds'),
          uDetailBlend: gl.getUniformLocation(compProgram, 'uDetailBlend'),
          uViewCenter: gl.getUniformLocation(compProgram, 'uViewCenter'),
          uViewSpanXZ: gl.getUniformLocation(compProgram, 'uViewSpanXZ'),
          uViewportPx: gl.getUniformLocation(compProgram, 'uViewportPx'),
          uClimateMode: gl.getUniformLocation(compProgram, 'uClimateMode'),
          uObserverCount: gl.getUniformLocation(compProgram, 'uObserverCount'),
          uObservers: gl.getUniformLocation(compProgram, 'uObservers[0]'),
        },
      };

      // Bake the entire 100x100 km Thar Ahmad Atlas ONCE!
      bakeTerrainIntoTarget(st, worldTarget, 0, 0, WORLD_MAP_SIZE, WORLD_MAP_SIZE);

      glStateRef.current = st;
      camRef.current.dirty = true;
    };

    ensureGlInitRef.current = initGl;
    initTimer = window.setTimeout(initGl, isActive ? 0 : 320);

    const handleLost = (e: Event) => {
      e.preventDefault();
      glStateRef.current = null;
    };
    const handleRestored = () => initGl();
    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);

    return () => {
      cancelled = true;
      ensureGlInitRef.current = null;
      if (initTimer) clearTimeout(initTimer);
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
      const st = glStateRef.current;
      if (st) {
        st.gl.deleteTexture(st.worldTarget.tex);
        st.gl.deleteFramebuffer(st.worldTarget.fbo);
        st.gl.deleteTexture(st.detailTarget.tex);
        st.gl.deleteFramebuffer(st.detailTarget.fbo);
        st.gl.deleteVertexArray(st.vao);
        st.gl.deleteBuffer(st.vbo);
        st.gl.deleteProgram(st.bakeProgram);
        st.gl.deleteProgram(st.compProgram);
        glStateRef.current = null;
      }
    };
  }, [bakeTerrainIntoTarget]);

  // Helper: Draw a single frame (Ultra-Fast GPU Composite + Crisp Vector Cartography)
  const renderFrame = useCallback(() => {
    const p = propsRef.current;
    if (!p.isActive) return;

    const sz = sizePxRef.current;
    const aspect = Math.max(0.25, sz.w / Math.max(1, sz.h));
    const c = camRef.current;
    const spanX = aspect >= 1 ? c.span * aspect : c.span;
    const spanZ = aspect >= 1 ? c.span : c.span / aspect;

    // 1) ULTRA-FAST WEBGL2 COMPOSITE PASS (<0.2ms!)
    const glCanvas = glCanvasRef.current;
    if (!glStateRef.current) ensureGlInitRef.current?.();
    const st = glStateRef.current;
    if (glCanvas && st) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const physW = Math.max(1, Math.round(sz.w * dpr));
      const physH = Math.max(1, Math.round(sz.h * dpr));
      if (glCanvas.width !== physW || glCanvas.height !== physH) {
        glCanvas.width = physW;
        glCanvas.height = physH;
      }

      const { gl, compProgram, vao, compLocs, worldTarget, detailTarget, detailBounds } = st;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, physW, physH);
      gl.useProgram(compProgram);
      gl.bindVertexArray(vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, worldTarget.tex);
      gl.uniform1i(compLocs.uWorldTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, detailTarget.tex);
      gl.uniform1i(compLocs.uDetailTex, 1);

      const useDetail = detailBounds.valid && c.span < 28_000;
      const detailBlend = useDetail ? Math.max(0, Math.min(1, (28_000 - c.span) / 9_000)) : 0;
      gl.uniform4f(
        compLocs.uDetailBounds,
        detailBounds.minX,
        detailBounds.minZ,
        detailBounds.spanX,
        detailBounds.spanZ
      );
      gl.uniform1f(compLocs.uDetailBlend, detailBlend);

      gl.uniform2f(compLocs.uViewCenter, c.x, c.z);
      gl.uniform2f(compLocs.uViewSpanXZ, spanX, spanZ);
      gl.uniform2f(compLocs.uViewportPx, physW, physH);
      const climIdx =
        p.activeClimate === 'northern_blizzard'
          ? 1
          : p.activeClimate === 'desert_sandstorm'
            ? 2
            : p.activeClimate === 'monsoon_rain'
              ? 3
              : 0;
      gl.uniform1i(compLocs.uClimateMode, climIdx);

      const obsList = friendlyObserversRef.current;
      const obsCount = Math.min(48, obsList.length);
      const obsArr = obsArrBufRef.current;
      for (let i = 0; i < obsCount; i++) {
        const o = obsList[i];
        obsArr[i * 3] = o.x;
        obsArr[i * 3 + 1] = o.z;
        obsArr[i * 3 + 2] = o.r;
      }
      gl.uniform1i(compLocs.uObserverCount, obsCount);
      gl.uniform3fv(compLocs.uObservers, obsArr);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }

    // 2) CRISP RETINA 2D CARTOGRAPHY OVERLAY
    const vecCanvas = vectorCanvasRef.current;
    if (!vecCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const physW = Math.max(1, Math.round(sz.w * dpr));
    const physH = Math.max(1, Math.round(sz.h * dpr));
    if (vecCanvas.width !== physW || vecCanvas.height !== physH) {
      vecCanvas.width = physW;
      vecCanvas.height = physH;
    }
    const ctx = vecCanvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sz.w, sz.h);

    const minWX = c.x - spanX * 0.5;
    const minWZ = c.z - spanZ * 0.5;
    const metersPerPxCss = spanX / Math.max(1, sz.w);
    const worldToPx = (wx: number, wz: number) => ({
      x: ((wx - minWX) / spanX) * sz.w,
      y: ((wz - minWZ) / spanZ) * sz.h,
    });

    // Fallback relief grid only if WebGL2 unavailable
    if (!st) {
      const cellPx = 10;
      for (let py = 0; py < sz.h; py += cellPx) {
        const wz = minWZ + ((py + cellPx * 0.5) / sz.h) * spanZ;
        for (let px = 0; px < sz.w; px += cellPx) {
          const wx = minWX + ((px + cellPx * 0.5) / sz.w) * spanX;
          const h = getTerrainHeight(wx, wz);
          if (h < WATER_LEVEL_Y) {
            ctx.fillStyle = h < -1.5 ? '#10293d' : '#1f5469';
          } else {
            const b = getBiomeAt(wx, wz);
            const snowLine = getSnowlineElevationAt(wx, wz);
            ctx.fillStyle =
              b === 'northern_peaks'
                ? h > snowLine
                  ? '#e6e3dc'
                  : '#7a7570'
                : b === 'southern_dunes'
                  ? '#caa86f'
                  : b === 'western_forest'
                    ? '#305435'
                    : b === 'eastern_basalt'
                      ? '#6b5c50'
                      : b === 'river_basin' || b === 'waterfall_gorge'
                        ? '#3d7b4a'
                        : '#6b844e';
          }
          ctx.fillRect(px, py, cellPx + 0.5, cellPx + 0.5);
        }
      }
    }

    // A. Subtle Cartographic Coordinate Graticule (Antique Brass Hairlines)
    const isCompact = sz.w < 560 || sz.h < 460;
    const topSafeY = isCompact ? 108 : 88;
    const bottomSafeY = isCompact ? 42 : 44;
    const gridStep = pickAdaptiveGridStepM(c.span);
    const startGX = Math.ceil(minWX / gridStep) * gridStep;
    const endGX = minWX + spanX;
    const startGZ = Math.ceil(minWZ / gridStep) * gridStep;
    const endGZ = minWZ + spanZ;

    ctx.save();
    ctx.strokeStyle = 'rgba(222, 192, 134, 0.11)';
    ctx.lineWidth = 1;
    ctx.font = isCompact
      ? '600 8.5px ui-monospace, monospace'
      : '600 9.5px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(245, 224, 178, 0.48)';

    for (let gx = startGX; gx <= endGX; gx += gridStep) {
      const px = ((gx - minWX) / spanX) * sz.w;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, sz.h);
      ctx.stroke();
      if (!isCompact && px > 54 && px < sz.w - 54) {
        ctx.textAlign = 'center';
        ctx.fillText(formatWorldCoordKm(gx), px, sz.h - 6);
      }
    }
    for (let gz = startGZ; gz <= endGZ; gz += gridStep) {
      const py = ((gz - minWZ) / spanZ) * sz.h;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(sz.w, py);
      ctx.stroke();
      if (py > topSafeY && py < sz.h - bottomSafeY) {
        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
        const kmVal = Math.abs(gz) >= 1000 ? `${Math.round(gz / 1000)}km` : `${Math.round(gz)}m`;
        ctx.fillText(isCompact ? kmVal : formatWorldCoordKm(gz), 8, py - 4);
      }
    }

    // Engraved double-line world frame at +/- 50 km
    const tlB = worldToPx(-WORLD_HALF_SIZE, -WORLD_HALF_SIZE);
    const brB = worldToPx(WORLD_HALF_SIZE, WORLD_HALF_SIZE);
    ctx.strokeStyle = 'rgba(218, 179, 108, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(tlB.x, tlB.y, brB.x - tlB.x, brB.y - tlB.y);
    ctx.restore();

    // B. Antique Hand-Inked Caravan & Royal Highways (double-stroked sepia + warm ochre)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const roadWidth = c.span < 16_000 ? 3.0 : c.span < 45_000 ? 2.1 : 1.4;
    const drawRoadPaths = () => {
      STRATEGIC_ROADS.forEach((road) => {
        // Quick viewport cull
        const rMinX = Math.min(road.ax, road.bx) - 400;
        const rMaxX = Math.max(road.ax, road.bx) + 400;
        const rMinZ = Math.min(road.az, road.bz) - 400;
        const rMaxZ = Math.max(road.az, road.bz) + 400;
        if (rMaxX < minWX || rMinX > minWX + spanX || rMaxZ < minWZ || rMinZ > minWZ + spanZ) return;

        ctx.beginPath();
        const steps = 10;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const lx = road.ax + (road.bx - road.ax) * t;
          const lz = road.az + (road.bz - road.az) * t;
          const taper = Math.sin(t * Math.PI);
          const wx = lx - Math.sin(lz * 0.00055) * 180 * taper;
          const wz = lz - Math.cos(lx * 0.00055) * 180 * taper;
          const pt = worldToPx(wx, wz);
          if (s === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      });
    };
    ctx.strokeStyle = 'rgba(34, 21, 10, 0.52)';
    ctx.lineWidth = roadWidth + 1.4;
    ctx.setLineDash([]);
    drawRoadPaths();
    ctx.strokeStyle = 'rgba(232, 198, 128, 0.72)';
    ctx.lineWidth = roadWidth * 0.78;
    ctx.setLineDash([6, 4]);
    drawRoadPaths();
    ctx.restore();

    // C. Regional Water & Territory Cartographic Titles (Sea, Desert, Rivers, Ranges)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    REGION_WATERMARKS.forEach((rw) => {
      if (c.span < rw.minSpan || c.span > rw.maxSpan) return;
      const pt = worldToPx(rw.x, rw.z);
      if (pt.x < -80 || pt.x > sz.w + 80 || pt.y < -40 || pt.y > sz.h + 40) return;

      const fontSize = isCompact
        ? rw.kind === 'sea'
          ? 12
          : rw.kind === 'desert'
            ? 10.5
            : 10
        : rw.kind === 'sea'
          ? 15
          : rw.kind === 'desert'
            ? 13
            : 12;
      ctx.font = `700 ${fontSize}px "Amiri", "Noto Naskh Arabic", Georgia, serif`;
      if (rw.kind === 'sea') {
        drawOutlinedText(ctx, rw.labelAr, pt.x, pt.y, 'rgba(186, 224, 238, 0.74)', 'rgba(8, 22, 34, 0.72)', 3.0);
      } else if (rw.kind === 'desert') {
        drawOutlinedText(ctx, rw.labelAr, pt.x, pt.y, 'rgba(247, 226, 178, 0.68)', 'rgba(42, 26, 10, 0.66)', 2.8);
      } else if (rw.kind === 'mountain') {
        drawOutlinedText(ctx, rw.labelAr, pt.x, pt.y, 'rgba(226, 224, 218, 0.66)', 'rgba(26, 22, 18, 0.72)', 2.8);
      } else {
        drawOutlinedText(ctx, rw.labelAr, pt.x, pt.y, 'rgba(235, 226, 198, 0.65)', 'rgba(24, 18, 10, 0.66)', 2.8);
      }
    });
    ctx.restore();

    // D. Secondary Towns / Emirates (revealed cleanly when zoomed inside 44 km!)
    if (c.span < 44_000) {
      ctx.save();
      ctx.font = '600 10px "Tajawal", sans-serif';
      ctx.textAlign = 'center';
      const secondaryAlpha = Math.min(1, (44_000 - c.span) / 16_000);
      SPAWN_PLATEAUS.forEach((sp, idx) => {
        if (idx < 6) return; // Primary 6 rendered as rich capitals via MACRO_LANDMARKS
        const pt = worldToPx(sp.x, sp.z);
        if (pt.x < -30 || pt.x > sz.w + 30 || pt.y < -30 || pt.y > sz.h + 30) return;

        ctx.globalAlpha = secondaryAlpha * 0.9;
        ctx.fillStyle = '#e7c982';
        ctx.strokeStyle = '#1e140a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (c.span < 28_000) {
          const shortTown = sp.continentNameAr.split(' (')[0];
          drawOutlinedText(ctx, shortTown, pt.x, pt.y - 9, 'rgba(245, 232, 200, 0.88)', 'rgba(16, 11, 6, 0.86)', 2.6);
        }
      });
      ctx.restore();
    }

    // E. Stone River Bridges (when zoomed below 34 km)
    if (c.span < 34_000) {
      ctx.save();
      const bW = Math.max(2.2, Math.min(6, (22 / spanX) * sz.w));
      BRIDGE_CROSSINGS.forEach((bc) => {
        const halfL = Math.max(bc.length * 0.55, metersPerPxCss * 4.5);
        const dx = Math.sin(bc.rotationY) * halfL;
        const dz = Math.cos(bc.rotationY) * halfL;
        const p1 = worldToPx(bc.x - dx, bc.z - dz);
        const p2 = worldToPx(bc.x + dx, bc.z + dz);
        if (p1.x < -20 || p1.x > sz.w + 20 || p1.y < -20 || p1.y > sz.h + 20) return;
        ctx.strokeStyle = '#24180d';
        ctx.lineWidth = bW + 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.strokeStyle = '#efe2c6';
        ctx.lineWidth = bW;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
      ctx.restore();
    }

    // F. Tactical Sight Perimeter Rings (restrained dashed brass rings when zoomed below 55 km)
    const obsList = friendlyObserversRef.current;
    if (c.span < 55_000 && obsList.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 204, 110, 0.42)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      obsList.forEach((o) => {
        if (o.priority > 1 && c.span > 22_000) return;
        const pt = worldToPx(o.x, o.z);
        const rPx = (o.r / spanX) * sz.w;
        if (rPx < 3 || pt.x < -rPx || pt.x > sz.w + rPx || pt.y < -rPx || pt.y > sz.h + rPx) return;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, rPx, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    // G. Decluttered Heraldic Capitals & Major Landmarks (clean halo text, zero ugly boxes!)
    ctx.save();
    ctx.textAlign = 'center';
    const placedBoxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    const sortedLandmarks = [...MACRO_LANDMARKS].sort((a, b) => a.priority - b.priority);
    const activeHoverLm = hoverLandmarkRef.current;

    sortedLandmarks.forEach((lm) => {
      if (c.span > (isCompact ? 46_000 : 64_000) && lm.priority > 1) return;
      if (c.span > (isCompact ? 24_000 : 32_000) && lm.priority > 2) return;
      const pt = worldToPx(lm.x, lm.z);
      if (pt.x < 18 || pt.x > sz.w - 18 || pt.y < 18 || pt.y > sz.h - 18) return;

      const isHovered = activeHoverLm?.id === lm.id;
      const isPrimary = lm.priority === 1;

      // Crisp category-coded heraldic marker
      if (lm.category === 'forest') {
        const r = isHovered ? 5.6 : isCompact ? 3.8 : 4.2;
        ctx.fillStyle = isHovered ? '#6ee7b7' : '#34a86e';
        ctx.strokeStyle = '#0c1f14';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - r * 1.2);
        ctx.lineTo(pt.x + r, pt.y + r * 0.8);
        ctx.lineTo(pt.x - r, pt.y + r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (lm.category === 'capital_zone' || lm.category === 'port') {
        const r = isHovered ? 6.5 : isPrimary ? (isCompact ? 4.6 : 5.2) : (isCompact ? 3.8 : 4.2);
        if (isHovered || isPrimary) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r + 3.0, 0, Math.PI * 2);
          ctx.strokeStyle = isHovered ? 'rgba(253, 224, 71, 0.85)' : 'rgba(234, 190, 96, 0.45)';
          ctx.lineWidth = isHovered ? 1.8 : 1.1;
          ctx.stroke();
        }
        ctx.fillStyle = lm.category === 'port' ? '#7dd3fc' : '#f6c85f';
        ctx.strokeStyle = '#1b1106';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Inner citadel dot
        ctx.fillStyle = '#241406';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * 0.36, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = isHovered ? 5.8 : isCompact ? 4.0 : 4.6;
        ctx.fillStyle = lm.category === 'peak' ? '#d6d3d1' : lm.category === 'pass' ? '#fbbf24' : '#93c5fd';
        ctx.strokeStyle = '#1b1106';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - r);
        ctx.lineTo(pt.x + r * 0.9, pt.y);
        ctx.lineTo(pt.x, pt.y + r);
        ctx.lineTo(pt.x - r * 0.9, pt.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      const label = lm.nameAr.split(' (')[0];
      ctx.font = isPrimary
        ? isCompact
          ? '700 10.5px "Amiri", "Tajawal", sans-serif'
          : '700 12px "Amiri", "Tajawal", sans-serif'
        : isCompact
          ? '600 9.5px "Tajawal", sans-serif'
          : '600 10.5px "Tajawal", sans-serif';
      const tw = ctx.measureText(label).width + 8;
      const box = {
        x0: pt.x - tw / 2 - 4,
        y0: pt.y - (isCompact ? 21 : 24),
        x1: pt.x + tw / 2 + 4,
        y1: pt.y - 7,
      };
      const overlaps =
        !isHovered &&
        placedBoxes.some(
          (b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1)
        );
      if (overlaps) return;
      placedBoxes.push(box);

      const textCol =
        isHovered
          ? '#ffffff'
          : lm.category === 'forest'
            ? '#a7f3d0'
            : isPrimary
              ? '#fff3cf'
              : '#e7d6b2';
      drawOutlinedText(ctx, label, pt.x, pt.y - (isCompact ? 10 : 11), textCol, 'rgba(15, 10, 5, 0.92)', isPrimary ? 3.5 : 2.8);
    });
    ctx.restore();

    const playersById = new Map<string, PlayerState>();
    for (const plr of p.players) playersById.set(plr.id, plr);

    // H. Structures (own always visible; enemies only inside friendly live sight!)
    const structPxSize = c.span < 8_000 ? 9.5 : c.span < 30_000 ? 8 : 6.5;
    Object.values(p.structures).forEach((s) => {
      if (s.ownerId !== p.myPlayerId && !isInsideFriendlySight(s.x, s.z)) return;
      const pt = worldToPx(s.x, s.z);
      if (pt.x < -16 || pt.x > sz.w + 16 || pt.y < -16 || pt.y > sz.h + 16) return;

      const owner = playersById.get(s.ownerId);
      const isBanditCamp = Boolean(owner?.isBandit || owner?.isAi);
      const isMyKeep = s.ownerId === p.myPlayerId && s.kind === 'keep';

      if (isMyKeep) {
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, structPxSize + 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = s.ownerColor;
      ctx.strokeStyle = isBanditCamp ? '#09090b' : '#fffbeb';
      ctx.lineWidth = 1.4;
      const szBox = s.kind === 'keep' || s.kind === 'watchtower' ? structPxSize + 2.5 : structPxSize;
      ctx.fillRect(pt.x - szBox / 2, pt.y - szBox / 2, szBox, szBox);
      ctx.strokeRect(pt.x - szBox / 2, pt.y - szBox / 2, szBox, szBox);

      if (isBanditCamp && s.kind === 'keep') {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, szBox * 1.0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });

    // I. Units + Active Expedition Waypoint Paths
    const unitPxR = c.span < 8_000 ? 4.4 : 3.3;
    Object.values(p.units).forEach((u) => {
      if (u.ownerId !== p.myPlayerId && !isInsideFriendlySight(u.x, u.z)) return;
      const pt = worldToPx(u.x, u.z);
      if (u.waypoints && u.waypoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        u.waypoints.forEach((wp) => {
          const wpPx = worldToPx(wp.x, wp.z);
          ctx.lineTo(wpPx.x, wpPx.y);
        });
        ctx.stroke();
        ctx.restore();
      }
      if (pt.x < -8 || pt.x > sz.w + 8 || pt.y < -8 || pt.y > sz.h + 8) return;
      ctx.fillStyle = u.ownerColor;
      ctx.strokeStyle = '#090603';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, unitPxR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // J. Planned March Route Preview
    if (p.leadDispatchUnit && p.waypoints.length > 0) {
      ctx.save();
      const startPx = worldToPx(p.leadDispatchUnit.x, p.leadDispatchUnit.z);
      ctx.strokeStyle = 'rgba(20, 12, 5, 0.75)';
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(startPx.x, startPx.y);
      p.waypoints.forEach((wp) => {
        const wPx = worldToPx(wp.x, wp.z);
        ctx.lineTo(wPx.x, wPx.y);
      });
      ctx.stroke();

      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(startPx.x, startPx.y);
      p.waypoints.forEach((wp) => {
        const wPx = worldToPx(wp.x, wp.z);
        ctx.lineTo(wPx.x, wPx.y);
      });
      ctx.stroke();

      p.waypoints.forEach((wp, idx) => {
        const wPx = worldToPx(wp.x, wp.z);
        ctx.fillStyle = idx === p.waypoints.length - 1 ? '#22c55e' : '#facc15';
        ctx.beginPath();
        ctx.arc(wPx.x, wPx.y, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1b1106';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      });
      ctx.restore();
    }

    // K. Active Player 3D Camera Viewport Frame
    p.players.forEach((plr) => {
      if (!plr.camera) return;
      const isMe = plr.id === p.myPlayerId;
      if (!isMe && !isInsideFriendlySight(plr.camera.targetX, plr.camera.targetZ)) return;
      const cp = worldToPx(plr.camera.targetX, plr.camera.targetZ);
      const camSpanW = Math.max(12, (((plr.camera.zoom ?? 40) * 2.1) / spanX) * sz.w);
      const camSpanH = Math.max(8, camSpanW * 0.62);
      ctx.save();
      ctx.strokeStyle = isMe ? '#fff7d6' : plr.color;
      ctx.lineWidth = isMe ? 1.8 : 1.4;
      ctx.strokeRect(cp.x - camSpanW / 2, cp.y - camSpanH / 2, camSpanW, camSpanH);
      if (isMe) {
        ctx.fillStyle = 'rgba(255, 247, 214, 0.14)';
        ctx.fillRect(cp.x - camSpanW / 2, cp.y - camSpanH / 2, camSpanW, camSpanH);
      }
      ctx.restore();
    });

    // L. Engraved Brass Scale Bar & North Compass Rose (Bottom-Left, mobile-compact & march-dock safe)
    if (sz.w > 220 && sz.h > 170 && !(isCompact && p.mode === 'march')) {
      const barM = pickScaleBarMeters(metersPerPxCss);
      const maxBarPx = isCompact ? 64 : 130;
      const barPx = Math.max(26, Math.min(maxBarPx, barM / metersPerPxCss));
      const barLeft = isCompact ? 10 : 14;
      const barTop = isCompact ? sz.h - 14 : sz.h - 26;
      const boxH = isCompact ? 23 : 28;
      const boxTop = isCompact ? barTop - 16 : barTop - 19;
      const compassOffset = isCompact ? 17 : 22;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 11, 7, 0.80)';
      ctx.fillRect(barLeft - 5, boxTop, barPx + (isCompact ? 34 : 44), boxH);
      ctx.strokeStyle = 'rgba(202, 162, 92, 0.52)';
      ctx.lineWidth = 1;
      ctx.strokeRect(barLeft - 5, boxTop, barPx + (isCompact ? 34 : 44), boxH);

      ctx.fillStyle = '#e5be67';
      ctx.fillRect(barLeft, barTop, barPx * 0.5, 2.5);
      ctx.fillStyle = '#f5eedc';
      ctx.fillRect(barLeft + barPx * 0.5, barTop, barPx * 0.5, 2.5);

      ctx.font = isCompact
        ? '700 8.5px ui-monospace, monospace'
        : '700 9.5px ui-monospace, monospace';
      ctx.fillStyle = '#f6e4b8';
      ctx.textAlign = 'left';
      const barLabel = barM >= 1000 ? `${barM / 1000} كم` : `${barM} م`;
      ctx.fillText(barLabel, barLeft, barTop - 5);

      const cx = barLeft + barPx + compassOffset;
      const cy = barTop - (isCompact ? 3 : 4);
      const arrowH = isCompact ? 7.5 : 9;
      const arrowW = isCompact ? 3.2 : 4;
      ctx.fillStyle = '#f0c462';
      ctx.beginPath();
      ctx.moveTo(cx, cy - arrowH);
      ctx.lineTo(cx + arrowW, cy);
      ctx.lineTo(cx, cy - 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a8a29e';
      ctx.beginPath();
      ctx.moveTo(cx, cy - arrowH);
      ctx.lineTo(cx - arrowW, cy);
      ctx.lineTo(cx, cy - 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.font = isCompact ? '700 7.5px sans-serif' : '700 8.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f0c462';
      ctx.fillText('ش', cx, cy + (isCompact ? 6.5 : 8));
      ctx.restore();
    }
  }, [isInsideFriendlySight]);

  // Smooth 60-120 FPS Animation, Inertia, Keyboard Panning & On-Idle Detail Re-Bake Loop
  const keysDownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isActive) return;

    let rafId = 0;
    let lastTs = performance.now();
    let commitTimer = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const c = camRef.current;
      const p = propsRef.current;

      // Keyboard WASD / Arrow smooth pan
      if (p.enableKeyboardNav && keysDownRef.current.size > 0) {
        const panSpeed = c.span * 0.72 * dt;
        let dx = 0;
        let dz = 0;
        if (keysDownRef.current.has('KeyA') || keysDownRef.current.has('ArrowLeft')) dx -= panSpeed;
        if (keysDownRef.current.has('KeyD') || keysDownRef.current.has('ArrowRight')) dx += panSpeed;
        if (keysDownRef.current.has('KeyW') || keysDownRef.current.has('ArrowUp')) dz -= panSpeed;
        if (keysDownRef.current.has('KeyS') || keysDownRef.current.has('ArrowDown')) dz += panSpeed;
        if (dx !== 0 || dz !== 0) {
          const clamped = clampCenter(c.targetX + dx, c.targetZ + dz);
          c.targetX = clamped.x;
          c.targetZ = clamped.z;
          c.vx = 0;
          c.vz = 0;
          c.dirty = true;
          c.detailNeedsBake = true;
          c.lastInteractionMs = now;
        }
      }

      // Release inertia momentum glide
      if (!c.isDragging && (Math.abs(c.vx) > 2 || Math.abs(c.vz) > 2)) {
        const clamped = clampCenter(c.targetX + c.vx * dt, c.targetZ + c.vz * dt);
        c.targetX = clamped.x;
        c.targetZ = clamped.z;
        const dragFriction = Math.exp(-7.5 * dt);
        c.vx *= dragFriction;
        c.vz *= dragFriction;
        if (Math.abs(c.vx) < 2) c.vx = 0;
        if (Math.abs(c.vz) < 2) c.vz = 0;
        c.dirty = true;
        c.detailNeedsBake = true;
        c.lastInteractionMs = now;
      }

      // Smooth exponential damping toward target view (instant response while dragging)
      const ease = c.isDragging ? 1.0 : 1 - Math.exp(-13.5 * dt);
      const diffX = c.targetX - c.x;
      const diffZ = c.targetZ - c.z;
      const diffS = c.targetSpan - c.span;
      const isMoving =
        Math.abs(diffX) > 0.5 ||
        Math.abs(diffZ) > 0.5 ||
        Math.abs(diffS) > 0.5;

      if (isMoving) {
        c.x += diffX * ease;
        c.z += diffZ * ease;
        c.span += diffS * ease;
        c.dirty = true;
      } else if (c.x !== c.targetX || c.z !== c.targetZ || c.span !== c.targetSpan) {
        c.x = c.targetX;
        c.z = c.targetZ;
        c.span = c.targetSpan;
        c.dirty = true;
      }

      // Re-bake high-res 1024x1024 local detail tile ONLY when zoomed in & camera has settled ~130ms
      const st = glStateRef.current;
      if (
        st &&
        c.detailNeedsBake &&
        !c.isDragging &&
        !isMoving &&
        c.span < 28_000 &&
        now - c.lastInteractionMs > 130
      ) {
        const sz = sizePxRef.current;
        const aspect = Math.max(0.25, sz.w / Math.max(1, sz.h));
        const curSpanX = aspect >= 1 ? c.span * aspect : c.span;
        const curSpanZ = aspect >= 1 ? c.span : c.span / aspect;
        const padSpan = Math.min(Math.max(curSpanX, curSpanZ) * 1.32, 42_000);
        bakeTerrainIntoTarget(st, st.detailTarget, c.x, c.z, padSpan, padSpan);
        st.detailBounds = {
          minX: c.x - padSpan * 0.5,
          minZ: c.z - padSpan * 0.5,
          spanX: padSpan,
          spanZ: padSpan,
          valid: true,
        };
        c.detailNeedsBake = false;
        c.dirty = true;
      }

      if (c.dirty) {
        c.dirty = false;
        renderFrame();

        // Sync settled view back to React parent infrequently (never every frame!)
        const needCommit =
          Math.abs(c.x - c.lastCommittedX) > 40 ||
          Math.abs(c.z - c.lastCommittedZ) > 40 ||
          Math.abs(c.span - c.lastCommittedSpan) > 40;
        if (needCommit && !c.isDragging && !isMoving) {
          c.lastCommittedX = Math.round(c.x);
          c.lastCommittedZ = Math.round(c.z);
          c.lastCommittedSpan = Math.round(c.span);
          if (commitTimer) window.clearTimeout(commitTimer);
          commitTimer = window.setTimeout(() => {
            propsRef.current.onChangeView(
              { x: c.lastCommittedX, z: c.lastCommittedZ },
              c.lastCommittedSpan
            );
          }, 90);
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (commitTimer) window.clearTimeout(commitTimer);
    };
  }, [isActive, clampCenter, bakeTerrainIntoTarget, renderFrame]);

  // Keyboard shortcuts when full-screen strategic map is open
  useEffect(() => {
    if (!isActive || !enableKeyboardNav) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyM') {
        e.preventDefault();
        propsRef.current.onRequestClose?.();
        return;
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        const c = camRef.current;
        const nextSpan = c.targetSpan * 0.65;
        if (
          propsRef.current.zoomInto3DThresholdM &&
          nextSpan < propsRef.current.zoomInto3DThresholdM &&
          propsRef.current.onZoomBelowThreshold
        ) {
          propsRef.current.onZoomBelowThreshold(Math.round(c.targetX), Math.round(c.targetZ));
          return;
        }
        c.targetSpan = Math.max(propsRef.current.minSpanM, nextSpan);
        c.dirty = true;
        c.detailNeedsBake = true;
        c.lastInteractionMs = performance.now();
        return;
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        const c = camRef.current;
        c.targetSpan = Math.min(getEffectiveMaxSpan(), c.targetSpan * 1.5);
        c.dirty = true;
        c.detailNeedsBake = true;
        c.lastInteractionMs = performance.now();
        return;
      }
      if (e.code === 'Home' || e.code === 'Space') {
        e.preventDefault();
        const p = propsRef.current;
        const myKeep = Object.values(p.structures).find(
          (s) => s.ownerId === p.myPlayerId && s.kind === 'keep'
        );
        const c = camRef.current;
        c.targetX = myKeep?.x ?? SPAWN_PLATEAUS[4].x;
        c.targetZ = myKeep?.z ?? SPAWN_PLATEAUS[4].z;
        c.targetSpan = 16_000;
        c.vx = 0;
        c.vz = 0;
        c.dirty = true;
        c.detailNeedsBake = true;
        c.lastInteractionMs = performance.now();
        return;
      }
      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        keysDownRef.current.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.code);
    };
    const onBlur = () => keysDownRef.current.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      keysDownRef.current.clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isActive, enableKeyboardNav, getEffectiveMaxSpan]);

  // Coordinate conversions & landmark hit-testing
  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    const c = camRef.current;
    if (!el) return { x: Math.round(c.x), z: Math.round(c.z), px: 0, py: 0, w: 640, h: 480 };
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const nx = px / Math.max(1, rect.width);
    const nz = py / Math.max(1, rect.height);
    const curAspect = Math.max(0.25, rect.width / Math.max(1, rect.height));
    const curSpanX = curAspect >= 1 ? c.span * curAspect : c.span;
    const curSpanZ = curAspect >= 1 ? c.span : c.span / curAspect;
    return {
      x: Math.round(c.x + (nx - 0.5) * curSpanX),
      z: Math.round(c.z + (nz - 0.5) * curSpanZ),
      px,
      py,
      w: rect.width,
      h: rect.height,
    };
  }, []);

  const hitTestLandmark = useCallback(
    (clientX: number, clientY: number, radiusPx = 20): MacroLandmark | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const c = camRef.current;
      const isCompact = rect.width < 560 || rect.height < 460;
      const curAspect = Math.max(0.25, rect.width / Math.max(1, rect.height));
      const curSpanX = curAspect >= 1 ? c.span * curAspect : c.span;
      const curSpanZ = curAspect >= 1 ? c.span : c.span / curAspect;
      const minWX = c.x - curSpanX * 0.5;
      const minWZ = c.z - curSpanZ * 0.5;

      let best: MacroLandmark | null = null;
      let bestDist = radiusPx;
      for (const lm of MACRO_LANDMARKS) {
        if (c.span > (isCompact ? 46_000 : 64_000) && lm.priority > 1) continue;
        if (c.span > (isCompact ? 24_000 : 32_000) && lm.priority > 2) continue;
        const lx = ((lm.x - minWX) / curSpanX) * rect.width;
        const ly = ((lm.z - minWZ) / curSpanZ) * rect.height;
        const d = Math.hypot(px - lx, py - ly);
        if (d < bestDist) {
          bestDist = d;
          best = lm;
        }
      }
      return best;
    },
    []
  );

  // Direct zero-rerender DOM hover telemetry update
  const lastTelemetryMsRef = useRef(0);
  const updateHoverTelemetry = useCallback((wx: number, wz: number) => {
    const now = performance.now();
    if (now - lastTelemetryMsRef.current < 90) return;
    lastTelemetryMsRef.current = now;

    if (telemetryElRef.current) {
      const hh = getTerrainHeight(wx, wz);
      const hb = BIOME_SPECS[getBiomeAt(wx, wz)] ?? BIOME_SPECS.fertile_plains;
      const ht = getTemperatureCAt(wx, wz, Math.max(0, hh));
      const hm = Math.round(getMoistureAt(wx, wz) * 100);
      const hc =
        CLIMATE_SPECS[getEffectiveClimateAt(wx, wz, propsRef.current.activeClimate)] ??
        CLIMATE_SPECS.temperate_clear;
      telemetryElRef.current.textContent = `${formatWorldCoordKm(wx)} ، ${formatWorldCoordKm(wz)} · ${hh.toFixed(1)}م · ${hb.nameAr.split(' (')[0]} · ${ht}°C · رطوبة ${hm}% · ${hc.nameAr.split(' (')[0]}`;
    }
    propsRef.current.onHoverWorldChange?.({ x: wx, z: wz });
  }, []);

  // Wheel Zoom (smoothly damped toward cursor, zero React round-trip!)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const p = propsRef.current;
      if (!p.isActive) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
      const nz = (e.clientY - rect.top) / Math.max(1, rect.height);

      const c = camRef.current;
      const curAspect = Math.max(0.25, rect.width / Math.max(1, rect.height));
      const curSpanX = curAspect >= 1 ? c.targetSpan * curAspect : c.targetSpan;
      const curSpanZ = curAspect >= 1 ? c.targetSpan : c.targetSpan / curAspect;

      const anchorWX = c.targetX + (nx - 0.5) * curSpanX;
      const anchorWZ = c.targetZ + (nz - 0.5) * curSpanZ;

      const absDelta = Math.min(240, Math.abs(e.deltaY));
      const factor = 1 + absDelta * 0.0022;
      const nextSpanRaw = e.deltaY > 0 ? c.targetSpan * factor : c.targetSpan / factor;

      if (p.zoomInto3DThresholdM && nextSpanRaw < p.zoomInto3DThresholdM && p.onZoomBelowThreshold) {
        p.onZoomBelowThreshold(Math.round(anchorWX), Math.round(anchorWZ));
        return;
      }

      const nextSpan = Math.max(p.minSpanM, Math.min(getEffectiveMaxSpan(), nextSpanRaw));
      const nextSpanX = curAspect >= 1 ? nextSpan * curAspect : nextSpan;
      const nextSpanZ = curAspect >= 1 ? nextSpan : nextSpan / curAspect;

      const nextCenter = clampCenter(
        anchorWX - (nx - 0.5) * nextSpanX,
        anchorWZ - (nz - 0.5) * nextSpanZ
      );
      c.targetX = nextCenter.x;
      c.targetZ = nextCenter.z;
      c.targetSpan = nextSpan;
      c.vx = 0;
      c.vz = 0;
      c.dirty = true;
      c.detailNeedsBake = true;
      c.lastInteractionMs = performance.now();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampCenter, getEffectiveMaxSpan]);

  // Pointer Drag + Momentum + Pinch-Zoom + Mobile Double-Tap state
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    originCenterX: 0,
    originCenterZ: 0,
    moved: false,
  });
  const touchPtsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef({ dist: 0, midX: 0, midY: 0 });
  const wasPinchingRef = useRef(false);
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden select-none touch-none bg-[#0a1c2a] ${className}`}
      style={{
        cursor:
          mode === 'march'
            ? 'crosshair'
            : cursorStyle === 'grabbing'
              ? 'grabbing'
              : cursorStyle === 'pointer'
                ? 'pointer'
                : 'grab',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const pt = clientToWorld(e.clientX, e.clientY);
        onRightClickWorld?.(pt.x, pt.z);
      }}
      onPointerDown={(e) => {
        if (e.button === 2) return; // handled by onContextMenu
        if (e.pointerType === 'touch') {
          touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (touchPtsRef.current.size >= 2) {
            const pts = Array.from(touchPtsRef.current.values());
            pinchStateRef.current = {
              dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
              midX: (pts[0].x + pts[1].x) / 2,
              midY: (pts[0].y + pts[1].y) / 2,
            };
            wasPinchingRef.current = true;
            dragRef.current.active = false;
            dragRef.current.moved = true;
            camRef.current.isDragging = false;
            return;
          }
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore synthetic pointer events
        }
        const c = camRef.current;
        c.vx = 0;
        c.vz = 0;
        dragRef.current = {
          active: true,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          lastTime: performance.now(),
          originCenterX: c.x,
          originCenterZ: c.z,
          moved: false,
        };
        setCursorStyle('grabbing');
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch' && touchPtsRef.current.has(e.pointerId)) {
          touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (touchPtsRef.current.size === 2) {
            const pts = Array.from(touchPtsRef.current.values());
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            const prev = pinchStateRef.current;
            if (prev.dist > 10 && dist > 6) {
              const p = propsRef.current;
              const c = camRef.current;
              const factor = Math.max(0.5, Math.min(2.0, prev.dist / dist));
              const nextSpanRaw = c.targetSpan * factor;
              if (p.zoomInto3DThresholdM && nextSpanRaw < p.zoomInto3DThresholdM && p.onZoomBelowThreshold) {
                const pt = clientToWorld(midX, midY);
                touchPtsRef.current.clear();
                wasPinchingRef.current = false;
                p.onZoomBelowThreshold(pt.x, pt.z);
                return;
              }
              const nextSpan = Math.max(p.minSpanM, Math.min(getEffectiveMaxSpan(), nextSpanRaw));
              const rect = containerRef.current?.getBoundingClientRect();
              const curAspect = rect ? Math.max(0.25, rect.width / Math.max(1, rect.height)) : 1;
              const curSpanX = curAspect >= 1 ? nextSpan * curAspect : nextSpan;
              const curSpanZ = curAspect >= 1 ? nextSpan : nextSpan / curAspect;
              const dx = midX - prev.midX;
              const dy = midY - prev.midY;
              const nextCenter = clampCenter(
                c.targetX - (dx / Math.max(1, rect?.width ?? 320)) * curSpanX,
                c.targetZ - (dy / Math.max(1, rect?.height ?? 320)) * curSpanZ
              );
              c.targetX = nextCenter.x;
              c.targetZ = nextCenter.z;
              c.targetSpan = nextSpan;
              c.dirty = true;
              c.detailNeedsBake = true;
              c.lastInteractionMs = performance.now();
              pinchStateRef.current = { dist, midX, midY };
              return;
            }
            pinchStateRef.current = { dist, midX, midY };
            return;
          }
        }

        if (!dragRef.current.active) {
          if (e.pointerType !== 'touch') {
            const hit = hitTestLandmark(e.clientX, e.clientY, 20);
            if (hit?.id !== hoverLandmarkRef.current?.id) {
              hoverLandmarkRef.current = hit;
              setHoverLandmark(hit);
              setCursorStyle(hit ? 'pointer' : 'grab');
              camRef.current.dirty = true;
            }
            const pt = clientToWorld(e.clientX, e.clientY);
            updateHoverTelemetry(pt.x, pt.z);
          }
          return;
        }

        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const moveThreshold = e.pointerType === 'touch' ? 7 : 4;
        if (dragRef.current.moved || Math.hypot(dx, dy) > moveThreshold) {
          dragRef.current.moved = true;
          const c = camRef.current;
          c.isDragging = true;
          const rect = containerRef.current?.getBoundingClientRect();
          const w = Math.max(1, rect?.width ?? 320);
          const h = Math.max(1, rect?.height ?? 320);
          const curAspect = Math.max(0.25, w / h);
          const curSpanX = curAspect >= 1 ? c.span * curAspect : c.span;
          const curSpanZ = curAspect >= 1 ? c.span : c.span / curAspect;

          const nextCenter = clampCenter(
            dragRef.current.originCenterX - (dx / w) * curSpanX,
            dragRef.current.originCenterZ - (dy / h) * curSpanZ
          );

          // Track release velocity for smooth pan inertia
          const now = performance.now();
          const dtSec = Math.max(0.008, (now - dragRef.current.lastTime) / 1000);
          const stepX = ((e.clientX - dragRef.current.lastX) / w) * curSpanX;
          const stepZ = ((e.clientY - dragRef.current.lastY) / h) * curSpanZ;
          c.vx = (-stepX / dtSec) * 0.55;
          c.vz = (-stepZ / dtSec) * 0.55;
          dragRef.current.lastX = e.clientX;
          dragRef.current.lastY = e.clientY;
          dragRef.current.lastTime = now;

          c.x = nextCenter.x;
          c.z = nextCenter.z;
          c.targetX = nextCenter.x;
          c.targetZ = nextCenter.z;
          c.dirty = true;
          c.detailNeedsBake = true;
          c.lastInteractionMs = now;
        }
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch') {
          touchPtsRef.current.delete(e.pointerId);
          // Smooth 2-to-1 finger handoff: re-anchor drag on remaining finger without triggering a stray tap
          if (touchPtsRef.current.size === 1) {
            const [remId, remPt] = Array.from(touchPtsRef.current.entries())[0];
            const c = camRef.current;
            c.vx = 0;
            c.vz = 0;
            dragRef.current = {
              active: true,
              pointerId: remId,
              startX: remPt.x,
              startY: remPt.y,
              lastX: remPt.x,
              lastY: remPt.y,
              lastTime: performance.now(),
              originCenterX: c.x,
              originCenterZ: c.z,
              moved: true,
            };
            return;
          }
          if (touchPtsRef.current.size === 0 && wasPinchingRef.current) {
            wasPinchingRef.current = false;
            dragRef.current.active = false;
            camRef.current.isDragging = false;
            return;
          }
        }
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        } catch {
          // ignore
        }
        const wasClick = dragRef.current.active && !dragRef.current.moved;
        dragRef.current.active = false;
        camRef.current.isDragging = false;
        setCursorStyle(hoverLandmarkRef.current ? 'pointer' : 'grab');
        if (!wasClick) return;

        const isTouch = e.pointerType === 'touch';
        const hitRadius = isTouch ? 32 : 20;

        // Touch double-tap to dive cleanly into 3D (native onDoubleClick is unreliable with touch-none)
        if (isTouch && mode === 'jump' && onDoubleClickWorld) {
          const now = performance.now();
          const prevTap = lastTapRef.current;
          if (
            now - prevTap.time < 320 &&
            Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 30
          ) {
            lastTapRef.current = { time: 0, x: 0, y: 0 };
            setSelectedLandmark(null);
            const hitDbl = hitTestLandmark(e.clientX, e.clientY, hitRadius);
            if (hitDbl) {
              onDoubleClickWorld(hitDbl.x, hitDbl.z);
            } else {
              const ptDbl = clientToWorld(e.clientX, e.clientY);
              onDoubleClickWorld(ptDbl.x, ptDbl.z);
            }
            return;
          }
          lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
        }

        // If user clicked/tapped a landmark in explore mode, smoothly glide to it & show quick action card
        const hit = hitTestLandmark(e.clientX, e.clientY, hitRadius);
        if (hit && mode === 'jump') {
          setSelectedLandmark(hit);
          const c = camRef.current;
          c.targetX = hit.x;
          c.targetZ = hit.z;
          c.targetSpan = Math.min(c.targetSpan, 20_000);
          c.vx = 0;
          c.vz = 0;
          c.dirty = true;
          c.detailNeedsBake = true;
          c.lastInteractionMs = performance.now();
          return;
        }

        setSelectedLandmark(null);
        const pt = clientToWorld(e.clientX, e.clientY);
        if (isTouch) updateHoverTelemetry(pt.x, pt.z);
        onClickWorld?.(pt.x, pt.z);
      }}
      onPointerCancel={(e) => {
        if (e.pointerType === 'touch') {
          touchPtsRef.current.delete(e.pointerId);
          if (touchPtsRef.current.size === 0) {
            wasPinchingRef.current = false;
          }
        }
        dragRef.current.active = false;
        camRef.current.isDragging = false;
        setCursorStyle('grab');
      }}
      onPointerLeave={() => {
        if (hoverLandmarkRef.current) {
          hoverLandmarkRef.current = null;
          setHoverLandmark(null);
          camRef.current.dirty = true;
        }
        onHoverWorldChange?.(null);
      }}
      onDoubleClick={(e) => {
        if (mode === 'march') return;
        const hit = hitTestLandmark(e.clientX, e.clientY, 22);
        if (hit) {
          onDoubleClickWorld?.(hit.x, hit.z);
          return;
        }
        const pt = clientToWorld(e.clientX, e.clientY);
        onDoubleClickWorld?.(pt.x, pt.z);
      }}
    >
      {/* Layer 1: Ultra-Fast Cached-Texture WebGL2 Composite & Illuminated Parchment Fog */}
      <canvas
        ref={glCanvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />
      {/* Layer 2: Crisp Retina Vector Cartography, Heraldic Cities, Roads & Units */}
      <canvas
        ref={vectorCanvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />

      {/* Selected Landmark Quick Action Card (full-width safe on mobile, docked bottom-right on desktop) */}
      {selectedLandmark && mode === 'jump' && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute bottom-9 left-2 right-2 sm:left-auto sm:bottom-12 sm:right-3 z-20 sm:w-72 bg-[#140e08]/95 border border-[#a98240] px-2.5 py-2 sm:px-3 sm:py-2.5 text-right shadow-xl space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11.5px] sm:text-xs font-bold text-[#ffebb0] truncate">
                {selectedLandmark.nameAr}
              </div>
              <div className="text-[10px] sm:text-[10.5px] text-[#cbb68e] truncate">
                {selectedLandmark.regionAr}
                {(() => {
                  const matched = SPAWN_PLATEAUS.find(
                    (sp) => Math.hypot(sp.x - selectedLandmark.x, sp.z - selectedLandmark.z) < 2500
                  );
                  return matched
                    ? ` · نحو ${matched.populationEst.toLocaleString('en-US')} نسمة`
                    : '';
                })()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedLandmark(null)}
              aria-label="إغلاق"
              className="text-[#cbb68e] hover:text-white text-sm leading-none px-1.5 py-0.5 cursor-pointer"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {onDoubleClickWorld && (
              <button
                type="button"
                onClick={() => {
                  const target = selectedLandmark;
                  setSelectedLandmark(null);
                  onDoubleClickWorld(target.x, target.z);
                }}
                className="flex-1 h-7 px-2 rts2k-bevel-btn-gold text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
              >
                الهبوط للمشهد 3D
              </button>
            )}
            {onRightClickWorld && (
              <button
                type="button"
                onClick={() => {
                  const target = selectedLandmark;
                  setSelectedLandmark(null);
                  onRightClickWorld(target.x, target.z);
                }}
                className="h-7 px-2.5 rts2k-bevel-btn-emerald text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
              >
                توجيه مسير
              </button>
            )}
          </div>
        </div>
      )}

      {/* Zero-Rerender Live Terrain Telemetry Readout (Bottom-Right, clamped so it never collides with scale bar on mobile) */}
      {showInternalTelemetry && (
        <div
          className={`pointer-events-none absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-10 max-w-[calc(100%-126px)] sm:max-w-[calc(100%-210px)] px-2 py-0.5 sm:px-2.5 sm:py-1 bg-[#140e08]/88 border border-[#927038]/80 text-[9px] sm:text-[10.5px] font-mono tabular-nums text-[#f5e3ba] truncate ${
            mode === 'march' ? 'hidden sm:block' : ''
          }`}
        >
          <span ref={telemetryElRef} className="whitespace-nowrap">
            {sizePx.w < 560
              ? 'اسحب للتحريك · قرّب بإصبعين · انقر على مدينة'
              : 'اسحب للتحريك · عجلة الفأرة للتقريب · انقر على أي حاضرة أو دبل كليك للهبوط 3D · WASD للتجول'}
          </span>
        </div>
      )}
    </div>
  );
});
