import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BRIDGE_CROSSINGS,
  CHUNK_SIZE,
  ClimateKind,
  getBiomeFromSurfaceValues,
  getEffectiveClimateAt,
  getGeologicalFeatureAt,
  getTerrainHeight,
  hash2D,
  sampleTerrainSurfaceAt,
  SPAWN_PLATEAUS,
  TerrainSurfaceSample,
  WATER_LEVEL_Y,
  WATERFALL_SITES,
  WORLD_HALF_SIZE,
} from '../shared/worldMap';
import {
  FloraSpriteKind,
  getFloraSpriteMaterial,
  getSharedBillboardGeometry,
} from './pixelSprites';
import { applyRetroPixelShader } from './proceduralBlockout';
import { createHistoricCityQuartersSystem } from './cityQuartersBuilder';

export interface WorldTerrainBundle {
  root: THREE.Group;
  terrainMeshes: THREE.Mesh[];
  waterMaterial: THREE.MeshStandardMaterial;
  getActiveChunkCount: () => number;
  weatherSystem: {
    points: THREE.Points;
    update: (
      delta: number,
      climate: ClimateKind,
      centerWorldX: number,
      centerWorldZ: number,
      originX: number,
      originZ: number,
      cameraYaw?: number,
      cameraZoom?: number,
      isPerspective3D?: boolean,
      activeCityIndices?: ReadonlySet<number>
    ) => void;
  };
  dispose: () => void;
}

interface TerrainChunkEntry {
  key: string;
  sx: number;
  sz: number;
  lod: 0 | 1;
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  floraGroups: Array<{
    kind: FloraSpriteKind;
    mesh: THREE.InstancedMesh;
    items: Array<{ lx: number; y: number; lz: number; scale: number; flipX: number }>;
  }>;
  lastUsedFrame: number;
  appliedYaw: number;
  appliedFloraScale: number;
  isVisible: boolean;
}

const cDeepSeaBed = new THREE.Color(0x082f49);
const cShallowLagoon = new THREE.Color(0x0e7490);
const cWetSand = new THREE.Color(0xc29b59);
const cGoldenBeachSand = new THREE.Color(0xe5c285);
const cRiverMudLoam = new THREE.Color(0x5e4a32);
const cRoadTrack = new THREE.Color(0xb08a5d);
const cDrySteppeTan = new THREE.Color(0xc8ae84);
const cPaleDesertSand = new THREE.Color(0xdcc296);
const cMeadowGrass = new THREE.Color(0x638246);
const cLushGrass = new THREE.Color(0x2f7d41);
const cOliveHillGrass = new THREE.Color(0x7c8647);
const cForestMoss = new THREE.Color(0x295934);
const cDeepForestFloor = new THREE.Color(0x1b4227);
const cDesertDuneGold = new THREE.Color(0xd99e57);
const cDesertRedEarth = new THREE.Color(0xc2703d);
const cPlateauTerracotta = new THREE.Color(0x9b7152);
const cPlateauBasalt = new THREE.Color(0x5b5553);
const cCliffGranite = new THREE.Color(0x6d6962);
const cAlpineRock = new THREE.Color(0x7d7a72);
const cGlacierSnow = new THREE.Color(0xf4f7fa);
const cCanyonFloor = new THREE.Color(0x6d5843);
const cCanyonStrataOchre = new THREE.Color(0xb67647);
const cCanyonStrataDark = new THREE.Color(0x4c3a32);
const cMesaCaprock = new THREE.Color(0xcab38b);
const cOutcropSlate = new THREE.Color(0x5c534a);

function createContinentalSurfaceTexture(
  renderer: THREE.WebGLRenderer,
  repeatCount = 48
): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#eceef0';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const isDark = ((x >> 1) + (y >> 1)) % 2 === 0;
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  let seed = 4099;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 120; i++) {
    const px = Math.floor(nextRand() * 62);
    const py = Math.floor(nextRand() * 62);
    if (nextRand() > 0.45) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
      ctx.fillRect(px, py, 2, 1);
      ctx.fillRect(px, py + 1, 1, 1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.fillRect(px + 1, py + 1, 1, 1);
    } else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.10)';
      ctx.fillRect(px, py, 1, 2);
    }
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.09)';
  for (let i = 0; i < size; i += 16) {
    for (let d = 0; d < size; d += 2) {
      ctx.fillRect(i, d, 1, 1);
      ctx.fillRect(d, i, 1, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatCount, repeatCount);
  // Crisp pixel art up close, silky mipmapped anti-aliasing at far/regional zoom (zero static noise!)
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createPixelWaterTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      if (((x + y) >> 1) % 3 === 0) {
        ctx.fillStyle = '#0369a1';
        ctx.fillRect(x, y, 2, 1);
      }
    }
  }

  const crests = [
    [4, 6],
    [18, 14],
    [8, 22],
    [22, 28],
  ];
  crests.forEach(([cx, cy]) => {
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(cx, cy, 5, 1);
    ctx.fillRect(cx + 1, cy - 1, 3, 1);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(cx + 2, cy - 1, 1, 1);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1120, 1120);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function createWaterfallStreamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(0, 0, 32, 64);

  for (let y = 0; y < 64; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#38bdf8' : '#0ea5e9';
    ctx.fillRect(0, y, 32, 2);
  }

  for (let i = 0; i < 28; i++) {
    const x = (i * 7) % 28;
    const y = (i * 13) % 56;
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(x, y, 2, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y + 1, 1, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function paintVertexColor(
  vx: number,
  vz: number,
  vy: number,
  slope: number,
  cTmp: THREE.Color
): TerrainSurfaceSample | null {
  if (vy < WATER_LEVEL_Y - 0.65) {
    cTmp.copy(cDeepSeaBed).lerp(cShallowLagoon, Math.max(0, (vy + 3.2) / 2.4));
    return null;
  }
  if (vy < WATER_LEVEL_Y + 0.14) {
    cTmp.copy(cShallowLagoon).lerp(cWetSand, (vy - (WATER_LEVEL_Y - 0.65)) / 0.79);
    return null;
  }

  const surf = sampleTerrainSurfaceAt(vx, vz, vy);
  const {
    riverDist,
    oasisDist,
    roadDist,
    spineDist,
    arid,
    moisture,
    forestDensity,
    tempC,
    snowLine,
  } = surf;
  const microNoise = Math.sin(vx * 0.08 + vz * 0.07) * 0.5 + 0.5;

  if (vy < 0.52) {
    const beachMix = (vy - (WATER_LEVEL_Y + 0.14)) / 0.38;
    if (riverDist < 16) {
      cTmp.copy(cWetSand).lerp(cRiverMudLoam, beachMix * 0.75);
    } else if (tempC < 10) {
      // Cool northern shingle/slate beaches
      cTmp.copy(cWetSand).lerp(cAlpineRock, beachMix * 0.55);
    } else {
      cTmp.copy(cWetSand).lerp(cGoldenBeachSand, beachMix);
    }
  } else {
    // Realistic Middle East Satellite Base: warm arid steppe & buff limestone dominates,
    // while green is concentrated strictly in river corridors, Levant coast, Taurus rim & oases.
    cTmp.copy(cDrySteppeTan).lerp(cPaleDesertSand, microNoise * 0.45);

    // Latitude thermal modulation: olive-brown northern highlands vs warm buff/ochre plains
    if (tempC < 14) {
      const northT = Math.min(1, (14 - tempC) / 10);
      cTmp.lerp(cOliveHillGrass, northT * 0.42);
    }

    // Coastal Levant, Northern Taurus & river-irrigated green ribbons
    if (moisture > 0.36) {
      const wf = Math.min(1, (moisture - 0.36) / 0.36);
      cTmp.lerp(cOliveHillGrass, wf * 0.58);
      if (moisture > 0.52) {
        const lushW = Math.min(1, (moisture - 0.52) / 0.3);
        cTmp.lerp(cMeadowGrass, lushW * 0.72);
      }
    }

    // Sharp fertile emerald river ribbons along Tigris, Euphrates, Shatt al-Arab & Jordan
    if (riverDist < 240) {
      const rBand = Math.max(0, 1 - riverDist / 240);
      const rSmooth = rBand * rBand * (3 - 2 * rBand);
      cTmp.lerp(cLushGrass, rSmooth * 0.88);
    }

    // Dense woodland canopy floor shade & mossy humus (Levant coast / Taurus foothills)
    if (forestDensity > 0.34 && roadDist > 18) {
      const fd = Math.min(1, (forestDensity - 0.34) / 0.52);
      cTmp.lerp(cForestMoss, fd * 0.62);
      cTmp.lerp(cDeepForestFloor, fd * (0.35 + microNoise * 0.22));
    }

    // Broad Middle East desertification: Syrian Badiya, Anbar, Jazira steppe & red-gold Nafud sands
    const southNafud = Math.max(0, Math.min(1, (vz / WORLD_HALF_SIZE - 0.08) / 0.58));
    if (arid > 0.14) {
      const sf = Math.min(1, (arid - 0.14) / 0.62);
      const riverGuard = riverDist < 190 ? riverDist / 190 : 1;
      const effArid = sf * (0.35 + 0.65 * riverGuard);
      cTmp.lerp(cPaleDesertSand, effArid * 0.55);
      if (vy < snowLine - 1.2) {
        const duneTone =
          southNafud > 0.28 || microNoise < 0.38 ? cDesertRedEarth : cDesertDuneGold;
        cTmp.lerp(duneTone, effArid * (0.36 + southNafud * 0.54));
      }
    }

    // Geological Landform Vertex Shading: Canyons, Mesas, Outcrops & Stratified Escarpments
    const geo = getGeologicalFeatureAt(vx, vz, vy);

    // Mid-altitude rocky Zagros/Taurus foothills & desert escarpments
    if (vy > 3.6 || (spineDist < 2800 && vy > 2.8)) {
      const hillProximity = spineDist < 2800 ? 1 - spineDist / 2800 : 0;
      const elevWeight = Math.max(0, Math.min(1, (vy - 3.3) / 4.2));
      const ef = Math.max(hillProximity * 0.65, elevWeight);
      const stepBand = Math.abs(Math.sin(vy * 2.15));
      cTmp.lerp(cPlateauTerracotta, ef * 0.56);
      cTmp.lerp(cPlateauBasalt, ef * stepBand * 0.52);
    }

    // Stepped Mesas & Plateaus: flat warm limestone caprock on top, stratified terracotta cliffs on rim
    if (geo.mesaStrength > 0.25) {
      const mW = Math.min(1, (geo.mesaStrength - 0.25) / 0.55);
      if (slope < 0.28) {
        cTmp.lerp(cMesaCaprock, mW * 0.52);
      } else {
        const strata = Math.sin(vy * 3.4) * 0.5 + 0.5;
        cTmp.lerp(strata > 0.48 ? cCanyonStrataOchre : cPlateauBasalt, mW * 0.78);
      }
    }

    // Rocky Outcrops / Buttes: rugged weathered basalt & sandstone spires
    if (geo.outcropStrength > 0.22) {
      const oW = Math.min(1, (geo.outcropStrength - 0.22) / 0.6);
      const strata = Math.sin(vy * 2.9 + microNoise * 1.6) * 0.5 + 0.5;
      cTmp.lerp(strata > 0.52 ? cPlateauTerracotta : cOutcropSlate, oW * 0.72);
    }

    // Deep Tectonic Canyons & Desert Wadis: shadowed scree floor & crisp layered cliff bands
    if (geo.canyonDepth > 0.65) {
      const cW = Math.min(1, (geo.canyonDepth - 0.65) / 2.6);
      if (slope > 0.24) {
        const strataBand = Math.sin(vy * 4.2) * 0.5 + 0.5;
        cTmp.lerp(strataBand > 0.45 ? cCanyonStrataOchre : cCanyonStrataDark, cW * 0.86);
      } else {
        cTmp.lerp(cCanyonFloor, cW * 0.78);
      }
    }

    if (oasisDist < 55) {
      const of = 1 - oasisDist / 55;
      cTmp.lerp(cLushGrass, of * 0.92);
    }

    if (riverDist < 16.0) {
      const rf = 1 - riverDist / 16.0;
      cTmp.lerp(cRiverMudLoam, rf * 0.68);
    }

    if (roadDist < 24) {
      const rdMix = 1 - roadDist / 24;
      cTmp.lerp(cRoadTrack, rdMix * 0.72);
    }

    if (slope > 0.3) {
      const rockWeight = Math.min(1, (slope - 0.3) / 0.44);
      const strata = Math.sin(vy * 3.1) * 0.5 + 0.5;
      const cliffTone = arid > 0.35 && vy < snowLine - 1.5
        ? strata > 0.5
          ? cCanyonStrataOchre
          : cCanyonStrataDark
        : cCliffGranite;
      cTmp.lerp(cliffTone, rockWeight * 0.88);
    }

    const rockStart = snowLine - 1.8;
    if (vy > rockStart) {
      const rockMix = Math.min(1, (vy - rockStart) / 2.4);
      cTmp.lerp(cAlpineRock, rockMix * 0.76);
    }

    // Slope-aware alpine snow: sheer cliffs shed snow to expose dark granite crags!
    if (vy > snowLine) {
      const cliffShed = Math.max(0.18, 1 - Math.max(0, slope - 0.42) * 1.45);
      const peakSnow = Math.min(1, (vy - snowLine) / 2.8) * cliffShed;
      cTmp.lerp(cGlacierSnow, peakSnow * 0.95);
    }
  }
  return surf;
}

/**
 * Builds the Floating-Origin Streaming Chunk Terrain Engine spanning the 100 x 100 km 1:1 world.
 */
export function buildWorldTerrain(renderer: THREE.WebGLRenderer): WorldTerrainBundle {
  const root = new THREE.Group();

  const surfaceTexture = createContinentalSurfaceTexture(renderer, 48);
  const terrainMat = new THREE.MeshStandardMaterial({
    map: surfaceTexture,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.04,
    flatShading: true,
  });
  applyRetroPixelShader(terrainMat, { enableVisionFog: true, enableOutline: false });

  const coarseSurfaceTexture = createContinentalSurfaceTexture(renderer, 192);
  const coarseMat = new THREE.MeshStandardMaterial({
    map: coarseSurfaceTexture,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.03,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  applyRetroPixelShader(coarseMat, { enableVisionFog: true, enableOutline: false });

  // Sculpted composite multi-part geological rock crag & talus boulder cluster (grounded deeply below y=0)
  const buildSculptedOutcropGeom = (): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    const addRockPart = (
      g: THREE.BufferGeometry,
      px: number,
      py: number,
      pz: number,
      rx: number,
      ry: number,
      rz: number,
      sx: number,
      sy: number,
      sz: number
    ) => {
      const ng = g.index ? g.toNonIndexed() : g;
      ng.scale(sx, sy, sz);
      ng.rotateX(rx);
      ng.rotateY(ry);
      ng.rotateZ(rz);
      ng.translate(px, py, pz);
      if (!ng.getAttribute('normal')) ng.computeVertexNormals();
      if (!ng.getAttribute('uv')) {
        const count = ng.getAttribute('position').count;
        ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      parts.push(ng);
    };
    // Central stratified rock crag spire anchored below ground
    addRockPart(new THREE.DodecahedronGeometry(2.3, 0), 0, 0.75, 0, 0.14, 0.35, -0.1, 1.15, 1.55, 0.95);
    // Secondary shoulder slab ledge
    addRockPart(new THREE.DodecahedronGeometry(1.75, 0), 1.45, 0.18, 0.72, -0.18, 1.1, 0.22, 1.25, 0.95, 1.05);
    // Flanking talus boulder & scree buttress
    addRockPart(new THREE.DodecahedronGeometry(1.4, 0), -1.38, -0.05, -0.82, 0.24, 2.2, 0.15, 1.18, 0.78, 1.12);
    addRockPart(new THREE.DodecahedronGeometry(1.05, 0), 0.35, -0.22, -1.45, 0.1, 0.8, -0.25, 1.35, 0.65, 0.95);
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    return merged;
  };
  const rockGeom = buildSculptedOutcropGeom();
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.06,
    flatShading: true,
  });
  applyRetroPixelShader(rockMat, { enableVisionFog: true });

  const spriteQuadGeom = getSharedBillboardGeometry(4.2, 4.4);

  // Endless Ocean Skirt & Animated Pixel Water Sheet (positioned relative to origin & camera)
  const outerOceanMat = new THREE.MeshStandardMaterial({
    color: 0x062138,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });
  applyRetroPixelShader(outerOceanMat, { enableVisionFog: true, enableOutline: false });

  const outerOceanBed = new THREE.Mesh(
    new THREE.PlaneGeometry(22000, 22000),
    outerOceanMat
  );
  outerOceanBed.rotation.x = -Math.PI / 2;
  outerOceanBed.position.y = -3.65;
  outerOceanBed.receiveShadow = true;
  root.add(outerOceanBed);

  const pixelWaterTex = createPixelWaterTexture();
  const waterMaterial = new THREE.MeshStandardMaterial({
    map: pixelWaterTex,
    color: 0x38bdf8,
    roughness: 0.35,
    metalness: 0.25,
    transparent: true,
    opacity: 0.88,
    flatShading: true,
  });
  applyRetroPixelShader(waterMaterial, { enableVisionFog: true, enableOutline: false });

  const waterPlane = new THREE.Mesh(new THREE.PlaneGeometry(21600, 21600), waterMaterial);
  waterPlane.rotation.x = -Math.PI / 2;
  waterPlane.position.y = WATER_LEVEL_Y;
  waterPlane.receiveShadow = true;
  root.add(waterPlane);

  // Procedural Atmospheric Sky Gradient Dome (gives 3D Perspective mode a luminous natural horizon)
  const skyDomeGeom = new THREE.SphereGeometry(10800, 24, 14);
  const skyPosAttr = skyDomeGeom.getAttribute('position') as THREE.BufferAttribute;
  const skyColors = new Float32Array(skyPosAttr.count * 3);
  const cZenith = new THREE.Color(0x3a72a8);
  const cMidSky = new THREE.Color(0x78b0d6);
  const cHorizon = new THREE.Color(0xcfe2eb);
  const cUnder = new THREE.Color(0x6c8ca3);
  const cSkyTmp = new THREE.Color();
  for (let i = 0; i < skyPosAttr.count; i++) {
    const ny = skyPosAttr.getY(i) / 10800;
    if (ny >= 0) {
      if (ny < 0.28) {
        cSkyTmp.copy(cHorizon).lerp(cMidSky, ny / 0.28);
      } else {
        cSkyTmp.copy(cMidSky).lerp(cZenith, Math.min(1, (ny - 0.28) / 0.72));
      }
    } else {
      cSkyTmp.copy(cHorizon).lerp(cUnder, Math.min(1, -ny * 3.0));
    }
    skyColors[i * 3] = cSkyTmp.r;
    skyColors[i * 3 + 1] = cSkyTmp.g;
    skyColors[i * 3 + 2] = cSkyTmp.b;
  }
  skyDomeGeom.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const skyDomeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    color: 0xffffff,
  });
  const skyDome = new THREE.Mesh(skyDomeGeom, skyDomeMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -10;
  root.add(skyDome);
  const skyTintTarget = new THREE.Color(0xffffff);

  // Dynamic Landmark Entities (Waterfalls & Bridges positioned in floating-origin space)
  const waterfallTex = createWaterfallStreamTexture();
  const waterfallMat = new THREE.MeshStandardMaterial({
    map: waterfallTex,
    color: 0xe0f2fe,
    emissive: 0x0284c7,
    emissiveIntensity: 0.32,
    roughness: 0.3,
    metalness: 0.08,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  applyRetroPixelShader(waterfallMat, { enableVisionFog: true });

  const foamRingGeom = new THREE.RingGeometry(1.8, 6.2, 12);
  foamRingGeom.rotateX(-Math.PI / 2);
  const foamRingMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });

  const waterfallAnchors: Array<{ worldX: number; worldZ: number; group: THREE.Group }> = [];
  WATERFALL_SITES.forEach((wf) => {
    const wfGroup = new THREE.Group();
    const dropHeight = wf.topY - wf.bottomY;
    const poolRadius = wf.width * 0.85;
    const sourcePool = new THREE.Mesh(
      new THREE.CircleGeometry(poolRadius, 12),
      waterMaterial
    );
    sourcePool.rotation.x = -Math.PI / 2;
    sourcePool.position.set(
      -wf.flowDirX * (poolRadius * 0.75),
      wf.topY - 0.35,
      -wf.flowDirZ * (poolRadius * 0.75)
    );
    wfGroup.add(sourcePool);

    const curtainGeom = new THREE.BoxGeometry(wf.width, dropHeight + 0.6, 1.5, 4, 8, 1);
    const curtainMesh = new THREE.Mesh(curtainGeom, waterfallMat);
    curtainMesh.position.set(wf.flowDirX * 1.1, wf.bottomY + dropHeight * 0.5, wf.flowDirZ * 1.1);
    curtainMesh.rotation.y = Math.atan2(wf.flowDirX, wf.flowDirZ);
    curtainMesh.rotation.x = -0.18;
    wfGroup.add(curtainMesh);

    const plungeFoam = new THREE.Mesh(foamRingGeom, foamRingMat);
    plungeFoam.position.set(wf.flowDirX * 2.8, WATER_LEVEL_Y + 0.06, wf.flowDirZ * 2.8);
    wfGroup.add(plungeFoam);

    wfGroup.visible = false;
    root.add(wfGroup);
    waterfallAnchors.push({ worldX: wf.cliffX, worldZ: wf.cliffZ, group: wfGroup });
  });

  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
  });
  applyRetroPixelShader(bridgeMat, { enableVisionFog: true });

  const bridgeAnchors: Array<{ worldX: number; worldZ: number; group: THREE.Group }> = [];
  BRIDGE_CROSSINGS.forEach((bc) => {
    const bridge = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.8, bc.length), bridgeMat);
    deck.position.y = 0.35;
    deck.castShadow = true;
    deck.receiveShadow = true;
    bridge.add(deck);

    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.35, bc.length), bridgeMat);
    railL.position.set(-4.1, 0.85, 0);
    bridge.add(railL);

    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.35, bc.length), bridgeMat);
    railR.position.set(4.1, 0.85, 0);
    bridge.add(railR);

    bridge.rotation.y = bc.rotationY;
    bridge.visible = false;
    root.add(bridge);
    bridgeAnchors.push({ worldX: bc.x, worldZ: bc.z, group: bridge });
  });

  // Chunk Pools with LRU Caching (Near LOD0 256m + Horizon LOD1 1024m)
  const MAX_NEAR_CACHE = 64;
  const MAX_HORIZON_CACHE = 72;
  const nearChunks = new Map<string, TerrainChunkEntry>();
  const horizonChunks = new Map<string, TerrainChunkEntry>();
  const terrainMeshes: THREE.Mesh[] = [];
  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  const cInstance = new THREE.Color();

  const NEAR_SEGS = 44;
  const HORIZON_SEGS = 18;
  const NEAR_VERTS_SIDE = NEAR_SEGS + 1;
  const nearHeightBuf = new Float32Array((NEAR_SEGS + 3) * (NEAR_SEGS + 3));
  const horizonHeightBuf = new Float32Array((HORIZON_SEGS + 3) * (HORIZON_SEGS + 3));

  // Pre-allocated LOD0 chunk surface caches (reused for zero-query flora placement, zero GC)
  const nearSurfCount = NEAR_VERTS_SIDE * NEAR_VERTS_SIDE;
  const nearForestBuf = new Float32Array(nearSurfCount);
  const nearRiverBuf = new Float32Array(nearSurfCount);
  const nearRoadBuf = new Float32Array(nearSurfCount);
  const nearOasisBuf = new Float32Array(nearSurfCount);
  const nearTempBuf = new Float32Array(nearSurfCount);
  const nearAridBuf = new Float32Array(nearSurfCount);
  const nearMoistureBuf = new Float32Array(nearSurfCount);
  const nearSpineBuf = new Float32Array(nearSurfCount);
  const nearSnowLineBuf = new Float32Array(nearSurfCount);

  const desiredNearKeys = new Set<string>();
  const desiredHorizonKeys = new Set<string>();
  const pendingNear: Array<{ sx: number; sz: number; dist: number; key: string }> = [];
  const pendingHorizon: Array<{ sx: number; sz: number; dist: number; key: string }> = [];

  const refreshTerrainMeshesList = () => {
    terrainMeshes.length = 0;
    for (const ch of nearChunks.values()) {
      if (ch.isVisible) terrainMeshes.push(ch.terrainMesh);
    }
    for (const ch of horizonChunks.values()) {
      if (ch.isVisible) terrainMeshes.push(ch.terrainMesh);
    }
  };

  const updateChunkFloraVisuals = (
    ch: TerrainChunkEntry,
    yaw: number,
    floraScale: number,
    showUndergrowth: boolean
  ): boolean => {
    const showAny = floraScale > 0.08;
    for (let g = 0; g < ch.floraGroups.length; g++) {
      const fg = ch.floraGroups[g];
      fg.mesh.visible =
        showAny && (fg.kind !== 'forest_undergrowth' || showUndergrowth);
    }
    if (!showAny) return false;
    const yawDirty = Math.abs(yaw - ch.appliedYaw) > 0.032;
    const scaleDirty = Math.abs(floraScale - ch.appliedFloraScale) > 0.06;
    if (!yawDirty && !scaleDirty) return false;
    ch.appliedYaw = yaw;
    ch.appliedFloraScale = floraScale;
    for (let g = 0; g < ch.floraGroups.length; g++) {
      const fg = ch.floraGroups[g];
      if (!fg.mesh.visible) continue;
      for (let i = 0; i < fg.items.length; i++) {
        const it = fg.items[i];
        const s = it.scale * floraScale;
        dummy.position.set(it.lx, it.y, it.lz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(s * it.flipX, s, s);
        dummy.updateMatrix();
        fg.mesh.setMatrixAt(i, dummy.matrix);
      }
      fg.mesh.instanceMatrix.needsUpdate = true;
    }
    return true;
  };

  const buildChunkEntry = (
    sx: number,
    sz: number,
    lod: 0 | 1,
    frameNum: number,
    initialYaw: number
  ): TerrainChunkEntry => {
    const span = lod === 0 ? CHUNK_SIZE : CHUNK_SIZE * 4; // 256m near vs 1024m horizon
    const segments = lod === 0 ? NEAR_SEGS : HORIZON_SEGS;
    const halfSpan = span * 0.5;
    const cellStep = span / segments;
    const invTwoCell = 1 / (2 * cellStep);
    const stride = segments + 3;
    const hBuf = lod === 0 ? nearHeightBuf : horizonHeightBuf;

    const chunkWorldX = sx * span + halfSpan;
    const chunkWorldZ = sz * span + halfSpan;

    // Sample padded (segments + 3) x (segments + 3) height grid once so slope uses zero extra height queries
    for (let gz = 0; gz < stride; gz++) {
      const wz = chunkWorldZ - halfSpan + (gz - 1) * cellStep;
      const rowOff = gz * stride;
      for (let gx = 0; gx < stride; gx++) {
        const wx = chunkWorldX - halfSpan + (gx - 1) * cellStep;
        hBuf[rowOff + gx] = getTerrainHeight(wx, wz);
      }
    }

    const geom = new THREE.PlaneGeometry(span, span, segments, segments);
    geom.rotateX(-Math.PI / 2);

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const vertexCount = posAttr.count;
    const colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const lx = posAttr.getX(i);
      const lz = posAttr.getZ(i);
      const wx = chunkWorldX + lx;
      const wz = chunkWorldZ + lz;
      const ix = Math.round((lx + halfSpan) / cellStep) + 1;
      const iz = Math.round((lz + halfSpan) / cellStep) + 1;
      const idx = iz * stride + ix;
      const vy = hBuf[idx];
      posAttr.setY(i, lod === 1 ? vy - 0.05 : vy);

      const dhx = hBuf[idx + 1] - hBuf[idx - 1];
      const dhz = hBuf[idx + stride] - hBuf[idx - stride];
      const slope = Math.sqrt(dhx * dhx + dhz * dhz) * invTwoCell;

      const surf = paintVertexColor(wx, wz, vy, slope, cTmp);
      colors[i * 3] = cTmp.r;
      colors[i * 3 + 1] = cTmp.g;
      colors[i * 3 + 2] = cTmp.b;

      if (lod === 0) {
        const vIdx = (iz - 1) * NEAR_VERTS_SIDE + (ix - 1);
        if (surf) {
          nearForestBuf[vIdx] = surf.forestDensity;
          nearRiverBuf[vIdx] = surf.riverDist;
          nearRoadBuf[vIdx] = surf.roadDist;
          nearOasisBuf[vIdx] = surf.oasisDist;
          nearTempBuf[vIdx] = surf.tempC;
          nearAridBuf[vIdx] = surf.arid;
          nearMoistureBuf[vIdx] = surf.moisture;
          nearSpineBuf[vIdx] = surf.spineDist;
          nearSnowLineBuf[vIdx] = surf.snowLine;
        } else {
          nearForestBuf[vIdx] = 0;
          nearRiverBuf[vIdx] = 0;
          nearRoadBuf[vIdx] = 9999;
          nearOasisBuf[vIdx] = 9999;
          nearTempBuf[vIdx] = 18;
          nearAridBuf[vIdx] = 0;
          nearMoistureBuf[vIdx] = 0.5;
          nearSpineBuf[vIdx] = 9999;
          nearSnowLineBuf[vIdx] = 0;
        }
      }
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(geom, lod === 0 ? terrainMat : coarseMat);
    terrainMesh.receiveShadow = lod === 0;

    const group = new THREE.Group();
    group.add(terrainMesh);

    const floraGroups: TerrainChunkEntry['floraGroups'] = [];

    // Populate Flora & Rocks only on active LOD0 chunks within valid continental bounds
    if (
      lod === 0 &&
      Math.abs(chunkWorldX) < WORLD_HALF_SIZE &&
      Math.abs(chunkWorldZ) < WORLD_HALF_SIZE
    ) {
      const spriteLists: Record<
        FloraSpriteKind,
        Array<{ lx: number; y: number; lz: number; scale: number; flipX: number }>
      > = {
        forest_tree: [],
        forest_oak_cluster: [],
        forest_undergrowth: [],
        alpine_pine: [],
        desert_palm: [],
        southern_cactus_rock: [],
      };

      const rockCoords: Array<{
        lx: number;
        lz: number;
        y: number;
        sx: number;
        sy: number;
        sz: number;
        tintHex: number;
      }> = [];

      const step = 11;
      for (let lx = -halfSpan + 6; lx <= halfSpan - 6; lx += step) {
        const colParity = Math.round(lx / step);
        for (let lz = -halfSpan + 6; lz <= halfSpan - 6; lz += step) {
          const rowParity = Math.round(lz / step);
          const isCoarseCell = ((colParity + rowParity) & 1) === 0;
          const wx = chunkWorldX + lx;
          const wz = chunkWorldZ + lz;
          const jx = (hash2D(Math.round(wx), Math.round(wz)) - 0.5) * 7.5;
          const jz = (hash2D(Math.round(wz) + 73, Math.round(wx) - 41) - 0.5) * 7.5;
          const flx = lx + jx;
          const flz = lz + jz;
          const px = wx + jx;
          const pz = wz + jz;

          // Bilinear height & cached surface lookup directly from the 33x33 chunk vertex grid (zero extra terrain queries!)
          const fx = Math.max(1, Math.min(stride - 2.001, (flx + halfSpan) / cellStep + 1));
          const fz = Math.max(1, Math.min(stride - 2.001, (flz + halfSpan) / cellStep + 1));
          const gx0 = Math.floor(fx);
          const gz0 = Math.floor(fz);
          const tx = fx - gx0;
          const tz = fz - gz0;
          const h00 = hBuf[gz0 * stride + gx0];
          const h10 = hBuf[gz0 * stride + gx0 + 1];
          const h01 = hBuf[(gz0 + 1) * stride + gx0];
          const h11 = hBuf[(gz0 + 1) * stride + gx0 + 1];
          const ty =
            (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
          if (ty < 0.25 || ty > 21.0) continue;

          const gx = Math.max(1, Math.min(stride - 2, Math.round(fx)));
          const gz = Math.max(1, Math.min(stride - 2, Math.round(fz)));
          const hIdx = gz * stride + gx;
          const dhx = hBuf[hIdx + 1] - hBuf[hIdx - 1];
          const dhz = hBuf[hIdx + stride] - hBuf[hIdx - stride];
          const approxSlope = Math.sqrt(dhx * dhx + dhz * dhz) * invTwoCell;
          const isSteepCliff = approxSlope > 0.36;
          if (approxSlope > 1.25) continue;

          const vIdx = (gz - 1) * NEAR_VERTS_SIDE + (gx - 1);
          const snowLine = nearSnowLineBuf[vIdx];
          if (snowLine <= 0) continue;

          const forestD = nearForestBuf[vIdx];
          if (!isCoarseCell && forestD < 0.40) continue;

          const riverDist = nearRiverBuf[vIdx];
          const roadDist = nearRoadBuf[vIdx];
          if (riverDist < 15 || roadDist < 20) continue;

          let onPlateau = false;
          for (let sIdx = 0; sIdx < SPAWN_PLATEAUS.length; sIdx++) {
            const sp = SPAWN_PLATEAUS[sIdx];
            const dx = px - sp.x;
            const limit = sp.radius + 8;
            if (dx > limit || dx < -limit) continue;
            const dz = pz - sp.z;
            if (dz > limit || dz < -limit) continue;
            if (dx * dx + dz * dz < limit * limit) {
              onPlateau = true;
              break;
            }
          }
          if (onPlateau) continue;

          const oasisDist = nearOasisBuf[vIdx];
          const localTempC = nearTempBuf[vIdx];
          const biome = getBiomeFromSurfaceValues(
            px,
            pz,
            ty,
            riverDist,
            oasisDist,
            nearSpineBuf[vIdx],
            nearAridBuf[vIdx],
            nearMoistureBuf[vIdx],
            forestD,
            snowLine
          );
          const hash = hash2D(Math.round(px * 1.3), Math.round(pz * 1.7));
          const hash2 = hash2D(Math.round(pz * 2.1) + 19, Math.round(px * 1.9) - 31);
          const flipX = hash > 0.5 ? 1 : -1;

          if (!isSteepCliff) {
            if (oasisDist >= 14 && oasisDist <= 46 && isCoarseCell) {
              const oasisKind: FloraSpriteKind = localTempC >= 16 ? 'desert_palm' : 'forest_tree';
              spriteLists[oasisKind].push({
                lx: flx,
                y: ty,
                lz: flz,
                scale: 1.05 + (hash % 0.42),
                flipX,
              });
            } else if (riverDist >= 16 && riverDist <= 140 && isCoarseCell && hash > 0.56) {
              // Lush riverfront date palm groves along Tigris, Euphrates & Shatt al-Arab
              const bankKind: FloraSpriteKind = localTempC >= 17 ? 'desert_palm' : 'forest_tree';
              spriteLists[bankKind].push({
                lx: flx,
                y: ty,
                lz: flz,
                scale: 0.95 + (hash % 0.45),
                flipX,
              });
            } else if (biome === 'southern_dunes' && isCoarseCell && hash > 0.76) {
              // Sparse desert scrub rocks & rare oasis palms across the arid interior
              const sKind: FloraSpriteKind =
                hash > 0.92 ? 'desert_palm' : 'southern_cactus_rock';
              spriteLists[sKind].push({
                lx: flx,
                y: ty,
                lz: flz,
                scale: 0.85 + (hash % 0.38),
                flipX,
              });
            } else if (forestD >= 0.42 || biome === 'western_forest') {
              // Mediterranean Levant coast & Northern Taurus woodlands
              if (hash > 0.28) {
                const treeKind: FloraSpriteKind =
                  localTempC < 12.5
                    ? 'alpine_pine'
                    : hash2 > 0.54
                      ? 'forest_oak_cluster'
                      : 'forest_tree';
                spriteLists[treeKind].push({
                  lx: flx,
                  y: ty,
                  lz: flz,
                  scale:
                    treeKind === 'forest_oak_cluster'
                      ? 1.2 + (hash % 0.5)
                      : 1.0 + (hash % 0.5),
                  flipX,
                });
              }
              if (hash2 > 0.64) {
                spriteLists.forest_undergrowth.push({
                  lx: flx + (hash - 0.5) * 4.0,
                  y: ty,
                  lz: flz + (hash2 - 0.5) * 4.0,
                  scale: 0.8 + (hash % 0.35),
                  flipX: -flipX,
                });
              }
            } else if (biome === 'northern_peaks' && isCoarseCell && hash > 0.48 && ty < 11.5) {
              spriteLists.alpine_pine.push({
                lx: flx,
                y: ty,
                lz: flz,
                scale: 1.0 + (hash % 0.42),
                flipX,
              });
            } else if (
              isCoarseCell &&
              ((biome === 'fertile_plains' && hash > 0.8) ||
                (biome === 'waterfall_gorge' && hash > 0.4))
            ) {
              const treeKind: FloraSpriteKind =
                localTempC < 12 ? 'alpine_pine' : localTempC > 22 ? 'desert_palm' : 'forest_tree';
              spriteLists[treeKind].push({
                lx: flx,
                y: ty,
                lz: flz,
                scale: 0.95 + (hash % 0.42),
                flipX,
              });
            }
          }

          // Sculpted geological rock outcrops along steep cliffs, mesas, canyons, outcrops & alpine ridges
          const shouldPlaceOutcrop =
            (isSteepCliff && hash > 0.62) ||
            ((biome === 'eastern_basalt' || biome === 'northern_peaks') && hash > 0.74) ||
            (ty > 4.4 && hash > 0.8);
          if (shouldPlaceOutcrop) {
            const isDesertRock = nearAridBuf[vIdx] > 0.32 && ty < snowLine - 1.2;
            rockCoords.push({
              lx: flx,
              lz: flz,
              y: ty - 0.45,
              sx: 0.9 + (hash2 % 0.75),
              sy: 0.95 + (hash % 1.05),
              sz: 0.9 + (hash % 0.75),
              tintHex:
                biome === 'northern_peaks'
                  ? ty > snowLine + 1.2 && !isSteepCliff
                    ? 0xdbe5f0
                    : 0x64748b
                  : isDesertRock
                    ? hash2 > 0.48
                      ? 0xa66f46
                      : 0x73523d
                    : 0x6a635b,
            });
          }
        }
      }

      (Object.keys(spriteLists) as FloraSpriteKind[]).forEach((fKind) => {
        const items = spriteLists[fKind];
        if (items.length === 0) return;
        const fMat = getFloraSpriteMaterial(fKind);
        const inst = new THREE.InstancedMesh(spriteQuadGeom, fMat, items.length);
        inst.castShadow = false;
        inst.receiveShadow = false;
        items.forEach((it, idx) => {
          dummy.position.set(it.lx, it.y, it.lz);
          dummy.rotation.set(0, initialYaw, 0);
          dummy.scale.set(it.scale * it.flipX, it.scale, it.scale);
          dummy.updateMatrix();
          inst.setMatrixAt(idx, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        group.add(inst);
        floraGroups.push({ kind: fKind, mesh: inst, items });
      });

      if (rockCoords.length > 0) {
        const rInst = new THREE.InstancedMesh(rockGeom, rockMat, rockCoords.length);
        rInst.castShadow = true;
        rInst.receiveShadow = true;
        rockCoords.forEach((rc, idx) => {
          dummy.position.set(rc.lx, rc.y, rc.lz);
          dummy.rotation.set((idx % 5) * 0.06, idx * 1.15, ((idx + 2) % 5) * 0.05);
          dummy.scale.set(rc.sx, rc.sy, rc.sz);
          dummy.updateMatrix();
          rInst.setMatrixAt(idx, dummy.matrix);
          cInstance.setHex(rc.tintHex);
          rInst.setColorAt(idx, cInstance);
        });
        rInst.instanceMatrix.needsUpdate = true;
        if (rInst.instanceColor) rInst.instanceColor.needsUpdate = true;
        rInst.computeBoundingSphere();
        group.add(rInst);
      }
    }

    root.add(group);
    return {
      key: `${lod}_${sx}_${sz}`,
      sx,
      sz,
      lod,
      group,
      terrainMesh,
      floraGroups,
      lastUsedFrame: frameNum,
      appliedYaw: initialYaw,
      appliedFloraScale: 1,
      isVisible: true,
    };
  };

  const disposeChunk = (entry: TerrainChunkEntry) => {
    root.remove(entry.group);
    entry.terrainMesh.geometry.dispose();
    entry.floraGroups.forEach((fg) => {
      fg.mesh.dispose();
    });
  };

  const evictLruChunks = (
    pool: Map<string, TerrainChunkEntry>,
    desired: Set<string>,
    maxSize: number
  ): boolean => {
    if (pool.size <= maxSize) return false;
    let changed = false;
    while (pool.size > maxSize) {
      let oldestKey: string | null = null;
      let oldestFrame = Infinity;
      for (const [k, ch] of pool.entries()) {
        if (!desired.has(k) && ch.lastUsedFrame < oldestFrame) {
          oldestFrame = ch.lastUsedFrame;
          oldestKey = k;
        }
      }
      if (!oldestKey) break;
      const old = pool.get(oldestKey);
      if (old) {
        disposeChunk(old);
        pool.delete(oldestKey);
        changed = true;
      }
    }
    return changed;
  };

  // Weather Particles (centered dynamically relative to camera in Floating-Origin coordinates)
  const particleCount = 520;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 110;
    particlePositions[i * 3 + 1] = Math.random() * 42 + 1;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 110;
  }

  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

  const particleMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 3.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });

  const weatherPoints = new THREE.Points(particleGeom, particleMat);
  root.add(weatherPoints);

  // Lazy-loaded dense historic wall-to-wall old-city quarters & bustling crowds for all 40 cities
  const historicCityQuarters = createHistoricCityQuartersSystem(root);

  let waterfallClock = 0;
  let lastBillboardYaw = Math.PI / 4;
  let frameCounter = 0;

  const updateWeatherAndChunks = (
    delta: number,
    climate: ClimateKind,
    centerWorldX: number,
    centerWorldZ: number,
    originX: number,
    originZ: number,
    cameraYaw = Math.PI / 4,
    cameraZoom = 38,
    isPerspective3D = false,
    activeCityIndices?: ReadonlySet<number>
  ) => {
    frameCounter += 1;
    const camSx = Math.floor(centerWorldX / CHUNK_SIZE);
    const camSz = Math.floor(centerWorldZ / CHUNK_SIZE);
    let meshesDirty = false;

    // 1. Stream Near LOD0 Chunks (5x5 grid around camera = 1,280m x 1,280m high-detail area)
    desiredNearKeys.clear();
    pendingNear.length = 0;
    let yawUpdatesThisFrame = 0;
    const maxYawUpdatesPerFrame = 8;
    const showUndergrowth = cameraZoom < 110;
    // Smoothly fade & disable sub-pixel tree billboards at high regional altitude so there is ZERO static noise or square cut-off!
    const globalFloraZoomFade =
      cameraZoom <= 135
        ? 1
        : cameraZoom >= 215
          ? 0
          : 1 - (cameraZoom - 135) / 80;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const sx = camSx + dx;
        const sz = camSz + dz;
        const key = `0_${sx}_${sz}`;
        desiredNearKeys.add(key);
        const existing = nearChunks.get(key);
        if (existing) {
          existing.lastUsedFrame = frameCounter;
          if (!existing.isVisible) {
            existing.isVisible = true;
            existing.group.visible = true;
            meshesDirty = true;
          }
          const chunkCenterX = sx * CHUNK_SIZE + CHUNK_SIZE * 0.5;
          const chunkCenterZ = sz * CHUNK_SIZE + CHUNK_SIZE * 0.5;
          existing.group.position.set(
            chunkCenterX - originX,
            0,
            chunkCenterZ - originZ
          );
          const radialDist = Math.hypot(
            chunkCenterX - centerWorldX,
            chunkCenterZ - centerWorldZ
          );
          // Soft circular distance falloff when zoomed out above 95m so trees never terminate in a hard square box!
          const radialFade =
            cameraZoom <= 95
              ? 1
              : Math.max(0, Math.min(1, (540 - radialDist) / 210));
          const targetFloraScale = globalFloraZoomFade * radialFade;
          if (yawUpdatesThisFrame < maxYawUpdatesPerFrame || targetFloraScale <= 0.08) {
            if (updateChunkFloraVisuals(existing, cameraYaw, targetFloraScale, showUndergrowth)) {
              yawUpdatesThisFrame += 1;
            }
          }
        } else {
          pendingNear.push({ sx, sz, dist: Math.hypot(dx, dz), key });
        }
      }
    }

    // 2. Stream Outer LOD1 Horizon Chunks (5x5 = 5.1km always; expands to 7x7 = 7.2km in 3D Perspective or wide zoom!)
    const hSpan = CHUNK_SIZE * 4;
    const camHsx = Math.floor(centerWorldX / hSpan);
    const camHsz = Math.floor(centerWorldZ / hSpan);
    const horizonRadius = isPerspective3D || cameraZoom > 155 ? 3 : 2;
    desiredHorizonKeys.clear();
    pendingHorizon.length = 0;
    for (let dx = -horizonRadius; dx <= horizonRadius; dx++) {
      for (let dz = -horizonRadius; dz <= horizonRadius; dz++) {
        const sx = camHsx + dx;
        const sz = camHsz + dz;
        const key = `1_${sx}_${sz}`;
        desiredHorizonKeys.add(key);
        const existing = horizonChunks.get(key);
        if (existing) {
          existing.lastUsedFrame = frameCounter;
          if (!existing.isVisible) {
            existing.isVisible = true;
            existing.group.visible = true;
            meshesDirty = true;
          }
          existing.group.position.set(
            sx * hSpan + hSpan * 0.5 - originX,
            -0.04,
            sz * hSpan + hSpan * 0.5 - originZ
          );
        } else {
          pendingHorizon.push({ sx, sz, dist: Math.hypot(dx, dz), key });
        }
      }
    }

    // Hide out-of-range chunks immediately (instant reuse on pan-back!), only dispose oldest beyond LRU cap
    for (const [key, ch] of nearChunks.entries()) {
      if (!desiredNearKeys.has(key) && ch.isVisible) {
        ch.isVisible = false;
        ch.group.visible = false;
        meshesDirty = true;
      }
    }
    for (const [key, ch] of horizonChunks.entries()) {
      if (!desiredHorizonKeys.has(key) && ch.isVisible) {
        ch.isVisible = false;
        ch.group.visible = false;
        meshesDirty = true;
      }
    }
    if (evictLruChunks(nearChunks, desiredNearKeys, MAX_NEAR_CACHE)) meshesDirty = true;
    if (evictLruChunks(horizonChunks, desiredHorizonKeys, MAX_HORIZON_CACHE)) meshesDirty = true;

    // Frame-budgeted synchronous chunk building (never drops frames during panning or initial load)
    const buildStartMs = performance.now();
    let builtThisFrame = 0;
    const isInitialBurst = nearChunks.size < 9 || horizonChunks.size < 4;
    const maxNearBuilds = isInitialBurst ? 3 : 1;
    const buildBudgetMs = isInitialBurst ? 11 : 2.5;

    if (pendingNear.length > 0) {
      pendingNear.sort((a, b) => a.dist - b.dist);
      for (let i = 0; i < pendingNear.length; i++) {
        if (builtThisFrame >= maxNearBuilds) break;
        if (builtThisFrame >= 1 && performance.now() - buildStartMs >= buildBudgetMs) break;
        const item = pendingNear[i];
        const entry = buildChunkEntry(item.sx, item.sz, 0, frameCounter, cameraYaw);
        const chunkCenterX = item.sx * CHUNK_SIZE + CHUNK_SIZE * 0.5;
        const chunkCenterZ = item.sz * CHUNK_SIZE + CHUNK_SIZE * 0.5;
        entry.group.position.set(
          chunkCenterX - originX,
          0,
          chunkCenterZ - originZ
        );
        const radialDist = Math.hypot(
          chunkCenterX - centerWorldX,
          chunkCenterZ - centerWorldZ
        );
        const radialFade =
          cameraZoom <= 95 ? 1 : Math.max(0, Math.min(1, (540 - radialDist) / 210));
        updateChunkFloraVisuals(
          entry,
          cameraYaw,
          globalFloraZoomFade * radialFade,
          showUndergrowth
        );
        nearChunks.set(item.key, entry);
        builtThisFrame += 1;
        meshesDirty = true;
      }
    }

    if (pendingHorizon.length > 0 && (isInitialBurst || builtThisFrame === 0 || performance.now() - buildStartMs < buildBudgetMs)) {
      pendingHorizon.sort((a, b) => a.dist - b.dist);
      const maxTotalBuilds = isInitialBurst ? maxNearBuilds + 2 : 1;
      for (let i = 0; i < pendingHorizon.length; i++) {
        if (builtThisFrame >= maxTotalBuilds) break;
        if (builtThisFrame >= 1 && performance.now() - buildStartMs >= buildBudgetMs) break;
        const item = pendingHorizon[i];
        const entry = buildChunkEntry(item.sx, item.sz, 1, frameCounter, cameraYaw);
        entry.group.position.set(
          item.sx * hSpan + hSpan * 0.5 - originX,
          -0.04,
          item.sz * hSpan + hSpan * 0.5 - originZ
        );
        horizonChunks.set(item.key, entry);
        builtThisFrame += 1;
        meshesDirty = true;
      }
    }

    if (meshesDirty) {
      refreshTerrainMeshesList();
    }

    // Keep Floating-Origin ocean plane, sky dome & skirt centered smoothly around camera
    const camRelX = centerWorldX - originX;
    const camRelZ = centerWorldZ - originZ;
    outerOceanBed.position.set(camRelX, -3.65, camRelZ);
    waterPlane.position.set(camRelX, WATER_LEVEL_Y, camRelZ);
    skyDome.visible = isPerspective3D;
    if (isPerspective3D) {
      skyDome.position.set(camRelX, 0, camRelZ);
    }

    // Update nearby landmark groups (waterfalls & bridges) in floating-origin coordinates
    const landmarkRange = Math.max(isPerspective3D ? 4200 : 2800, cameraZoom * 5.2);
    for (let i = 0; i < waterfallAnchors.length; i++) {
      const wf = waterfallAnchors[i];
      const dist = Math.hypot(wf.worldX - centerWorldX, wf.worldZ - centerWorldZ);
      wf.group.visible = dist < landmarkRange;
      if (wf.group.visible) {
        wf.group.position.set(wf.worldX - originX, 0, wf.worldZ - originZ);
      }
    }
    for (let i = 0; i < bridgeAnchors.length; i++) {
      const br = bridgeAnchors[i];
      const dist = Math.hypot(br.worldX - centerWorldX, br.worldZ - centerWorldZ);
      br.group.visible = dist < landmarkRange;
      if (br.group.visible) {
        br.group.position.set(br.worldX - originX, 0, br.worldZ - originZ);
      }
    }

    // Stream & animate dense wall-to-wall old-city quarters around all nearby historic cities
    historicCityQuarters.update(
      delta,
      centerWorldX,
      centerWorldZ,
      originX,
      originZ,
      isPerspective3D,
      activeCityIndices
    );

    // Staggered billboard yaw updates are already handled in the nearChunks loop above
    if (Math.abs(cameraYaw - lastBillboardYaw) > 0.032) {
      lastBillboardYaw = cameraYaw;
    }

    // Animate 2000s pixel-art water & waterfalls
    waterfallClock += delta;
    const steppedTime = Math.floor(waterfallClock * 12) / 12;
    waterfallTex.offset.y = (steppedTime * 1.4) % 1;
    pixelWaterTex.offset.x = (steppedTime * 0.12) % 1;
    pixelWaterTex.offset.y = (steppedTime * 0.08) % 1;
    foamRingMat.opacity = 0.55 + Math.sin(steppedTime * 4.0) * 0.18;

    // Weather particles around camera resolved to regional local climate in Floating-Origin coordinates
    const localClimate = getEffectiveClimateAt(centerWorldX, centerWorldZ, climate);
    if (localClimate === 'desert_sandstorm') {
      skyTintTarget.setHex(0xebd2a9);
    } else if (localClimate === 'northern_blizzard') {
      skyTintTarget.setHex(0xd6e4f0);
    } else if (localClimate === 'monsoon_rain') {
      skyTintTarget.setHex(0x9fb5c7);
    } else {
      skyTintTarget.setHex(0xffffff);
    }
    skyDomeMat.color.lerp(skyTintTarget, Math.min(1, delta * 2.5));

    if (localClimate === 'temperate_clear') {
      particleMat.opacity = 0;
      weatherPoints.visible = false;
      terrainMat.roughness = 0.9;
      return;
    }

    weatherPoints.visible = true;
    const pAttr = particleGeom.getAttribute('position') as THREE.BufferAttribute;

    if (localClimate === 'northern_blizzard') {
      particleMat.color.setHex(0xe0f2fe);
      particleMat.size = 4.0;
      particleMat.opacity = 0.85;
      terrainMat.roughness = 0.82;
    } else if (localClimate === 'desert_sandstorm') {
      particleMat.color.setHex(0xfbbf24);
      particleMat.size = 3.5;
      particleMat.opacity = 0.78;
      terrainMat.roughness = 0.94;
    } else if (localClimate === 'monsoon_rain') {
      particleMat.color.setHex(0x93c5fd);
      particleMat.size = 3.0;
      particleMat.opacity = 0.8;
      terrainMat.roughness = 0.65;
    }

    const halfSpan = 55;
    for (let i = 0; i < particleCount; i++) {
      let px = pAttr.getX(i);
      let py = pAttr.getY(i);
      let pz = pAttr.getZ(i);

      if (localClimate === 'northern_blizzard') {
        px += Math.sin(py * 0.3 + i) * 3.8 * delta;
        py -= 10.0 * delta;
        pz += 4.5 * delta;
      } else if (localClimate === 'desert_sandstorm') {
        px += 28.0 * delta;
        py -= 3.4 * delta;
        pz += Math.cos(i + px * 0.1) * 7.0 * delta;
      } else {
        px += 6.5 * delta;
        py -= 34.0 * delta;
        pz += 4.5 * delta;
      }

      if (py < 0.5) {
        py = 38 + (i % 7);
        px = camRelX + ((i * 17.3) % (halfSpan * 2)) - halfSpan;
        pz = camRelZ + ((i * 31.7) % (halfSpan * 2)) - halfSpan;
      }

      if (px - camRelX > halfSpan) px -= halfSpan * 2;
      if (px - camRelX < -halfSpan) px += halfSpan * 2;
      if (pz - camRelZ > halfSpan) pz -= halfSpan * 2;
      if (pz - camRelZ < -halfSpan) pz += halfSpan * 2;

      pAttr.setXYZ(i, px, py, pz);
    }

    pAttr.needsUpdate = true;
  };

  const dispose = () => {
    for (const entry of nearChunks.values()) disposeChunk(entry);
    nearChunks.clear();
    for (const entry of horizonChunks.values()) disposeChunk(entry);
    horizonChunks.clear();
    terrainMeshes.length = 0;

    historicCityQuarters.dispose();

    waterfallAnchors.forEach((wf) => {
      wf.group.traverse((child) => {
        if ((child as THREE.Mesh).geometry && (child as THREE.Mesh).geometry !== foamRingGeom) {
          (child as THREE.Mesh).geometry.dispose();
        }
      });
      root.remove(wf.group);
    });
    bridgeAnchors.forEach((br) => {
      br.group.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      });
      root.remove(br.group);
    });

    outerOceanBed.geometry.dispose();
    outerOceanMat.dispose();
    waterPlane.geometry.dispose();
    waterMaterial.dispose();
    pixelWaterTex.dispose();
    surfaceTexture.dispose();
    coarseSurfaceTexture.dispose();
    terrainMat.dispose();
    coarseMat.dispose();
    rockGeom.dispose();
    rockMat.dispose();
    skyDomeGeom.dispose();
    skyDomeMat.dispose();
    waterfallTex.dispose();
    waterfallMat.dispose();
    foamRingGeom.dispose();
    foamRingMat.dispose();
    bridgeMat.dispose();
    particleGeom.dispose();
    particleMat.dispose();
  };

  return {
    root,
    terrainMeshes,
    waterMaterial,
    getActiveChunkCount: () => nearChunks.size + horizonChunks.size,
    weatherSystem: {
      points: weatherPoints,
      update: updateWeatherAndChunks,
    },
    dispose,
  };
}
