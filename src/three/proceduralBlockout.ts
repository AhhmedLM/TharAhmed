import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BannerPatternKind,
  CultureKind,
  normalizeCultureKind,
  ResourceKind,
  StructureKind,
  StructureLevel,
  UnitKind,
} from '../shared/protocol';
import { SHARED_VISION_UNIFORMS } from './visionSystem';

/**
 * ============================================================================
 * 2000s ISOMETRIC PIXEL-ART 3D ARCHITECTURAL ENGINE
 * ============================================================================
 * Combines:
 * 1. 128x128 Hand-Crafted Procedural Pixel-Art Architectural Facade Textures
 *    (Tudor half-timber X-bracing & leaded windows, Abbasid horseshoe arches &
 *    mashrabiya screens + Zellige mosaic friezes, Viking stave planks & runes,
 *    East Asian vermilion colonnades & glowing shoji lattice grids).
 * 2. Multi-part 3D Architectural Compounds (Courtyard walls, arched gates,
 *    Lathe onion domes, extruded gable roofs, swept pagoda eaves, minarets,
 *    flying buttresses, bazaar tents, fountains, gardens, waterwheels & cranes).
 */

export function applyRetroPixelShader(
  material: THREE.MeshStandardMaterial,
  options?: { enableVisionFog?: boolean; enableOutline?: boolean }
): void {
  const enableVisionFog = Boolean(options?.enableVisionFog);
  const enableOutline = options?.enableOutline !== false;
  material.flatShading = true;
  material.customProgramCacheKey = () =>
    `retro_pixel_v3_${enableVisionFog ? 'vis' : 'novis'}_${enableOutline ? 'ol' : 'nool'}`;
  material.onBeforeCompile = (shader) => {
    if (enableVisionFog) {
      shader.uniforms.uVisionTex = SHARED_VISION_UNIFORMS.uVisionTex;
      shader.uniforms.uVisionCenterRelXZ = SHARED_VISION_UNIFORMS.uVisionCenterRelXZ;
      shader.uniforms.uVisionInvSpan = SHARED_VISION_UNIFORMS.uVisionInvSpan;
      shader.uniforms.uVisionEnabled = SHARED_VISION_UNIFORMS.uVisionEnabled;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec2 vVisionRelXZ;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 visWorldPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          visWorldPos = instanceMatrix * visWorldPos;
        #endif
        visWorldPos = modelMatrix * visWorldPos;
        vVisionRelXZ = visWorldPos.xz;
        `
      );
    }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      ${
        enableVisionFog
          ? `
      uniform sampler2D uVisionTex;
      uniform vec2 uVisionCenterRelXZ;
      uniform float uVisionInvSpan;
      uniform float uVisionEnabled;
      varying vec2 vVisionRelXZ;
      `
          : ''
      }
      float bayerDither4x4(vec2 pos) {
        vec2 p4 = floor(mod(pos, 4.0));
        vec2 c2 = floor(p4 * 0.5);
        vec2 f2 = mod(p4, 2.0);
        float fine = mod(f2.x * 2.0 + f2.y * 3.0, 4.0);
        float coarse = mod(c2.x * 2.0 + c2.y * 3.0, 4.0);
        return (fine * 4.0 + coarse) / 16.0;
      }
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      ${
        enableOutline
          ? `
      vec3 viewDir = normalize(vViewPosition);
      float ndotv = abs(dot(normal, viewDir));
      float spriteOutline = smoothstep(0.10, 0.28, ndotv);
      gl_FragColor.rgb *= mix(0.35, 1.0, spriteOutline);
      `
          : ''
      }

      ${
        enableVisionFog
          ? `
      if (uVisionEnabled > 0.5) {
        vec2 visUv = (vVisionRelXZ - uVisionCenterRelXZ) * uVisionInvSpan + 0.5;
        vec2 visSample = vec2(0.0, 0.0);
        if (visUv.x >= 0.0 && visUv.x <= 1.0 && visUv.y >= 0.0 && visUv.y <= 1.0) {
          visSample = texture2D(uVisionTex, visUv).rg;
        }
        float liveVis = smoothstep(0.10, 0.82, visSample.r);
        float exploredVis = step(0.45, visSample.g);
        vec3 fogTint = vec3(0.24, 0.29, 0.36);
        vec3 shroudedCol = mix(gl_FragColor.rgb * 0.56, fogTint, 0.34);
        vec3 exploredCol = mix(gl_FragColor.rgb * 0.80, fogTint, 0.14);
        vec3 darkAreaCol = mix(shroudedCol, exploredCol, exploredVis);
        gl_FragColor.rgb = mix(darkAreaCol, gl_FragColor.rgb, liveVis);
      }
      `
          : ''
      }

      float ditherShift = (bayerDither4x4(gl_FragCoord.xy) - 0.5) * (1.0 / 22.0);
      vec3 dithered = clamp(gl_FragColor.rgb + vec3(ditherShift), 0.0, 1.0);
      gl_FragColor.rgb = floor(dithered * 24.0 + 0.5) / 24.0;
      `
    );
  };
}

// ============================================================================
// 128x128 PIXEL-ART ARCHITECTURAL FACADE & ROOF TEXTURE GENERATORS
// ============================================================================

function createCulturalFacadeTexture(rawCulture: CultureKind): THREE.CanvasTexture {
  const culture = normalizeCultureKind(rawCulture);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  if (culture === 'iraqi_mesopotamian') {
    // Warm golden Mesopotamian kiln-baked brick (آجر مرقاب والرافدين)
    ctx.fillStyle = '#ecd1a1';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      ctx.fillStyle = '#b9874c';
      ctx.fillRect(0, y, 64, 1);
      const shift = (y / 8) % 2 === 0 ? 0 : 8;
      for (let x = shift; x < 64; x += 16) {
        ctx.fillRect(x, y, 1, 8);
      }
    }
    // Turquoise & Gold Mesopotamian glazed tile friezes
    ctx.fillStyle = '#0d9488';
    ctx.fillRect(0, 0, 64, 6);
    ctx.fillRect(0, 56, 64, 8);
    ctx.fillStyle = '#fbbf24';
    for (let x = 0; x < 64; x += 8) {
      ctx.fillRect(x + 2, 2, 4, 2);
      ctx.fillRect(x + 2, 58, 4, 3);
    }
    // Twin Pointed Arched Shanasheel Windows with carved cedar lattice
    [12, 38].forEach((wx) => {
      ctx.fillStyle = '#6b3a1c';
      ctx.fillRect(wx - 2, 16, 18, 28);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(wx, 18, 14, 24);
      ctx.fillStyle = '#522911';
      for (let gx = wx; gx < wx + 14; gx += 3) {
        ctx.fillRect(gx, 18, 1, 24);
      }
      for (let gy = 18; gy < 42; gy += 3) {
        ctx.fillRect(wx, gy, 14, 1);
      }
    });
  } else if (culture === 'levantine_shami') {
    // Authentic Levantine Ablaq Masonry (الحجر الأبلق الدمشقي والبازلت الأسود)
    for (let y = 0; y < 64; y += 8) {
      const isDarkBand = (y / 8) % 2 === 1;
      ctx.fillStyle = isDarkBand ? '#4a4642' : '#f1ebe0';
      ctx.fillRect(0, y, 64, 8);
      ctx.fillStyle = isDarkBand ? '#2e2b28' : '#c9bfa8';
      ctx.fillRect(0, y + 7, 64, 1);
      const shift = isDarkBand ? 8 : 0;
      for (let x = shift; x < 64; x += 16) {
        ctx.fillRect(x, y, 1, 8);
      }
    }
    // Carved golden-ochre stone frieze near roofline
    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, 0, 64, 4);
    ctx.fillStyle = '#f59e0b';
    for (let x = 2; x < 64; x += 8) {
      ctx.fillRect(x, 1, 4, 2);
    }
    // Pointed Levantine Stone Arched Windows with warm interior light
    [10, 38].forEach((wx) => {
      ctx.fillStyle = '#292524';
      ctx.fillRect(wx - 1, 16, 16, 26);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(wx + 1, 18, 12, 22);
      // Fine Damascene stone mullion & arch trim
      ctx.fillStyle = '#44403c';
      ctx.fillRect(wx + 6, 18, 2, 22);
      ctx.fillRect(wx + 1, 26, 12, 2);
    });
  } else if (culture === 'hejazi_arabian') {
    // Hejazi Whitewashed Manqabi Coral-Limestone + Dark Carved Wooden Roshan Bay Windows (رواشين حجازية)
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(0, 0, 64, 64);
    // Horizontal wooden tie-beams (تكاليل خشبية) characteristic of Hejazi walls
    ctx.fillStyle = '#8b6239';
    ctx.fillRect(0, 14, 64, 2);
    ctx.fillRect(0, 44, 64, 2);
    // Warm coral-stone base plinth
    ctx.fillStyle = '#d6c5ab';
    ctx.fillRect(0, 52, 64, 12);
    // Tall projecting carved dark-teak Roshan lattice screens spanning central bays
    [8, 36].forEach((rx) => {
      ctx.fillStyle = '#4a2811';
      ctx.fillRect(rx, 6, 20, 38);
      ctx.fillStyle = '#7c431d';
      ctx.fillRect(rx + 2, 8, 16, 34);
      // Warm amber glow peeking through the wooden louver slats
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(rx + 4, 12, 12, 24);
      ctx.fillStyle = '#4a2811';
      for (let gy = 12; gy <= 36; gy += 3) {
        ctx.fillRect(rx + 3, gy, 14, 1);
      }
      ctx.fillRect(rx + 9, 10, 2, 28);
    });
  } else {
    // bedouin_nomadic: Woven Black Goat-Hair Tent Fabric (بيت الشعر) + Crimson/Ivory/Gold Sadu Geometric Stripes
    ctx.fillStyle = '#27211e';
    ctx.fillRect(0, 0, 64, 64);
    // Subtle vertical woven wool grain
    for (let x = 0; x < 64; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? '#322a26' : '#1d1816';
      ctx.fillRect(x, 0, 2, 64);
    }
    // Traditional Crimson & Ivory Sadu geometric bands (نقوش السدو البدوية)
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(0, 10, 64, 10);
    ctx.fillRect(0, 46, 64, 8);
    ctx.fillStyle = '#f5efe6';
    for (let x = 0; x < 64; x += 8) {
      ctx.fillRect(x + 2, 12, 4, 2);
      ctx.fillRect(x + 1, 14, 6, 2);
      ctx.fillRect(x + 2, 16, 4, 2);
      ctx.fillRect(x + 2, 49, 4, 2);
    }
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 9, 64, 1);
    ctx.fillRect(0, 20, 64, 1);
    ctx.fillRect(0, 45, 64, 1);
    // Warm tent doorway lantern glow
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(26, 26, 12, 14);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(25, 25, 14, 2);
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

function createPixelRoofShingleTexture(
  primaryHex: string,
  secondaryHex: string,
  highlightHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 64, 64);

  for (let y = 0; y < 64; y += 6) {
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(0, y + 5, 64, 1);
    const shift = (y / 6) % 2 === 0 ? 0 : 4;
    for (let x = shift; x < 64; x += 8) {
      ctx.fillStyle = secondaryHex;
      ctx.fillRect(x, y, 1, 6);
      ctx.fillStyle = highlightHex;
      ctx.fillRect((x + 2) % 64, y + 1, 5, 2);
    }
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

function createPixelStripedAwningTexture(
  stripeHex: string,
  secondaryHex = '#fbbf24'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  for (let x = 0; x < 64; x += 8) {
    ctx.fillStyle = (x / 8) % 2 === 0 ? stripeHex : secondaryHex;
    ctx.fillRect(x, 0, 8, 64);
  }
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 56, 64, 2);
  ctx.fillStyle = secondaryHex;
  ctx.fillRect(0, 58, 64, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const HERALDIC_FLAG_MAT_CACHE = new Map<string, THREE.MeshBasicMaterial>();

function createHeraldicFlagTexture(
  primaryHex: string,
  secondaryHex: string,
  pattern: BannerPatternKind
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 20;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 20);

  // Swallowtail medieval flag silhouette with 1px dark outline
  for (let y = 1; y < 19; y++) {
    const notch = Math.abs(y - 10);
    const maxX = 24 + Math.floor(notch * 0.75);
    for (let x = 0; x <= maxX; x++) {
      const isBorder =
        y === 1 || y === 18 || x === 0 || x >= maxX - 1;
      const isInnerTrim =
        y === 2 || y === 17 || x === 1 || x === 2;
      ctx.fillStyle = isBorder
        ? '#0f172a'
        : isInnerTrim
          ? secondaryHex
          : primaryHex;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Draw crisp pixel-art Heraldic Emblem in secondaryHex centered at (13, 10)
  ctx.fillStyle = secondaryHex;
  const cx = 13;
  const cy = 10;

  if (pattern === 'crescent_star') {
    // Crescent moon + star
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const d1 = dx * dx + dy * dy;
        const d2 = (dx - 2) * (dx - 2) + dy * dy;
        if (d1 <= 24 && d2 > 14) {
          ctx.fillRect(cx + dx, cy + dy, 1, 1);
        }
      }
    }
    ctx.fillRect(cx + 3, cy - 1, 3, 3);
    ctx.fillRect(cx + 4, cy - 2, 1, 5);
    ctx.fillRect(cx + 2, cy, 5, 1);
  } else if (pattern === 'crossed_swords') {
    for (let i = -5; i <= 5; i++) {
      ctx.fillRect(cx + i, cy + i, 2, 2);
      ctx.fillRect(cx + i, cy - i, 2, 2);
    }
    ctx.fillRect(cx - 5, cy + 3, 3, 1);
    ctx.fillRect(cx + 3, cy + 3, 3, 1);
  } else if (pattern === 'crusader_cross') {
    ctx.fillRect(cx - 1, cy - 6, 3, 13);
    ctx.fillRect(cx - 6, cy - 1, 13, 3);
    ctx.fillRect(cx - 3, cy - 6, 7, 1);
    ctx.fillRect(cx - 3, cy + 6, 7, 1);
  } else if (pattern === 'royal_lion') {
    // Crowned royal crest
    ctx.fillRect(cx - 5, cy - 4, 2, 5);
    ctx.fillRect(cx - 1, cy - 5, 3, 6);
    ctx.fillRect(cx + 4, cy - 4, 2, 5);
    ctx.fillRect(cx - 5, cy, 11, 2);
    ctx.fillRect(cx - 3, cy + 2, 7, 3);
    ctx.fillRect(cx - 1, cy + 5, 3, 1);
  } else if (pattern === 'nordic_raven') {
    // Spread wings + raven head
    ctx.fillRect(cx, cy - 5, 2, 10);
    ctx.fillRect(cx - 6, cy - 2, 14, 2);
    ctx.fillRect(cx - 4, cy, 10, 2);
    ctx.fillRect(cx - 2, cy + 2, 6, 2);
  } else {
    // imperial_sun: 8-ray sunburst
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 10) {
          ctx.fillRect(cx + dx, cy + dy, 1, 1);
        }
      }
    }
    ctx.fillRect(cx, cy - 6, 1, 13);
    ctx.fillRect(cx - 6, cy, 13, 1);
    for (let i = -4; i <= 4; i++) {
      ctx.fillRect(cx + i, cy + i, 1, 1);
      ctx.fillRect(cx + i, cy - i, 1, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const MAX_FACTION_CACHE_ENTRIES = 120;

function setBoundedMaterialCache<M extends THREE.Material & { map?: THREE.Texture | null }>(
  cache: Map<string, M>,
  key: string,
  mat: M
): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_FACTION_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      if (oldest) {
        oldest.map?.dispose();
        oldest.dispose();
      }
    }
  }
  cache.set(key, mat);
}

function getHeraldicFlagMaterial(
  primaryHex: string,
  secondaryHex: string,
  pattern: BannerPatternKind
): THREE.MeshBasicMaterial {
  const key = `${primaryHex}_${secondaryHex}_${pattern}`;
  let mat = HERALDIC_FLAG_MAT_CACHE.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: createHeraldicFlagTexture(primaryHex, secondaryHex, pattern),
      transparent: true,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    });
    setBoundedMaterialCache(HERALDIC_FLAG_MAT_CACHE, key, mat);
  } else {
    HERALDIC_FLAG_MAT_CACHE.delete(key);
    HERALDIC_FLAG_MAT_CACHE.set(key, mat);
  }
  return mat;
}

function buildHeraldicBannerGroup(
  kind: StructureKind,
  level: StructureLevel,
  primaryHex: string,
  secondaryHex: string,
  pattern: BannerPatternKind
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'heraldicBannerGroup';
  const flagMat = getHeraldicFlagMaterial(primaryHex, secondaryHex, pattern);
  const secondaryTrimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(secondaryHex),
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
  });

  // Determine flagpole placements for each building kind
  const poles: Array<{ x: number; y: number; z: number; poleH: number; flagW: number; flagH: number }> = [];
  if (kind === 'keep') {
    const scaleH = level === 1 ? 0.88 : level === 2 ? 1.08 : 1.32;
    const topY = 1.0 + 4.2 * scaleH;
    // Main tall royal standard above the central keep + 2 front bastion flags
    poles.push({ x: 0, y: topY + 1.85, z: 0, poleH: 2.4, flagW: 1.85, flagH: 1.15 });
    poles.push({ x: -2.45, y: 0.8 + 4.2 * scaleH + 0.8, z: 2.45, poleH: 1.7, flagW: 1.25, flagH: 0.8 });
    poles.push({ x: 2.45, y: 0.8 + 4.2 * scaleH + 0.8, z: 2.45, poleH: 1.7, flagW: 1.25, flagH: 0.8 });
  } else if (kind === 'watchtower') {
    const h = 3.8 + level * 1.25;
    poles.push({ x: 0, y: 1.3 + h + 1.65, z: 0, poleH: 2.1, flagW: 1.6, flagH: 1.0 });
  } else if (kind === 'barracks') {
    const scaleH = level === 1 ? 0.9 : level === 2 ? 1.1 : 1.3;
    poles.push({ x: -0.35, y: 0.4 + 2.1 * scaleH + 1.25, z: -0.65, poleH: 1.9, flagW: 1.5, flagH: 0.95 });
  } else if (kind === 'temple') {
    poles.push({ x: 1.65, y: 2.4 + level * 0.55, z: 1.65, poleH: 1.8, flagW: 1.35, flagH: 0.85 });
  } else if (kind === 'market') {
    poles.push({ x: 0, y: 3.15 + level * 0.35, z: -1.05, poleH: 1.7, flagW: 1.35, flagH: 0.85 });
  } else if (kind === 'house') {
    poles.push({ x: 0.55, y: 2.65 + level * 0.35, z: 0.65, poleH: 1.35, flagW: 1.05, flagH: 0.68 });
  } else if (kind === 'bedouin_tent') {
    const ridgeH = 1.75 + level * 0.35;
    poles.push({ x: 0, y: ridgeH, z: 1.25, poleH: 1.55, flagW: 1.25, flagH: 0.8 });
    if (level >= 2) {
      poles.push({ x: -1.35, y: ridgeH * 0.9, z: 0, poleH: 1.35, flagW: 1.05, flagH: 0.68 });
      poles.push({ x: 1.35, y: ridgeH * 0.9, z: 0, poleH: 1.35, flagW: 1.05, flagH: 0.68 });
    }
  } else if (kind === 'war_tent') {
    const peakH = 2.45 + level * 0.5;
    poles.push({ x: 0, y: peakH, z: 0, poleH: 1.85, flagW: 1.55, flagH: 0.98 });
    poles.push({ x: -1.35, y: 1.4, z: 1.55, poleH: 1.65, flagW: 1.25, flagH: 0.82 });
    poles.push({ x: 1.35, y: 1.4, z: 1.55, poleH: 1.65, flagW: 1.25, flagH: 0.82 });
  } else if (kind === 'livestock_ranch') {
    poles.push({ x: -1.25, y: 2.15 + level * 0.25, z: -0.95, poleH: 1.45, flagW: 1.15, flagH: 0.75 });
  } else if (kind === 'horse_stable') {
    poles.push({ x: -1.15, y: 2.45 + level * 0.3, z: -0.95, poleH: 1.75, flagW: 1.4, flagH: 0.9 });
    if (level >= 2) {
      poles.push({ x: 1.15, y: 1.35, z: 1.65, poleH: 1.45, flagW: 1.15, flagH: 0.75 });
    }
  } else {
    poles.push({ x: 0, y: 2.65 + level * 0.3, z: 0, poleH: 1.4, flagW: 1.1, flagH: 0.7 });
  }

  poles.forEach((p) => {
    const poleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, p.poleH, 5),
      secondaryTrimMat
    );
    poleMesh.position.set(p.x, p.y + p.poleH * 0.5, p.z);
    group.add(poleMesh);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), secondaryTrimMat);
    finial.position.set(p.x, p.y + p.poleH + 0.06, p.z);
    group.add(finial);

    const flagPlane = new THREE.Mesh(new THREE.PlaneGeometry(p.flagW, p.flagH), flagMat);
    flagPlane.position.set(p.x + p.flagW * 0.5, p.y + p.poleH - p.flagH * 0.52, p.z);
    group.add(flagPlane);
  });

  return group;
}

function createPixelStoneAshlarTexture(baseHex: string, mortarHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 64, 64);

  for (let y = 0; y < 64; y += 8) {
    ctx.fillStyle = mortarHex;
    ctx.fillRect(0, y, 64, 1);
    const offset = (y / 8) % 2 === 0 ? 0 : 8;
    for (let x = offset; x < 64; x += 16) {
      ctx.fillStyle = mortarHex;
      ctx.fillRect(x, y, 1, 8);
    }
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

const SHARED_MATERIALS = {
  accentGold: new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xb45309,
    emissiveIntensity: 0.18,
    roughness: 0.3,
    metalness: 0.72,
    flatShading: true,
  }),
  windowGlow: new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.85,
    roughness: 0.2,
    metalness: 0.1,
    flatShading: true,
  }),
  darkArch: new THREE.MeshStandardMaterial({
    color: 0x1c1917,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  }),
  foliage: new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.78,
    metalness: 0.05,
    flatShading: true,
  }),
  waterPool: new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x0284c7,
    emissiveIntensity: 0.3,
    roughness: 0.15,
    metalness: 0.35,
    flatShading: true,
  }),
  terracotta: new THREE.MeshStandardMaterial({
    color: 0xea580c,
    roughness: 0.72,
    metalness: 0.08,
    flatShading: true,
  }),
  forgeFire: new THREE.MeshStandardMaterial({
    color: 0xff5722,
    emissive: 0xea580c,
    emissiveIntensity: 0.95,
    roughness: 0.25,
    flatShading: true,
  }),
  armor: new THREE.MeshStandardMaterial({
    color: 0xdbe4ee,
    roughness: 0.45,
    metalness: 0.55,
    flatShading: true,
  }),
  treeTrunk: new THREE.MeshStandardMaterial({
    color: 0x654321,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  }),
  treeCanopy: new THREE.MeshStandardMaterial({
    color: 0x1e7e34,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  }),
  soil: new THREE.MeshStandardMaterial({
    color: 0x542c12,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  }),
  wheat: new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.75,
    metalness: 0.08,
    flatShading: true,
  }),
  stone: new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.85,
    metalness: 0.06,
    flatShading: true,
  }),
  darkStone: new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: true,
  }),
};

Object.values(SHARED_MATERIALS).forEach((mat) => applyRetroPixelShader(mat));

interface CultureMaterialSet {
  plasterWall: THREE.MeshStandardMaterial;
  carvedStone: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  roofTile: THREE.MeshStandardMaterial;
  secondaryRoof: THREE.MeshStandardMaterial;
}

const CULTURE_MATERIAL_POOL = new Map<CultureKind, CultureMaterialSet>();

function getCultureMaterials(rawCulture: CultureKind): CultureMaterialSet {
  const culture = normalizeCultureKind(rawCulture);
  let set = CULTURE_MATERIAL_POOL.get(culture);
  if (set) return set;

  const facadeTex = createCulturalFacadeTexture(culture);

  if (culture === 'iraqi_mesopotamian') {
    const plasterWall = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: facadeTex,
      roughness: 0.8,
      flatShading: true,
    });
    const carvedStone = new THREE.MeshStandardMaterial({
      color: 0xe6be7e,
      map: createPixelStoneAshlarTexture('#e6be7e', '#9a6b2f'),
      roughness: 0.85,
      flatShading: true,
    });
    const timber = new THREE.MeshStandardMaterial({
      color: 0x6b3e26,
      roughness: 0.78,
      flatShading: true,
    });
    const roofTile = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      map: createPixelRoofShingleTexture('#0d9488', '#115e59', '#5eead4'),
      roughness: 0.4,
      metalness: 0.25,
      flatShading: true,
    });
    const secondaryRoof = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      map: createPixelRoofShingleTexture('#0284c7', '#075985', '#7dd3fc'),
      roughness: 0.4,
      metalness: 0.25,
      flatShading: true,
    });
    [plasterWall, carvedStone, timber, roofTile, secondaryRoof].forEach((m) =>
      applyRetroPixelShader(m)
    );
    set = { plasterWall, carvedStone, timber, roofTile, secondaryRoof };
  } else if (culture === 'levantine_shami') {
    const plasterWall = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: facadeTex,
      roughness: 0.82,
      flatShading: true,
    });
    const carvedStone = new THREE.MeshStandardMaterial({
      color: 0xd8d1c4,
      map: createPixelStoneAshlarTexture('#e7e0d2', '#44403c'),
      roughness: 0.86,
      flatShading: true,
    });
    const timber = new THREE.MeshStandardMaterial({
      color: 0x5c341d,
      roughness: 0.82,
      flatShading: true,
    });
    const roofTile = new THREE.MeshStandardMaterial({
      color: 0xc2410c,
      map: createPixelRoofShingleTexture('#b45309', '#78350f', '#fbbf24'),
      roughness: 0.62,
      flatShading: true,
    });
    const secondaryRoof = new THREE.MeshStandardMaterial({
      color: 0x78716c,
      map: createPixelRoofShingleTexture('#78716c', '#44403c', '#d6d3d1'),
      roughness: 0.52,
      metalness: 0.18,
      flatShading: true,
    });
    [plasterWall, carvedStone, timber, roofTile, secondaryRoof].forEach((m) =>
      applyRetroPixelShader(m)
    );
    set = { plasterWall, carvedStone, timber, roofTile, secondaryRoof };
  } else if (culture === 'hejazi_arabian') {
    const plasterWall = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: facadeTex,
      roughness: 0.78,
      flatShading: true,
    });
    const carvedStone = new THREE.MeshStandardMaterial({
      color: 0xefe7d8,
      map: createPixelStoneAshlarTexture('#f4ede0', '#b8a58a'),
      roughness: 0.84,
      flatShading: true,
    });
    const timber = new THREE.MeshStandardMaterial({
      color: 0x542c13,
      roughness: 0.74,
      flatShading: true,
    });
    const roofTile = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      map: createPixelRoofShingleTexture('#d97706', '#92400e', '#fde68a'),
      roughness: 0.5,
      metalness: 0.15,
      flatShading: true,
    });
    const secondaryRoof = new THREE.MeshStandardMaterial({
      color: 0xe7dfd1,
      map: createPixelRoofShingleTexture('#ede6d6', '#b8a58a', '#ffffff'),
      roughness: 0.65,
      flatShading: true,
    });
    [plasterWall, carvedStone, timber, roofTile, secondaryRoof].forEach((m) =>
      applyRetroPixelShader(m)
    );
    set = { plasterWall, carvedStone, timber, roofTile, secondaryRoof };
  } else {
    // bedouin_nomadic: Charcoal Goat-Hair Wool + Warm Sandstone Base + Crimson/Gold Sadu Weave
    const plasterWall = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: facadeTex,
      roughness: 0.9,
      flatShading: true,
    });
    const carvedStone = new THREE.MeshStandardMaterial({
      color: 0xc9a97c,
      map: createPixelStoneAshlarTexture('#d4b483', '#7c5d36'),
      roughness: 0.88,
      flatShading: true,
    });
    const timber = new THREE.MeshStandardMaterial({
      color: 0x6b3e1b,
      roughness: 0.86,
      flatShading: true,
    });
    const roofTile = new THREE.MeshStandardMaterial({
      color: 0x2c2421,
      map: createPixelRoofShingleTexture('#2c2421', '#14100e', '#574a44'),
      roughness: 0.92,
      flatShading: true,
    });
    const secondaryRoof = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      map: createPixelStripedAwningTexture('#b91c1c', '#f5efe6'),
      roughness: 0.82,
      flatShading: true,
    });
    [plasterWall, carvedStone, timber, roofTile, secondaryRoof].forEach((m) =>
      applyRetroPixelShader(m)
    );
    set = { plasterWall, carvedStone, timber, roofTile, secondaryRoof };
  }

  CULTURE_MATERIAL_POOL.set(culture, set);
  return set;
}

const FACTION_MATERIAL_POOL = new Map<string, THREE.MeshStandardMaterial>();

export function getSharedFactionMaterial(
  colorHex: string,
  secondaryHex = '#fbbf24'
): THREE.MeshStandardMaterial {
  const key = `${colorHex}_${secondaryHex}`;
  let mat = FACTION_MATERIAL_POOL.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: createPixelStripedAwningTexture(colorHex, secondaryHex),
      roughness: 0.55,
      metalness: 0.15,
      flatShading: true,
    });
    applyRetroPixelShader(mat);
    setBoundedMaterialCache(FACTION_MATERIAL_POOL, key, mat);
  } else {
    FACTION_MATERIAL_POOL.delete(key);
    FACTION_MATERIAL_POOL.set(key, mat);
  }
  return mat;
}

// ============================================================================
// CUSTOM ARCHITECTURAL GEOMETRY PRIMITIVES (Gables, Onion Domes, Pagoda Eaves, Arches)
// ============================================================================

function xform(
  geom: THREE.BufferGeometry,
  px: number,
  py: number,
  pz: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  g.scale(sx, sy, sz);
  if (rx !== 0) g.rotateX(rx);
  if (ry !== 0) g.rotateY(ry);
  if (rz !== 0) g.rotateZ(rz);
  g.translate(px, py, pz);
  geom.dispose();
  return g;
}

function safeMerge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | undefined {
  if (list.length === 0) return undefined;
  const normalized = list.map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    if (!nonIdx.getAttribute('normal')) {
      nonIdx.computeVertexNormals();
    }
    if (!nonIdx.getAttribute('uv')) {
      const count = nonIdx.getAttribute('position').count;
      nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    return nonIdx;
  });
  const merged = mergeGeometries(normalized, false);
  normalized.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function createPitchedGableRoof(
  w: number,
  h: number,
  d: number,
  px: number,
  py: number,
  pz: number,
  ry = 0
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: false,
  });
  extrude.translate(0, 0, -d / 2);
  return xform(extrude, px, py, pz, 0, ry, 0);
}

function createOnionDome(
  radius: number,
  height: number,
  px: number,
  py: number,
  pz: number,
  segments = 10
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(radius * 0.88, height * 0.08),
    new THREE.Vector2(radius * 1.08, height * 0.34),
    new THREE.Vector2(radius * 0.92, height * 0.62),
    new THREE.Vector2(radius * 0.48, height * 0.84),
    new THREE.Vector2(radius * 0.12, height * 0.96),
    new THREE.Vector2(0.01, height),
  ];
  const lathe = new THREE.LatheGeometry(pts, segments);
  return xform(lathe, px, py, pz);
}

function addGlowingWindows(
  cx: number,
  cy: number,
  cz: number,
  count: number,
  spacing: number,
  alongZ: boolean,
  windowGeoms: THREE.BufferGeometry[],
  timberGeoms: THREE.BufferGeometry[]
) {
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const offset = start + i * spacing;
    const wx = alongZ ? cx : cx + offset;
    const wz = alongZ ? cz + offset : cz;
    const wBox = alongZ
      ? new THREE.BoxGeometry(0.16, 0.52, 0.38)
      : new THREE.BoxGeometry(0.38, 0.52, 0.16);
    const frameBox = alongZ
      ? new THREE.BoxGeometry(0.2, 0.14, 0.48)
      : new THREE.BoxGeometry(0.48, 0.14, 0.2);
    windowGeoms.push(xform(wBox, wx, cy, wz));
    timberGeoms.push(xform(frameBox, wx, cy - 0.28, wz));
  }
}

interface BakedStructureTemplate {
  lod0: {
    plasterWall?: THREE.BufferGeometry;
    carvedStone?: THREE.BufferGeometry;
    timber?: THREE.BufferGeometry;
    roofTile?: THREE.BufferGeometry;
    secondaryRoof?: THREE.BufferGeometry;
    factionCloth?: THREE.BufferGeometry;
    accentGold?: THREE.BufferGeometry;
    windowGlow?: THREE.BufferGeometry;
    darkArch?: THREE.BufferGeometry;
    foliage?: THREE.BufferGeometry;
    waterPool?: THREE.BufferGeometry;
    terracotta?: THREE.BufferGeometry;
    forgeFire?: THREE.BufferGeometry;
  };
}

const STRUCTURE_TEMPLATE_CACHE = new Map<string, BakedStructureTemplate>();

function getBakedStructureTemplate(
  kind: StructureKind,
  level: StructureLevel,
  rawCulture: CultureKind = 'iraqi_mesopotamian',
  variant: 0 | 1 | 2 = 0
): BakedStructureTemplate {
  const culture = normalizeCultureKind(rawCulture);
  const effectiveVariant = kind === 'house' ? variant : 0;
  const key = `${kind}_L${level}_${culture}_v${effectiveVariant}`;
  const cached = STRUCTURE_TEMPLATE_CACHE.get(key);
  if (cached) return cached;

  const plasterGeoms: THREE.BufferGeometry[] = [];
  const stoneGeoms: THREE.BufferGeometry[] = [];
  const timberGeoms: THREE.BufferGeometry[] = [];
  const roofGeoms: THREE.BufferGeometry[] = [];
  const secRoofGeoms: THREE.BufferGeometry[] = [];
  const factionGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];
  const windowGeoms: THREE.BufferGeometry[] = [];
  const archGeoms: THREE.BufferGeometry[] = [];
  const foliageGeoms: THREE.BufferGeometry[] = [];
  const waterGeoms: THREE.BufferGeometry[] = [];
  const terracottaGeoms: THREE.BufferGeometry[] = [];
  const fireGeoms: THREE.BufferGeometry[] = [];

  // ==========================================================================
  // 1. RESIDENTIAL QUARTERS (أحياء سكنية متلاصقة الجدران ومختلفة التخطيط)
  // ==========================================================================
  if (kind === 'house') {
    // Deep subterranean stone footing skirt so residential compounds never float on sloped plateaus/mesas
    stoneGeoms.push(xform(new THREE.BoxGeometry(3.72, 1.8, 3.72), 0, -0.88, 0));
    if (culture === 'iraqi_mesopotamian') {
      // Dense Wall-to-Wall Mesopotamian Mahalla Block (4 flush attached houses with varied plans)
      stoneGeoms.push(xform(new THREE.BoxGeometry(3.65, 0.36, 3.65), 0, 0.18, 0));
      // House A (North-West tall courtyard house with Shanasheel)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.92, 2.35, 1.88), -0.82, 1.52, -0.84));
      timberGeoms.push(xform(new THREE.BoxGeometry(1.38, 0.72, 0.48), -0.82, 1.98, 0.24));
      addGlowingWindows(-0.82, 1.98, 0.49, 2, 0.46, false, windowGeoms, timberGeoms);
      // House B (North-East flush domed diwan attached wall-to-wall to House A)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.74, 1.88, 1.96), 0.92, 1.28, -0.8));
      roofGeoms.push(createOnionDome(0.76, 1.18, 0.92, 2.22, -0.8));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.11, 0.46, 6), 0.92, 3.45, -0.8));
      // House C (South-West stepped L-wing flush with House A)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.62, 1.62, 1.72), -0.96, 1.15, 0.92));
      plasterGeoms.push(xform(new THREE.BoxGeometry(0.95, 2.1, 0.95), -1.26, 1.4, 1.2));
      addGlowingWindows(-1.78, 1.45, 0.92, 2, 0.48, true, windowGeoms, timberGeoms);
      // House D (South-East low patio home + shared inner courtyard fountain & date palm)
      stoneGeoms.push(xform(new THREE.BoxGeometry(1.85, 0.92, 0.24), 0.85, 0.82, 1.66));
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.24, 0.92, 1.65), 1.66, 0.82, 0.92));
      plasterGeoms.push(xform(new THREE.BoxGeometry(0.88, 1.48, 1.15), 1.32, 1.08, 0.56));
      // Sabat alley bridge linking House A & House D over the narrow courtyard lane
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.18, 0.86, 0.92), 0.26, 2.08, 0.28));
      timberGeoms.push(xform(new THREE.BoxGeometry(1.24, 0.14, 0.98), 0.26, 1.62, 0.28));
      // Inner courtyard basin & date palm
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.42, 0.48, 0.28, 8), 0.42, 0.48, 1.12));
      waterGeoms.push(xform(new THREE.CylinderGeometry(0.32, 0.32, 0.32, 8), 0.42, 0.5, 1.12));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.09, 0.12, 1.45, 5), 1.08, 1.05, 1.24));
      foliageGeoms.push(xform(new THREE.ConeGeometry(0.62, 0.52, 6), 1.08, 1.88, 1.24));
      factionGeoms.push(xform(new THREE.BoxGeometry(1.2, 0.14, 0.78), 0.25, 1.55, 0.95, 0.24, 0, 0));

      if (level >= 2) {
        // Tall Iraqi Barjeel Windcatcher Tower (بارجيل) + 2nd Story Shanasheel Annex
        plasterGeoms.push(xform(new THREE.BoxGeometry(0.92, 3.55, 0.92), -1.12, 2.12, -1.05));
        archGeoms.push(xform(new THREE.BoxGeometry(0.98, 0.62, 0.42), -1.12, 3.3, -1.05));
        archGeoms.push(xform(new THREE.BoxGeometry(0.42, 0.62, 0.98), -1.12, 3.3, -1.05));
        timberGeoms.push(xform(new THREE.BoxGeometry(1.14, 0.22, 1.14), -1.12, 3.92, -1.05));
        plasterGeoms.push(xform(new THREE.BoxGeometry(1.42, 1.28, 1.28), -0.92, 2.55, 0.92));
        secRoofGeoms.push(createOnionDome(0.64, 0.98, -0.92, 3.18, 0.92));
      }
      if (level === 3) {
        // Grand Noble Quarter: Golden Cupola, 3rd Story Terrace & Cypress
        goldGeoms.push(createOnionDome(0.98, 1.65, 0.92, 2.32, -0.8));
        plasterGeoms.push(xform(new THREE.BoxGeometry(1.25, 1.1, 1.25), 0.95, 2.52, 0.88));
        addGlowingWindows(0.95, 2.52, 1.52, 2, 0.44, false, windowGeoms, timberGeoms);
        foliageGeoms.push(xform(new THREE.ConeGeometry(0.36, 1.85, 6), -1.52, 1.25, 1.52));
      }
    } else if (culture === 'levantine_shami') {
      // Dense Wall-to-Wall Shami Ablaq Stone Quarter (حي شامي متلاصق بالحجر الأبلق والبحرة والقباب)
      stoneGeoms.push(xform(new THREE.BoxGeometry(3.68, 0.44, 3.68), 0, 0.22, 0));
      // House A (North main two-story Ablaq Liwan house with pitched terracotta roof)
      plasterGeoms.push(xform(new THREE.BoxGeometry(2.15, 2.25, 1.72), -0.72, 1.55, -0.92));
      roofGeoms.push(createPitchedGableRoof(2.28, 0.85, 1.84, -0.72, 2.68, -0.92, Math.PI / 2));
      // House B (East flush domed stone townhouse attached wall-to-wall)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.52, 1.92, 2.24), 1.04, 1.38, -0.66));
      secRoofGeoms.push(createOnionDome(0.68, 0.95, 1.04, 2.34, -0.66, 8));
      // House C (West stepped courtyard wing flush with House A)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.42, 1.68, 1.85), -1.06, 1.26, 0.86));
      plasterGeoms.push(xform(new THREE.BoxGeometry(0.92, 2.15, 0.92), -1.28, 1.5, 1.24));
      // Pointed stone Iwan opening onto shared Damascene courtyard & fountain (بحرة)
      archGeoms.push(xform(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 8), -0.45, 1.05, -0.02, Math.PI / 2, 0, 0));
      stoneGeoms.push(xform(new THREE.BoxGeometry(2.05, 0.92, 0.26), 0.72, 0.88, 1.68));
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.26, 0.92, 1.48), 1.68, 0.88, 1.02));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.48, 0.54, 0.32, 8), 0.36, 0.58, 0.92));
      waterGeoms.push(xform(new THREE.CylinderGeometry(0.36, 0.36, 0.36, 8), 0.36, 0.61, 0.92));
      addGlowingWindows(-0.65, 1.95, -0.04, 2, 0.65, false, windowGeoms, timberGeoms);
      addGlowingWindows(-1.78, 1.48, 0.86, 2, 0.5, true, windowGeoms, timberGeoms);
      // Courtyard olive/citrus tree + Sabat stone arch
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.25, 0.78, 0.82), 0.15, 2.02, 0.18));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.1, 0.13, 1.1, 6), 1.18, 0.98, 1.22));
      foliageGeoms.push(xform(new THREE.SphereGeometry(0.54, 7, 5), 1.18, 1.66, 1.22));

      if (level >= 2) {
        // Upper Damascene Reception Hall (القاعة الشامية العلوية) + Secondary Vaulted Wing
        plasterGeoms.push(xform(new THREE.BoxGeometry(1.48, 1.25, 1.38), 0.65, 2.95, -0.82));
        secRoofGeoms.push(createOnionDome(0.78, 1.12, 0.65, 3.55, -0.82, 10));
        addGlowingWindows(0.65, 2.95, -0.1, 2, 0.52, false, windowGeoms, timberGeoms);
        plasterGeoms.push(xform(new THREE.BoxGeometry(1.28, 1.15, 1.25), -1.06, 2.65, 0.88));
      }
      if (level === 3) {
        // Grand Shami Noble Quarter Finial, Rooftop Gallery & Tall Cypresses
        goldGeoms.push(xform(new THREE.ConeGeometry(0.15, 0.72, 6), 0.65, 4.74, -0.82));
        foliageGeoms.push(xform(new THREE.ConeGeometry(0.35, 2.1, 6), -1.55, 1.48, 1.48));
        factionGeoms.push(xform(new THREE.BoxGeometry(1.4, 0.14, 0.85), 0.45, 1.85, 0.75, 0.2, 0, 0));
      }
    } else if (culture === 'hejazi_arabian') {
      // Dense Wall-to-Wall Hejazi Coral-Stone Tower Quarter (3-4 flush whitewashed Roshan towers)
      stoneGeoms.push(xform(new THREE.BoxGeometry(3.62, 0.4, 3.62), 0, 0.2, 0));
      const h1 = level === 1 ? 2.55 : level === 2 ? 3.35 : 4.15;
      const h2 = level === 1 ? 2.15 : level === 2 ? 2.85 : 3.55;
      const h3 = level === 1 ? 1.85 : level === 2 ? 2.45 : 3.05;
      // Tower House A (Tallest coral-stone tower, NW)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.88, h1, 1.92), -0.84, 0.4 + h1 * 0.5, -0.82));
      timberGeoms.push(xform(new THREE.BoxGeometry(1.26, 0.98, 0.46), -0.84, 1.82, 0.26));
      addGlowingWindows(-0.84, 1.82, 0.5, 2, 0.46, false, windowGeoms, timberGeoms);
      timberGeoms.push(xform(new THREE.BoxGeometry(2.02, 0.3, 2.06), -0.84, 0.4 + h1 + 0.15, -0.82));
      // Tower House B (Flush medium tower, NE, attached zero-gap)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.72, h2, 1.88), 0.92, 0.4 + h2 * 0.5, -0.84));
      timberGeoms.push(xform(new THREE.BoxGeometry(0.46, 0.96, 1.18), 1.84, 1.65, -0.84));
      addGlowingWindows(2.08, 1.65, -0.84, 2, 0.44, true, windowGeoms, timberGeoms);
      timberGeoms.push(xform(new THREE.BoxGeometry(1.84, 0.26, 2.0), 0.92, 0.4 + h2 + 0.13, -0.84));
      // Tower House C (Flush stepped front house, SW)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.66, h3, 1.72), -0.94, 0.4 + h3 * 0.5, 0.92));
      timberGeoms.push(xform(new THREE.BoxGeometry(1.12, 0.82, 0.44), -0.94, 1.48, 1.84));
      addGlowingWindows(-0.94, 1.48, 2.08, 2, 0.42, false, windowGeoms, timberGeoms);
      // Shaded lower alley Sabat bridge & courtyard well + palm (SE)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.15, 0.92, 1.05), 0.88, 1.75, 0.72));
      archGeoms.push(xform(new THREE.CylinderGeometry(0.36, 0.36, 0.95, 8), 0.88, 0.85, 1.15, Math.PI / 2, 0, 0));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.4, 0.46, 0.38, 8), 0.35, 0.55, 1.25));
      waterGeoms.push(xform(new THREE.CylinderGeometry(0.28, 0.28, 0.42, 8), 0.35, 0.58, 1.25));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.1, 0.14, 1.65, 5), 1.32, 1.12, 1.28));
      foliageGeoms.push(xform(new THREE.ConeGeometry(0.66, 0.52, 6), 1.32, 2.02, 1.28));

      if (level >= 2) {
        // Second-story stacked Roshan bay & ochre merchant dome
        timberGeoms.push(xform(new THREE.BoxGeometry(1.48, 0.92, 0.52), -0.84, 3.02, 0.28));
        addGlowingWindows(-0.84, 3.02, 0.56, 3, 0.42, false, windowGeoms, timberGeoms);
        roofGeoms.push(createOnionDome(0.72, 1.02, 0.92, 0.4 + h2 + 0.24, -0.84, 8));
      }
      if (level === 3) {
        // Grand Hejazi Merchant Quarter Cupola & Golden Finial
        goldGeoms.push(createOnionDome(0.88, 1.35, -0.84, 0.4 + h1 + 0.26, -0.82, 10));
        goldGeoms.push(xform(new THREE.ConeGeometry(0.14, 0.68, 6), -0.84, 0.4 + h1 + 1.7, -0.82));
        factionGeoms.push(xform(new THREE.BoxGeometry(1.4, 0.14, 0.82), 0.25, 1.4, 1.25, 0.24, 0, 0));
      }
    } else {
      // bedouin_nomadic: Dense Tribal Cluster of 3-4 Goat-Hair Tents (حي مضارب وبيوت شعر بدوية)
      terracottaGeoms.push(xform(new THREE.CylinderGeometry(2.55, 2.75, 0.22, 8), 0, 0.11, 0));
      const tentW = level === 1 ? 2.95 : level === 2 ? 3.4 : 3.85;
      const tentD = level === 1 ? 1.85 : level === 2 ? 2.15 : 2.4;
      const ridgeH = level === 1 ? 1.55 : level === 2 ? 1.88 : 2.18;
      // Primary Chieftain Majlis Tent (North)
      plasterGeoms.push(xform(new THREE.BoxGeometry(tentW * 0.9, ridgeH * 0.55, tentD * 0.82), 0, 0.22 + ridgeH * 0.28, -0.72));
      roofGeoms.push(
        createPitchedGableRoof(tentW + 0.34, ridgeH * 0.56, tentD + 0.24, 0, 0.22 + ridgeH * 0.54, -0.72, Math.PI / 2)
      );
      secRoofGeoms.push(
        createPitchedGableRoof(tentW + 0.38, ridgeH * 0.25, tentD * 0.46, 0, 0.22 + ridgeH * 0.74, -0.72, Math.PI / 2)
      );
      factionGeoms.push(xform(new THREE.BoxGeometry(tentW + 0.36, 0.16, tentD + 0.26), 0, 0.22 + ridgeH * 0.55, -0.72));
      // Two Closely Clustered Family Side Tents (SW & SE) forming a nomadic camp quarter
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.42, 0.78, 1.38), -1.18, 0.62, 0.92));
      roofGeoms.push(createPitchedGableRoof(1.68, 0.82, 1.62, -1.18, 1.02, 0.92, 0));
      secRoofGeoms.push(createPitchedGableRoof(1.72, 0.32, 0.75, -1.18, 1.28, 0.92, 0));

      plasterGeoms.push(xform(new THREE.BoxGeometry(1.36, 0.72, 1.32), 1.18, 0.58, 0.94));
      roofGeoms.push(createPitchedGableRoof(1.62, 0.78, 1.56, 1.18, 0.96, 0.94, 0));
      // Tent poles
      const poles = level + 2;
      for (let i = 0; i < poles; i++) {
        const px = -tentW * 0.38 + (i / Math.max(1, poles - 1)) * (tentW * 0.76);
        timberGeoms.push(xform(new THREE.CylinderGeometry(0.055, 0.075, ridgeH + 0.26, 5), px, 0.22 + ridgeH * 0.5, -0.72));
      }
      // Central hospitality fire & brass dallah (نار القهوة والضيافة)
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.42, 0.52, 0.24, 7), 0, 0.25, 0.95));
      fireGeoms.push(xform(new THREE.ConeGeometry(0.28, 0.54, 6), 0, 0.52, 0.95));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.12, 0.35, 6), 0.28, 0.38, 0.92));

      if (level >= 2) {
        // Oasis Date Palm & Rear Storage Tent
        timberGeoms.push(xform(new THREE.CylinderGeometry(0.1, 0.14, 1.75, 5), -1.82, 0.96, 1.48));
        foliageGeoms.push(xform(new THREE.ConeGeometry(0.72, 0.52, 6), -1.82, 1.92, 1.48));
        roofGeoms.push(createPitchedGableRoof(1.45, 0.95, 1.35, 1.45, 0.85, -0.35, 0));
      }
      if (level === 3) {
        // Grand Chieftain's Desert Pavilion Crown & Golden Spear Finials
        goldGeoms.push(createOnionDome(0.74, 1.12, 0, 0.22 + ridgeH, -0.72, 8));
        goldGeoms.push(xform(new THREE.ConeGeometry(0.14, 0.64, 6), -tentW * 0.32, 0.22 + ridgeH + 0.34, -0.72));
        goldGeoms.push(xform(new THREE.ConeGeometry(0.14, 0.64, 6), tentW * 0.32, 0.22 + ridgeH + 0.34, -0.72));
      }
    }

    // Apply deterministic architectural silhouette variant so adjacent urban houses vary
    if (effectiveVariant === 1) {
      for (const g of plasterGeoms) g.rotateY(Math.PI / 2);
      for (const g of stoneGeoms) g.rotateY(Math.PI / 2);
      for (const g of timberGeoms) g.rotateY(Math.PI / 2);
      for (const g of roofGeoms) g.rotateY(Math.PI / 2);
      for (const g of secRoofGeoms) g.rotateY(Math.PI / 2);
      for (const g of factionGeoms) g.rotateY(Math.PI / 2);
      for (const g of goldGeoms) g.rotateY(Math.PI / 2);
      for (const g of windowGeoms) g.rotateY(Math.PI / 2);
      for (const g of archGeoms) g.rotateY(Math.PI / 2);
      for (const g of foliageGeoms) g.rotateY(Math.PI / 2);
      for (const g of waterGeoms) g.rotateY(Math.PI / 2);
      // Signature terraced rooftop pavilion turret
      plasterGeoms.push(xform(new THREE.BoxGeometry(0.95, 0.9, 0.95), -0.95, 2.75, -0.95));
      secRoofGeoms.push(createOnionDome(0.55, 0.72, -0.95, 3.2, -0.95, 8));
    } else if (effectiveVariant === 2) {
      for (const g of plasterGeoms) g.rotateY(Math.PI);
      for (const g of stoneGeoms) g.rotateY(Math.PI);
      for (const g of timberGeoms) g.rotateY(Math.PI);
      for (const g of roofGeoms) g.rotateY(Math.PI);
      for (const g of secRoofGeoms) g.rotateY(Math.PI);
      for (const g of factionGeoms) g.rotateY(Math.PI);
      for (const g of goldGeoms) g.rotateY(Math.PI);
      for (const g of windowGeoms) g.rotateY(Math.PI);
      for (const g of archGeoms) g.rotateY(Math.PI);
      for (const g of foliageGeoms) g.rotateY(Math.PI);
      for (const g of waterGeoms) g.rotateY(Math.PI);
      // Twin-arched shaded pergola annex & cypress accent
      timberGeoms.push(xform(new THREE.BoxGeometry(1.45, 0.14, 0.95), 0.85, 2.35, 0.85));
      foliageGeoms.push(xform(new THREE.ConeGeometry(0.32, 1.55, 6), 1.48, 1.15, 1.48));
    }
  }

  // ==========================================================================
  // 2. TRADE MARKETS & BAZAARS (الأسواق التجارية وخانات القوافل)
  // ==========================================================================
  else if (kind === 'market') {
    stoneGeoms.push(xform(new THREE.CylinderGeometry(3.05, 3.35, 1.85, 8), 0, -0.9, 0));
    stoneGeoms.push(xform(new THREE.CylinderGeometry(2.9, 3.1, 0.38, 8), 0, 0.19, 0));
    plasterGeoms.push(xform(new THREE.BoxGeometry(3.6, 1.85, 1.85), 0, 1.3, -1.05));
    addGlowingWindows(0, 1.45, -0.1, 3, 0.95, false, windowGeoms, timberGeoms);

    if (culture === 'iraqi_mesopotamian') {
      roofGeoms.push(createOnionDome(0.95, 1.45, 0, 2.2, -1.05));
      secRoofGeoms.push(createOnionDome(0.65, 1.0, -1.25, 2.2, -1.05));
      secRoofGeoms.push(createOnionDome(0.65, 1.0, 1.25, 2.2, -1.05));
    } else if (culture === 'levantine_shami') {
      // Shami Vaulted Stone Khan Roof + Lead-Stone Cupola
      roofGeoms.push(createPitchedGableRoof(3.85, 1.15, 2.05, 0, 2.2, -1.05, Math.PI / 2));
      secRoofGeoms.push(createOnionDome(0.72, 0.98, 0, 2.85, -1.05, 8));
    } else if (culture === 'hejazi_arabian') {
      // Hejazi Caravan Wakala with upper wooden Roshan gallery & ochre dome
      timberGeoms.push(xform(new THREE.BoxGeometry(3.35, 0.72, 0.52), 0, 1.88, 0.05));
      roofGeoms.push(createOnionDome(0.88, 1.25, 0, 2.25, -1.05, 8));
      secRoofGeoms.push(xform(new THREE.BoxGeometry(3.7, 0.24, 1.95), 0, 2.22, -1.05));
    } else {
      // Bedouin Grand Striped Caravan Tent Bazaar
      roofGeoms.push(createPitchedGableRoof(4.1, 1.45, 2.25, 0, 2.15, -1.05, Math.PI / 2));
      secRoofGeoms.push(createPitchedGableRoof(4.2, 0.55, 1.15, 0, 2.85, -1.05, Math.PI / 2));
    }

    [-1.25, 1.25].forEach((tx, idx) => {
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.08, 0.08, 1.35, 6), tx - 0.55, 1.0, 0.65));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.08, 0.08, 1.35, 6), tx + 0.55, 1.0, 0.65));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.08, 0.08, 1.35, 6), tx - 0.55, 1.0, 1.65));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.08, 0.08, 1.35, 6), tx + 0.55, 1.0, 1.65));
      const canopyGeom = xform(
        new THREE.ConeGeometry(1.15, 0.85, 4),
        tx,
        2.05,
        1.15,
        0,
        Math.PI / 4,
        0
      );
      if (idx === 0) factionGeoms.push(canopyGeom);
      else secRoofGeoms.push(canopyGeom);
      terracottaGeoms.push(xform(new THREE.CylinderGeometry(0.22, 0.16, 0.55, 7), tx - 0.25, 0.65, 1.15));
      goldGeoms.push(xform(new THREE.SphereGeometry(0.24, 6, 5), tx + 0.28, 0.58, 1.15));
    });

    stoneGeoms.push(xform(new THREE.CylinderGeometry(0.55, 0.62, 0.45, 8), 0, 0.55, 0.95));
    waterGeoms.push(xform(new THREE.CylinderGeometry(0.42, 0.42, 0.48, 8), 0, 0.58, 0.95));

    if (level >= 2) {
      plasterGeoms.push(xform(new THREE.BoxGeometry(0.85, 1.65, 2.8), -1.95, 1.2, 0.25));
      plasterGeoms.push(xform(new THREE.BoxGeometry(0.85, 1.65, 2.8), 1.95, 1.2, 0.25));
      secRoofGeoms.push(createPitchedGableRoof(1.1, 0.75, 2.9, -1.95, 2.0, 0.25, 0));
      secRoofGeoms.push(createPitchedGableRoof(1.1, 0.75, 2.9, 1.95, 2.0, 0.25, 0));
    }
    if (level === 3) {
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.75, 0.85, 3.8, 8), 0, 2.3, -1.05));
      goldGeoms.push(createOnionDome(0.92, 1.65, 0, 4.2, -1.05));
    }
  }

  // ==========================================================================
  // 2.5 MULTI-CULTURAL IRRIGATED FARMS & WINDMILLS (المزارع وحقول الري والطواحين)
  // ==========================================================================
  else if (kind === 'farm') {
    // Rich tilled agricultural terrace plinth
    terracottaGeoms.push(xform(new THREE.BoxGeometry(4.2, 0.24, 4.2), 0, 0.12, 0));
    stoneGeoms.push(xform(new THREE.BoxGeometry(4.4, 0.16, 4.4), 0, 0.08, 0));

    // Irrigated water channels & crop furrows across the field
    [-1.2, 0, 1.2].forEach((fz) => {
      waterGeoms.push(xform(new THREE.BoxGeometry(2.3, 0.28, 0.26), 0.75, 0.14, fz));
      foliageGeoms.push(xform(new THREE.BoxGeometry(2.2, 0.36, 0.45), 0.75, 0.28, fz + 0.38));
      if (level >= 2) {
        goldGeoms.push(xform(new THREE.BoxGeometry(2.1, 0.44, 0.28), 0.75, 0.34, fz - 0.35));
      }
    });

    if (culture === 'iraqi_mesopotamian') {
      // Iraqi Tigris/Euphrates Farm: Baked-brick domed granary + Noria waterwheel + Date Palms
      plasterGeoms.push(xform(new THREE.CylinderGeometry(0.85, 0.98, 1.65, 8), -1.15, 0.95, -0.95));
      roofGeoms.push(createOnionDome(0.88, 1.25, -1.15, 1.78, -0.95, 8));
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.45, 1.35, 1.8), -1.25, 0.75, 0.85));
      waterGeoms.push(xform(new THREE.BoxGeometry(0.28, 0.25, 1.75), -1.25, 1.42, 0.85));
      timberGeoms.push(
        xform(new THREE.CylinderGeometry(0.95, 0.95, 0.22, 10), -0.92, 1.25, 0.85, 0, 0, Math.PI / 2)
      );
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.14, 0.2, 1.85, 6), -0.25, 1.05, -1.45));
      foliageGeoms.push(xform(new THREE.ConeGeometry(0.85, 0.65, 6), -0.25, 2.1, -1.45));
    } else if (culture === 'levantine_shami') {
      // Shami Ghouta / Orontes Farm: Ablaq stone press-house, terracotta gable, olive grove & Hama noria wheel
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.75, 1.45, 2.25), -1.12, 0.88, -0.45));
      roofGeoms.push(createPitchedGableRoof(1.98, 0.88, 2.45, -1.12, 1.6, -0.45, 0));
      timberGeoms.push(
        xform(new THREE.CylinderGeometry(0.92, 0.92, 0.2, 10), -0.92, 1.15, 1.05, 0, 0, Math.PI / 2)
      );
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.12, 0.16, 1.25, 6), -0.2, 0.85, -1.45));
      foliageGeoms.push(xform(new THREE.SphereGeometry(0.68, 7, 5), -0.2, 1.65, -1.45));
    } else if (culture === 'hejazi_arabian') {
      // Hejazi Oasis Farm: White coral-stone granary, stone well, wooden arbor & twin date palms
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.65, 1.65, 1.65), -1.12, 0.98, -0.85));
      roofGeoms.push(createOnionDome(0.82, 1.05, -1.12, 1.82, -0.85, 8));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.55, 0.62, 0.65, 8), -1.15, 0.48, 0.95));
      waterGeoms.push(xform(new THREE.CylinderGeometry(0.42, 0.42, 0.68, 8), -1.15, 0.52, 0.95));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.13, 0.18, 1.95, 6), -0.25, 1.08, -1.45));
      foliageGeoms.push(xform(new THREE.ConeGeometry(0.88, 0.62, 6), -0.25, 2.15, -1.45));
    } else {
      // Bedouin Oasis Pasture & Herdsman Tent (مضرب الرعاة والواحة)
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.65, 1.05, 2.25), -1.12, 0.68, -0.35));
      roofGeoms.push(createPitchedGableRoof(1.95, 0.85, 2.45, -1.12, 1.22, -0.35, 0));
      secRoofGeoms.push(createPitchedGableRoof(2.02, 0.35, 1.2, -1.12, 1.65, -0.35, 0));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.12, 0.17, 1.85, 5), -0.25, 1.02, -1.45));
      foliageGeoms.push(xform(new THREE.ConeGeometry(0.8, 0.58, 6), -0.25, 2.02, -1.45));
    }

    if (level >= 2) {
      // Secondary Golden Grain Silo
      plasterGeoms.push(xform(new THREE.CylinderGeometry(0.58, 0.65, 1.75, 8), -1.15, 1.0, 1.15));
      secRoofGeoms.push(xform(new THREE.ConeGeometry(0.72, 0.85, 8), -1.15, 2.25, 1.15));
    }
    if (level === 3) {
      goldGeoms.push(xform(new THREE.SphereGeometry(0.35, 8, 6), -1.15, 2.8, 1.15));
    }
  }

  // ==========================================================================
  // 2.6 LIVESTOCK RANCH & COTTON / WOOL WEAVERY (مراح المواشي وحقول القطن ومغزل القماش)
  // ==========================================================================
  else if (kind === 'livestock_ranch') {
    // Rich pasture earth & stone base
    stoneGeoms.push(xform(new THREE.BoxGeometry(4.5, 0.18, 4.5), 0, 0.09, 0));
    terracottaGeoms.push(xform(new THREE.BoxGeometry(4.2, 0.22, 4.2), 0, 0.12, 0));

    // Wooden Corral Fence Perimeter (حظيرة المواشي والأغنام والإبل) on the right & front
    const fencePosts: Array<[number, number]> = [
      [-0.2, 1.85],
      [0.9, 1.85],
      [1.95, 1.85],
      [1.95, 0.6],
      [1.95, -0.6],
      [1.95, -1.85],
      [0.9, -1.85],
      [-0.2, -1.85],
    ];
    fencePosts.forEach(([px, pz]) => {
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.08, 0.1, 0.95, 5), px, 0.5, pz));
    });
    // Horizontal corral rails
    [0.38, 0.74].forEach((ry) => {
      timberGeoms.push(xform(new THREE.BoxGeometry(2.2, 0.08, 0.08), 0.88, ry, 1.85));
      timberGeoms.push(xform(new THREE.BoxGeometry(2.2, 0.08, 0.08), 0.88, ry, -1.85));
      timberGeoms.push(xform(new THREE.BoxGeometry(0.08, 0.08, 3.75), 1.95, ry, 0));
    });

    // Watering Trough & Golden Hay Bales inside the Livestock Corral
    timberGeoms.push(xform(new THREE.BoxGeometry(1.15, 0.36, 0.52), 1.25, 0.25, 0.95));
    waterGeoms.push(xform(new THREE.BoxGeometry(0.98, 0.39, 0.38), 1.25, 0.28, 0.95));
    goldGeoms.push(xform(new THREE.CylinderGeometry(0.32, 0.36, 0.52, 7), 1.35, 0.36, -0.95));
    goldGeoms.push(xform(new THREE.CylinderGeometry(0.28, 0.32, 0.45, 7), 0.85, 0.32, -1.15));

    // White Cotton Crop Rows & Fluffy Cotton Bolls (حقول القطن الأبيض والكتان)
    [-0.55, 0.15, 0.85].forEach((cz) => {
      foliageGeoms.push(xform(new THREE.BoxGeometry(1.35, 0.32, 0.36), 0.55, 0.26, cz));
      plasterGeoms.push(xform(new THREE.SphereGeometry(0.19, 6, 5), 0.15, 0.48, cz));
      plasterGeoms.push(xform(new THREE.SphereGeometry(0.21, 6, 5), 0.55, 0.5, cz));
      plasterGeoms.push(xform(new THREE.SphereGeometry(0.19, 6, 5), 0.95, 0.48, cz));
    });

    // Shearing Barn & Textile Loom Workshop on the left (-X)
    plasterGeoms.push(xform(new THREE.BoxGeometry(1.65, 1.45, 2.35), -1.2, 0.88, -0.55));
    if (culture === 'iraqi_mesopotamian' || culture === 'hejazi_arabian') {
      roofGeoms.push(createOnionDome(0.88, 1.2, -1.2, 1.62, -0.55, 8));
    } else if (culture === 'bedouin_nomadic') {
      roofGeoms.push(createPitchedGableRoof(2.05, 0.95, 2.65, -1.2, 1.6, -0.55, 0));
      secRoofGeoms.push(createPitchedGableRoof(2.12, 0.36, 1.25, -1.2, 2.05, -0.55, 0));
    } else {
      roofGeoms.push(createPitchedGableRoof(1.95, 1.0, 2.55, -1.2, 1.6, -0.55, 0));
    }

    // Outdoor Dyeing Vats & Stretched Faction Cloth Loom Frames (مغزل القماش والصباغة)
    timberGeoms.push(xform(new THREE.BoxGeometry(1.35, 1.15, 0.12), -1.15, 0.72, 1.25, -0.22, 0, 0));
    factionGeoms.push(xform(new THREE.BoxGeometry(1.15, 0.95, 0.15), -1.15, 0.74, 1.26, -0.22, 0, 0));

    if (level >= 2) {
      // Lv.2: Covered Camel & Wool Weaving Pavilion + Second Dyed Cloth Canopy
      secRoofGeoms.push(
        xform(new THREE.ConeGeometry(1.15, 0.85, 4), -1.15, 1.95, 1.25, 0, Math.PI / 4, 0)
      );
      factionGeoms.push(xform(new THREE.CylinderGeometry(0.24, 0.24, 0.95, 8), -0.35, 0.35, 1.35, 0, 0, Math.PI / 2));
    }
    if (level === 3) {
      // Lv.3: Royal Tiraz Silk & Gold Brocade Dome + Golden Finials
      goldGeoms.push(createOnionDome(0.68, 1.15, -1.15, 2.25, 1.25, 8));
      goldGeoms.push(xform(new THREE.CylinderGeometry(0.26, 0.26, 1.1, 8), -0.35, 0.65, 1.35, 0, 0, Math.PI / 2));
    }
  }

  // ==========================================================================
  // 2.65 HORSE STABLES & TAMING PADDOCK (مربط وإسطبل الخيول وساحة الترويض)
  // ==========================================================================
  else if (kind === 'horse_stable') {
    // Stone & Compacted Earth Foundation Plinth
    stoneGeoms.push(xform(new THREE.BoxGeometry(4.7, 0.2, 4.7), 0, 0.1, 0));

    // Circular Sand Taming Ring (حلبة ترويض الخيول الرملية) on the front-right (+X, +Z)
    terracottaGeoms.push(xform(new THREE.CylinderGeometry(1.55, 1.65, 0.14, 12), 0.85, 0.22, 0.65));
    // Central Taming Post & Rotating Lunge Beam (عمود الترويض والتدريب الدائري)
    timberGeoms.push(xform(new THREE.CylinderGeometry(0.11, 0.14, 1.35, 6), 0.85, 0.85, 0.65));
    goldGeoms.push(xform(new THREE.SphereGeometry(0.16, 6, 5), 0.85, 1.58, 0.65));
    timberGeoms.push(xform(new THREE.BoxGeometry(1.35, 0.07, 0.07), 0.85, 1.15, 0.65, 0, Math.PI / 6, 0));

    // Octagonal Wooden Taming Paddock Fence Posts & Rails around the Sand Ring
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const fx = 0.85 + Math.cos(ang) * 1.5;
      const fz = 0.65 + Math.sin(ang) * 1.5;
      if (fx < -0.25 && fz < -0.1) continue; // Open passage into the stable stalls
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.07, 0.09, 0.95, 5), fx, 0.58, fz));
    }
    timberGeoms.push(xform(new THREE.TorusGeometry(1.5, 0.05, 5, 12), 0.85, 0.82, 0.65, Math.PI / 2, 0, 0));
    timberGeoms.push(xform(new THREE.TorusGeometry(1.5, 0.05, 5, 12), 0.85, 0.48, 0.65, Math.PI / 2, 0, 0));

    // Arched Horse Stables Hall (إسطبل الخيول المسقوف ومربط الأفراس) along the back & left (-Z, -X)
    plasterGeoms.push(xform(new THREE.BoxGeometry(3.8, 1.65, 1.55), -0.2, 1.02, -1.25));
    // 3 Individual Horse Stall Arched Openings + Timber Stall Dividers
    [-1.25, -0.2, 0.85].forEach((sx) => {
      archGeoms.push(xform(new THREE.BoxGeometry(0.75, 1.15, 0.25), sx, 0.78, -0.48));
      timberGeoms.push(xform(new THREE.BoxGeometry(0.12, 1.35, 1.62), sx + 0.48, 0.88, -1.25));
    });

    // Cultural Roof over the Main Horse Stables Hall
    if (culture === 'iraqi_mesopotamian' || culture === 'hejazi_arabian') {
      roofGeoms.push(createOnionDome(0.95, 1.35, -0.2, 1.85, -1.25, 8));
      secRoofGeoms.push(createOnionDome(0.65, 0.95, -1.45, 1.85, -1.25, 8));
    } else if (culture === 'bedouin_nomadic') {
      roofGeoms.push(createPitchedGableRoof(4.2, 1.1, 1.95, -0.2, 1.85, -1.25, Math.PI / 2));
      secRoofGeoms.push(createPitchedGableRoof(4.25, 0.42, 0.98, -0.2, 2.4, -1.25, Math.PI / 2));
    } else {
      roofGeoms.push(createPitchedGableRoof(4.05, 1.1, 1.85, -0.2, 1.85, -1.25, Math.PI / 2));
    }

    // Watering Trough, Golden Oats/Hay Rack & Faction Saddle Stand (حامل السروج الملكية)
    timberGeoms.push(xform(new THREE.BoxGeometry(1.15, 0.38, 0.48), -1.35, 0.35, 0.35));
    waterGeoms.push(xform(new THREE.BoxGeometry(0.98, 0.4, 0.34), -1.35, 0.38, 0.35));
    goldGeoms.push(xform(new THREE.CylinderGeometry(0.32, 0.36, 0.48, 7), -1.45, 0.38, 1.25));
    factionGeoms.push(xform(new THREE.BoxGeometry(0.85, 0.45, 0.42), -1.35, 0.75, 1.25));

    if (level >= 2) {
      // Lv.2: West Wing Arabian/Imperial Breeding Stalls + Cavalry Jumping Hurdle in Paddock
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.45, 1.55, 2.2), -1.45, 0.98, 0.25));
      secRoofGeoms.push(createPitchedGableRoof(1.7, 1.05, 2.4, -1.45, 1.75, 0.25, 0));
      // Painted red/gold cavalry jumping hurdle bar
      factionGeoms.push(xform(new THREE.BoxGeometry(1.1, 0.12, 0.12), 0.85, 0.68, 1.55));
      goldGeoms.push(xform(new THREE.BoxGeometry(1.12, 0.08, 0.14), 0.85, 0.86, 1.55));
    }
    if (level === 3) {
      // Lv.3: Royal Warhorse Barding Tower & Gilded Cupola (المربط السلطاني للجياد المدرعة)
      goldGeoms.push(createOnionDome(0.85, 1.45, -0.2, 2.45, -1.25, 8));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.18, 0.75, 6), -1.45, 2.85, 0.25));
    }
  }

  // ==========================================================================
  // 2.7 BEDOUIN NOMADIC & SULTANATE TENTS (الخيام والمضارب البدوية وبيوت الشعر)
  // ==========================================================================
  else if (kind === 'bedouin_tent') {
    // Desert Sand & Woven Sadu Carpet Plinth
    terracottaGeoms.push(xform(new THREE.CylinderGeometry(2.45, 2.65, 0.2, 8), 0, 0.1, 0));
    factionGeoms.push(xform(new THREE.BoxGeometry(3.2, 0.08, 2.6), 0, 0.21, 0.15));

    // Traditional Low-Slung Multi-Pole Goat-Hair "Bait Al-Sha'ar" Tent (بيت شعر بدوي أصيل)
    const tentW = level === 1 ? 3.2 : level === 2 ? 3.8 : 4.2;
    const tentD = level === 1 ? 2.3 : level === 2 ? 2.65 : 2.95;
    const ridgeH = level === 1 ? 1.65 : level === 2 ? 1.95 : 2.25;

    // Dark Goat-Hair Canopy Body + Pitched Multi-Peak Ridge
    archGeoms.push(xform(new THREE.BoxGeometry(tentW * 0.92, ridgeH * 0.58, tentD * 0.86), 0, 0.2 + ridgeH * 0.29, -0.25));
    archGeoms.push(
      createPitchedGableRoof(tentW + 0.35, ridgeH * 0.55, tentD + 0.25, 0, 0.2 + ridgeH * 0.55, -0.25, Math.PI / 2)
    );

    // Colorful Woven Sadu Stripes & Faction Cloth Trim across the Tent Roof & Front Flaps
    factionGeoms.push(
      createPitchedGableRoof(tentW + 0.42, ridgeH * 0.28, tentD * 0.52, 0, 0.2 + ridgeH * 0.72, -0.25, Math.PI / 2)
    );
    factionGeoms.push(xform(new THREE.BoxGeometry(tentW + 0.38, 0.18, tentD + 0.28), 0, 0.2 + ridgeH * 0.56, -0.25));

    // Wooden Tent Poles & Guy-Rope Stakes around the perimeter
    const poleCount = level + 2;
    for (let i = 0; i < poleCount; i++) {
      const px = -tentW * 0.42 + (i / Math.max(1, poleCount - 1)) * (tentW * 0.84);
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.06, 0.08, ridgeH + 0.25, 5), px, 0.2 + ridgeH * 0.5, -0.25));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.05, 0.06, ridgeH * 0.65, 5), px, 0.2 + ridgeH * 0.32, tentD * 0.48));
      timberGeoms.push(
        xform(new THREE.CylinderGeometry(0.02, 0.02, 1.15, 4), px, 0.55, tentD * 0.68, 0.65, 0, 0)
      );
    }

    // Warm Bedouin Hospitality Coffee Hearth Fire (نار القهوة والضيافة) & Cushions in front
    stoneGeoms.push(xform(new THREE.CylinderGeometry(0.42, 0.52, 0.24, 7), 0, 0.24, 1.45));
    fireGeoms.push(xform(new THREE.ConeGeometry(0.28, 0.55, 6), 0, 0.52, 1.45));
    goldGeoms.push(xform(new THREE.ConeGeometry(0.12, 0.36, 6), 0.28, 0.38, 1.42));

    if (level >= 2) {
      // Lv.2: Chieftain's Twin-Winged Majlis (مضرب الشيوخ المزدوج) + Oasis Date Palm
      archGeoms.push(createPitchedGableRoof(1.65, 1.15, 1.85, -tentW * 0.44, 0.95, 0.55, 0));
      archGeoms.push(createPitchedGableRoof(1.65, 1.15, 1.85, tentW * 0.44, 0.95, 0.55, 0));
      factionGeoms.push(xform(new THREE.BoxGeometry(1.1, 0.16, 0.45), -0.85, 0.28, 1.05));
      factionGeoms.push(xform(new THREE.BoxGeometry(1.1, 0.16, 0.45), 0.85, 0.28, 1.05));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.11, 0.15, 1.75, 5), -1.85, 0.95, 1.35));
      foliageGeoms.push(xform(new THREE.ConeGeometry(0.75, 0.55, 6), -1.85, 1.9, 1.35));
    }
    if (level === 3) {
      // Lv.3: Grand Sultanate Desert Pavilion Crown & Golden Finials (سرادق البادية السلطاني)
      goldGeoms.push(createOnionDome(0.78, 1.25, 0, 0.2 + ridgeH, -0.25, 8));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.16, 0.65, 6), -tentW * 0.32, 0.2 + ridgeH + 0.35, -0.25));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.16, 0.65, 6), tentW * 0.32, 0.2 + ridgeH + 0.35, -0.25));
    }
  }

  // ==========================================================================
  // 2.8 MILITARY WAR TENTS & IMPERIAL SIEGE PAVILIONS (الخيام والسرادقات الحربية)
  // ==========================================================================
  else if (kind === 'war_tent') {
    // Fortified Military Timber & Stone Plinth
    stoneGeoms.push(xform(new THREE.CylinderGeometry(2.55, 2.75, 0.28, 8), 0, 0.14, 0));

    const radius = level === 1 ? 1.75 : level === 2 ? 2.05 : 2.35;
    const wallH = level === 1 ? 1.25 : level === 2 ? 1.45 : 1.65;
    const coneH = level === 1 ? 1.55 : level === 2 ? 1.85 : 2.15;

    // Octagonal Striped Faction Canvas Tent Walls & Steep Conical Campaign Canopy
    factionGeoms.push(xform(new THREE.CylinderGeometry(radius, radius * 1.06, wallH, 8), 0, 0.28 + wallH * 0.5, -0.15));
    goldGeoms.push(xform(new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, 0.22, 8), 0, 0.28 + wallH, -0.15));
    factionGeoms.push(xform(new THREE.ConeGeometry(radius * 1.12, coneH, 8), 0, 0.28 + wallH + coneH * 0.5, -0.15));
    goldGeoms.push(xform(new THREE.ConeGeometry(0.22, 0.75, 6), 0, 0.28 + wallH + coneH + 0.25, -0.15));

    // Arched Entrance Canopy Flap & Timber Command Posts
    archGeoms.push(xform(new THREE.BoxGeometry(0.95, 1.05, 0.45), 0, 0.8, radius - 0.15));
    secRoofGeoms.push(xform(new THREE.BoxGeometry(1.35, 0.14, 0.95), 0, 1.38, radius + 0.25, 0.22, 0, 0));
    timberGeoms.push(xform(new THREE.CylinderGeometry(0.06, 0.07, 1.35, 5), -0.58, 0.75, radius + 0.6));
    timberGeoms.push(xform(new THREE.CylinderGeometry(0.06, 0.07, 1.35, 5), 0.58, 0.75, radius + 0.6));

    // Exterior Weapon Racks, Spears & Faction Shields Barricade (مخيم الرماح والدروع)
    [-1.45, 1.45].forEach((wx) => {
      timberGeoms.push(xform(new THREE.BoxGeometry(0.85, 0.85, 0.18), wx, 0.65, 1.35));
      factionGeoms.push(xform(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 8), wx, 0.72, 1.46, Math.PI / 2, 0, 0));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.08, 1.65, 5), wx - 0.25, 1.1, 1.35));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.08, 1.65, 5), wx + 0.25, 1.1, 1.35));
    });

    if (level >= 2) {
      // Lv.2: Twin Flanking Command Pavilions (فسطاط الفرسان وأركان الحرب)
      [-1.65, 1.65].forEach((tx) => {
        plasterGeoms.push(xform(new THREE.CylinderGeometry(0.82, 0.88, 1.15, 8), tx, 0.85, -0.45));
        secRoofGeoms.push(xform(new THREE.ConeGeometry(0.95, 1.15, 8), tx, 1.98, -0.45));
        goldGeoms.push(xform(new THREE.ConeGeometry(0.14, 0.5, 6), tx, 2.68, -0.45));
      });
    }
    if (level === 3) {
      // Lv.3: Grand Imperial Siege Pavilion (السرادق الحربي السلطاني) with War Brazier Fires & Golden Dome Crown
      goldGeoms.push(createOnionDome(0.85, 1.35, 0, 0.28 + wallH + coneH * 0.75, -0.15, 8));
      [-1.15, 1.15].forEach((bx) => {
        stoneGeoms.push(xform(new THREE.CylinderGeometry(0.28, 0.35, 0.55, 6), bx, 0.55, 1.85));
        fireGeoms.push(xform(new THREE.ConeGeometry(0.26, 0.55, 6), bx, 1.02, 1.85));
      });
    }
  }

  // ==========================================================================
  // 3. CULTURAL & RELIGIOUS SANCTUARIES (الجامع العراقي / الجامع الشامي / المسجد الحجازي / مضرب المصلى البدوي)
  // ==========================================================================
  else if (kind === 'temple') {
    stoneGeoms.push(xform(new THREE.CylinderGeometry(3.35, 3.7, 2.0, 8), 0, -0.98, 0));
    stoneGeoms.push(xform(new THREE.CylinderGeometry(3.1, 3.4, 0.55, 8), 0, 0.28, 0));
    plasterGeoms.push(xform(new THREE.CylinderGeometry(2.6, 2.8, 0.45, 8), 0, 0.75, 0));
    stoneGeoms.push(xform(new THREE.BoxGeometry(1.4, 0.65, 1.2), 0, 0.45, 2.45, 0.35, 0, 0));

    if (culture === 'iraqi_mesopotamian') {
      // Iraqi Mosque with Turquoise/Gold Ribbed Dome + Cylindrical/Spiral Minaret
      const scaleH = level === 1 ? 0.9 : level === 2 ? 1.1 : 1.3;
      plasterGeoms.push(
        xform(new THREE.CylinderGeometry(2.05, 2.15, 2.2 * scaleH, 8), -0.25, 0.95 + 1.1 * scaleH, -0.15)
      );
      archGeoms.push(xform(new THREE.CylinderGeometry(0.52, 0.52, 1.4, 8), -0.25, 1.55, 1.85, Math.PI / 2, 0, 0));
      addGlowingWindows(-0.25, 1.85, 1.92, 2, 1.2, false, windowGeoms, timberGeoms);
      const domeY = 0.95 + 2.2 * scaleH;
      const mainDome = createOnionDome(1.65, 2.35, -0.25, domeY, -0.15, 12);
      if (level === 3) goldGeoms.push(mainDome);
      else roofGeoms.push(mainDome);
      goldGeoms.push(xform(new THREE.ConeGeometry(0.18, 0.95, 6), -0.25, domeY + 2.5, -0.15));

      const minH = 4.6 * scaleH;
      plasterGeoms.push(xform(new THREE.CylinderGeometry(0.36, 0.64, minH, 10), 1.75, 0.95 + minH / 2, 1.55));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.72, 0.56, 0.36, 10), 1.75, 0.95 + minH * 0.45, 1.55));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.62, 0.48, 0.36, 10), 1.75, 0.95 + minH * 0.78, 1.55));
      secRoofGeoms.push(createOnionDome(0.42, 0.92, 1.75, 0.95 + minH, 1.55, 8));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.12, 0.65, 6), 1.75, 0.95 + minH + 1.0, 1.55));

      if (level >= 2) {
        plasterGeoms.push(xform(new THREE.CylinderGeometry(0.38, 0.58, minH, 10), 1.75, 0.95 + minH / 2, -1.55));
        secRoofGeoms.push(createOnionDome(0.42, 0.92, 1.75, 0.95 + minH, -1.55, 8));
        waterGeoms.push(xform(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 8), -1.65, 1.1, 1.45));
      }
    } else if (culture === 'levantine_shami') {
      // Levantine Shami Umayyad-Style Stone Mosque: Ablaq Hall, Lead Dome & Square Stone Minarets
      const hallH = 2.1 + level * 0.35;
      plasterGeoms.push(xform(new THREE.BoxGeometry(3.5, hallH, 2.55), -0.15, 0.95 + hallH / 2, -0.35));
      archGeoms.push(xform(new THREE.CylinderGeometry(0.48, 0.48, 1.35, 8), -0.15, 1.45, 0.95, Math.PI / 2, 0, 0));
      addGlowingWindows(-0.15, 1.85, 0.96, 3, 0.9, false, windowGeoms, timberGeoms);
      // Iconic Umayyad pitched stone roof + central lead-gray dome
      roofGeoms.push(createPitchedGableRoof(3.75, 0.95, 2.75, -0.15, 0.95 + hallH, -0.35, Math.PI / 2));
      const domeTarget = level === 3 ? goldGeoms : secRoofGeoms;
      domeTarget.push(createOnionDome(1.18, 1.75, -0.15, 0.95 + hallH + 0.55, -0.35, 10));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.16, 0.85, 6), -0.15, 0.95 + hallH + 2.45, -0.35));
      // Iconic Square Levantine Stone Minaret (مئذنة شامية مربعة)
      const sqMinH = 4.4 + level * 0.55;
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.88, sqMinH, 0.88), 1.65, 0.95 + sqMinH / 2, 1.35));
      timberGeoms.push(xform(new THREE.BoxGeometry(1.12, 0.25, 1.12), 1.65, 0.95 + sqMinH * 0.78, 1.35));
      secRoofGeoms.push(createOnionDome(0.48, 0.85, 1.65, 0.95 + sqMinH, 1.35, 8));
      // Courtyard ablution fountain
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.65, 0.72, 0.36, 8), -0.55, 1.08, 1.55));
      waterGeoms.push(xform(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), -0.55, 1.12, 1.55));

      if (level >= 2) {
        stoneGeoms.push(xform(new THREE.BoxGeometry(0.84, sqMinH * 0.92, 0.84), -1.75, 0.95 + sqMinH * 0.46, 1.35));
        secRoofGeoms.push(createOnionDome(0.46, 0.8, -1.75, 0.95 + sqMinH * 0.92, 1.35, 8));
      }
    } else if (culture === 'hejazi_arabian') {
      // Hejazi White-Stone Arcaded Sanctuary & Slender Octagonal Minarets
      const hallH = 2.0 + level * 0.38;
      plasterGeoms.push(xform(new THREE.BoxGeometry(3.3, hallH, 2.8), 0, 0.95 + hallH / 2, -0.15));
      // Repeating shaded white arcade bays along front
      [-1.0, 0, 1.0].forEach((ax) => {
        archGeoms.push(xform(new THREE.CylinderGeometry(0.36, 0.36, 0.85, 8), ax, 1.45, 1.28, Math.PI / 2, 0, 0));
      });
      const domeY = 0.95 + hallH;
      const mainDome = createOnionDome(1.45, 2.05, 0, domeY, -0.15, 10);
      if (level === 3) goldGeoms.push(mainDome);
      else roofGeoms.push(mainDome);
      goldGeoms.push(xform(new THREE.ConeGeometry(0.16, 0.85, 6), 0, domeY + 2.15, -0.15));
      // Slender white octagonal Hejazi minarets with carved wood galleries
      const minH = 4.6 + level * 0.55;
      plasterGeoms.push(xform(new THREE.CylinderGeometry(0.34, 0.46, minH, 8), 1.65, 0.95 + minH / 2, 1.45));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.62, 0.56, 0.3, 8), 1.65, 0.95 + minH * 0.72, 1.45));
      secRoofGeoms.push(xform(new THREE.ConeGeometry(0.42, 1.15, 8), 1.65, 0.95 + minH + 0.55, 1.45));
      if (level >= 2) {
        plasterGeoms.push(xform(new THREE.CylinderGeometry(0.34, 0.46, minH, 8), -1.65, 0.95 + minH / 2, 1.45));
        timberGeoms.push(xform(new THREE.CylinderGeometry(0.62, 0.56, 0.3, 8), -1.65, 0.95 + minH * 0.72, 1.45));
        secRoofGeoms.push(xform(new THREE.ConeGeometry(0.42, 1.15, 8), -1.65, 0.95 + minH + 0.55, 1.45));
      }
    } else {
      // Bedouin Desert Musalla & Tribal Council Grand Pavilion (مصلى البادية وسرادق الشيوخ)
      const tentH = 1.9 + level * 0.35;
      // Open cedar colonnade pillars holding a vast black-and-crimson Sadu canopy
      [
        [-1.65, -1.35],
        [1.65, -1.35],
        [-1.65, 1.35],
        [1.65, 1.35],
        [0, -1.35],
        [0, 1.35],
      ].forEach(([cx, cz]) => {
        timberGeoms.push(xform(new THREE.CylinderGeometry(0.11, 0.14, tentH, 6), cx, 0.95 + tentH / 2, cz));
      });
      // Woven back prayer wall & Mihrab stone arch
      stoneGeoms.push(xform(new THREE.BoxGeometry(3.4, 1.35, 0.36), 0, 1.62, -1.45));
      archGeoms.push(xform(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 8), 0, 1.65, -1.25, Math.PI / 2, 0, 0));
      roofGeoms.push(createPitchedGableRoof(4.2, 1.55, 3.6, 0, 0.95 + tentH, 0, Math.PI / 2));
      secRoofGeoms.push(createPitchedGableRoof(4.3, 0.62, 1.65, 0, 0.95 + tentH + 0.85, 0, Math.PI / 2));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.2, 0.9, 6), 0, 0.95 + tentH + 1.85, 0));
      // Flanking desert fire braziers
      [-1.55, 1.55].forEach((bx) => {
        stoneGeoms.push(xform(new THREE.CylinderGeometry(0.32, 0.42, 0.65, 6), bx, 1.25, 1.85));
        fireGeoms.push(xform(new THREE.ConeGeometry(0.28, 0.62, 6), bx, 1.78, 1.85));
      });
    }
  }

  // ==========================================================================
  // 4. MAIN ROYAL CITADEL KEEP (القلعة الرئيسية — Regional Citadel / Tribal Encampment)
  // ==========================================================================
  else if (kind === 'keep') {
    const scaleH = level === 1 ? 0.88 : level === 2 ? 1.08 : 1.32;
    // Deep battered citadel foundation skirt so hilltop & mesa keeps sit solidly in bedrock
    stoneGeoms.push(xform(new THREE.CylinderGeometry(4.25, 4.9, 2.4, 8), 0, -1.18, 0));
    stoneGeoms.push(xform(new THREE.CylinderGeometry(3.8, 4.3, 1.0, 8), 0, 0.5, 0));
    // Outer Fortress Curtain Walls connecting the bastions
    if (culture === 'bedouin_nomadic') {
      // Timber-and-stone desert palisade walls for Bedouin stronghold
      timberGeoms.push(xform(new THREE.BoxGeometry(4.8, 1.95, 0.42), 0, 1.65, -2.35));
      timberGeoms.push(xform(new THREE.BoxGeometry(0.42, 1.95, 4.8), -2.35, 1.65, 0));
      timberGeoms.push(xform(new THREE.BoxGeometry(0.42, 1.95, 4.8), 2.35, 1.65, 0));
    } else {
      stoneGeoms.push(xform(new THREE.BoxGeometry(4.8, 2.2, 0.45), 0, 1.8, -2.35));
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.45, 2.2, 4.8), -2.35, 1.8, 0));
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.45, 2.2, 4.8), 2.35, 1.8, 0));
    }

    if (culture === 'bedouin_nomadic') {
      // Grand Chieftain's Multi-Peak Desert War Pavilion Keep (مضرب الإمارة الكبير)
      const pavH = 2.6 * scaleH;
      plasterGeoms.push(xform(new THREE.CylinderGeometry(2.35, 2.6, pavH, 8), 0, 1.0 + pavH / 2, 0));
      roofGeoms.push(xform(new THREE.ConeGeometry(2.95, 2.35 * scaleH, 8), 0, 1.0 + pavH + 1.15 * scaleH, 0));
      secRoofGeoms.push(xform(new THREE.CylinderGeometry(2.68, 2.75, 0.45, 8), 0, 1.0 + pavH, 0));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.24, 1.2, 6), 0, 1.0 + pavH + 2.45 * scaleH, 0));
      // Wooden desert gatehouse towers + blazing torches
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.75, 0.88, 2.9, 8), -1.15, 1.95, 2.35));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.75, 0.88, 2.9, 8), 1.15, 1.95, 2.35));
      fireGeoms.push(xform(new THREE.ConeGeometry(0.32, 0.65, 6), -1.15, 3.65, 2.35));
      fireGeoms.push(xform(new THREE.ConeGeometry(0.32, 0.65, 6), 1.15, 3.65, 2.35));
      archGeoms.push(xform(new THREE.CylinderGeometry(0.65, 0.65, 1.6, 8), 0, 1.55, 2.45, Math.PI / 2, 0, 0));
    } else {
      plasterGeoms.push(
        xform(
          culture === 'levantine_shami'
            ? new THREE.BoxGeometry(3.8, 4.1 * scaleH, 3.8)
            : new THREE.CylinderGeometry(2.25, 2.45, 4.2 * scaleH, 8),
          0,
          1.0 + 2.05 * scaleH,
          0
        )
      );
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.85, 0.95, 3.2, 8), -1.15, 2.1, 2.35));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.85, 0.95, 3.2, 8), 1.15, 2.1, 2.35));
      archGeoms.push(xform(new THREE.CylinderGeometry(0.65, 0.65, 1.8, 8), 0, 1.55, 2.45, Math.PI / 2, 0, 0));
      timberGeoms.push(xform(new THREE.BoxGeometry(1.4, 0.22, 1.6), 0, 0.65, 3.35, 0.28, 0, 0));
      addGlowingWindows(0, 2.9 * scaleH, 2.05, 2, 0.9, false, windowGeoms, timberGeoms);
      addGlowingWindows(0, 2.9 * scaleH, -2.05, 2, 0.9, false, windowGeoms, timberGeoms);

      const topY = 1.0 + 4.15 * scaleH;
      if (culture === 'iraqi_mesopotamian') {
        roofGeoms.push(createOnionDome(1.85, 2.5, 0, topY, 0, 12));
        goldGeoms.push(xform(new THREE.ConeGeometry(0.22, 1.1, 6), 0, topY + 2.6, 0));
      } else if (culture === 'levantine_shami') {
        // Levantine Crenellated Stone Citadel Crown + Lead Stone Dome (قلعة دمشق وحلب والقدس)
        stoneGeoms.push(xform(new THREE.BoxGeometry(4.15, 0.55, 4.15), 0, topY + 0.15, 0));
        secRoofGeoms.push(createOnionDome(1.55, 1.95, 0, topY + 0.35, 0, 10));
        goldGeoms.push(xform(new THREE.ConeGeometry(0.2, 0.95, 6), 0, topY + 2.4, 0));
      } else {
        // Hejazi White Fortress Palace with Upper Carved Roshan Gallery & Ochre Dome
        timberGeoms.push(xform(new THREE.BoxGeometry(3.2, 0.85, 3.2), 0, topY - 0.55, 0));
        roofGeoms.push(createOnionDome(1.65, 2.15, 0, topY, 0, 10));
        goldGeoms.push(xform(new THREE.ConeGeometry(0.2, 1.05, 6), 0, topY + 2.25, 0));
      }
    }

    const towerCoords = [
      [-2.45, -2.45],
      [2.45, -2.45],
      [-2.45, 2.45],
      [2.45, 2.45],
    ];

    towerCoords.forEach(([ox, oz]) => {
      const th = (culture === 'bedouin_nomadic' ? 3.2 : 4.2) * scaleH;
      if (culture === 'levantine_shami') {
        // Square Levantine stone corner bastions with crenellated tops
        stoneGeoms.push(xform(new THREE.BoxGeometry(1.55, th, 1.55), ox, 0.8 + th / 2, oz));
        stoneGeoms.push(xform(new THREE.BoxGeometry(1.78, 0.42, 1.78), ox, 0.8 + th + 0.15, oz));
        secRoofGeoms.push(createOnionDome(0.72, 1.05, ox, 0.8 + th + 0.32, oz, 8));
      } else if (culture === 'bedouin_nomadic') {
        // Timber & sandstone desert bastion watch-posts topped with Sadu canopies
        timberGeoms.push(xform(new THREE.CylinderGeometry(0.72, 0.88, th, 8), ox, 0.8 + th / 2, oz));
        secRoofGeoms.push(xform(new THREE.ConeGeometry(1.08, 1.35, 8), ox, 0.8 + th + 0.65, oz));
      } else {
        stoneGeoms.push(xform(new THREE.CylinderGeometry(0.88, 1.02, th, 10), ox, 0.8 + th / 2, oz));
        secRoofGeoms.push(createOnionDome(0.92, 1.4, ox, 0.8 + th, oz, 8));
      }
    });

    if (level === 3) {
      const crownY = 1.0 + 4.2 * scaleH;
      goldGeoms.push(xform(new THREE.ConeGeometry(0.75, 2.2, 8), 0, crownY + 2.35, 0));
      factionGeoms.push(xform(new THREE.BoxGeometry(0.85, 2.2, 0.12), -1.15, 2.6, 3.25));
      factionGeoms.push(xform(new THREE.BoxGeometry(0.85, 2.2, 0.12), 1.15, 2.6, 3.25));
    }
  }

  // ==========================================================================
  // 5. MILITARY BARRACKS & BLACKSMITH FORGE (ثكنة الجنود والمسبك العسكري)
  // ==========================================================================
  else if (kind === 'barracks') {
    const scaleH = level === 1 ? 0.9 : level === 2 ? 1.1 : 1.3;
    stoneGeoms.push(xform(new THREE.CylinderGeometry(2.95, 3.25, 1.85, 8), 0, -0.9, 0));
    stoneGeoms.push(xform(new THREE.CylinderGeometry(2.8, 3.0, 0.42, 8), 0, 0.21, 0));
    plasterGeoms.push(xform(new THREE.BoxGeometry(3.5, 2.1 * scaleH, 2.2), -0.35, 0.4 + 1.05 * scaleH, -0.65));
    archGeoms.push(xform(new THREE.CylinderGeometry(0.48, 0.48, 1.3, 8), -0.35, 1.05, 0.46, Math.PI / 2, 0, 0));
    addGlowingWindows(-0.35, 1.65 * scaleH, 0.46, 2, 1.4, false, windowGeoms, timberGeoms);

    const roofY = 0.4 + 2.1 * scaleH;
    if (culture === 'iraqi_mesopotamian' || culture === 'hejazi_arabian') {
      roofGeoms.push(createOnionDome(1.15, 1.65, -0.35, roofY, -0.65));
      secRoofGeoms.push(createOnionDome(0.75, 1.15, -1.55, roofY, -0.65));
    } else if (culture === 'bedouin_nomadic') {
      roofGeoms.push(createPitchedGableRoof(3.95, 1.45, 2.55, -0.35, roofY, -0.65, Math.PI / 2));
      secRoofGeoms.push(createPitchedGableRoof(4.02, 0.52, 1.25, -0.35, roofY + 0.72, -0.65, Math.PI / 2));
    } else {
      // Levantine crenellated stone barracks roof
      stoneGeoms.push(xform(new THREE.BoxGeometry(3.7, 0.45, 2.4), -0.35, roofY + 0.15, -0.65));
      roofGeoms.push(createPitchedGableRoof(3.55, 1.15, 2.25, -0.35, roofY + 0.35, -0.65, Math.PI / 2));
    }

    stoneGeoms.push(xform(new THREE.CylinderGeometry(0.65, 0.85, 2.6, 7), 1.65, 1.5, -0.55));
    fireGeoms.push(xform(new THREE.SphereGeometry(0.42, 6, 6), 1.65, 0.95, 0.05));
    [-0.95, 0.35].forEach((dx) => {
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.12, 0.12, 1.25, 6), dx, 0.85, 1.35));
      timberGeoms.push(xform(new THREE.BoxGeometry(0.75, 0.16, 0.16), dx, 1.15, 1.35));
      factionGeoms.push(xform(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8), dx + 0.22, 1.05, 1.45, Math.PI / 2, 0, 0));
    });

    if (level >= 2) {
      stoneGeoms.push(xform(new THREE.CylinderGeometry(0.85, 0.95, 3.6, 8), -1.85, 2.0, 0.55));
      secRoofGeoms.push(xform(new THREE.ConeGeometry(1.05, 1.55, 8), -1.85, 4.55, 0.55));
    }
    if (level === 3) {
      goldGeoms.push(xform(new THREE.ConeGeometry(0.65, 1.8, 6), -0.35, roofY + 1.85, -0.65));
    }
  }

  // ==========================================================================
  // 6. LUMBER CAMP & SAWMILL (معسكر الأخشاب والمنشرة المائية)
  // ==========================================================================
  else if (kind === 'lumber_camp') {
    timberGeoms.push(xform(new THREE.CylinderGeometry(2.3, 2.5, 0.35, 8), 0, 0.18, 0));
    plasterGeoms.push(xform(new THREE.BoxGeometry(2.2, 1.55, 1.9), -0.55, 1.1, -0.45));
    roofGeoms.push(createPitchedGableRoof(2.5, 1.25, 2.2, -0.55, 1.88, -0.45, 0));
    addGlowingWindows(-0.55, 1.25, 0.52, 1, 0.5, false, windowGeoms, timberGeoms);

    timberGeoms.push(xform(new THREE.CylinderGeometry(0.95, 0.95, 0.24, 10), 0.72, 1.25, -0.45, 0, 0, Math.PI / 2));
    waterGeoms.push(xform(new THREE.BoxGeometry(0.55, 0.35, 2.4), 0.95, 0.45, -0.25));

    for (let i = 0; i < level + 2; i++) {
      timberGeoms.push(
        xform(
          new THREE.CylinderGeometry(0.24, 0.24, 1.75, 7),
          0.55 - (i % 2) * 0.35,
          0.52 + Math.floor(i / 2) * 0.38,
          1.05,
          0,
          0,
          Math.PI / 2
        )
      );
    }
    timberGeoms.push(xform(new THREE.CylinderGeometry(0.14, 0.18, 1.1, 6), -1.45, 0.8, 1.15));
    foliageGeoms.push(xform(new THREE.ConeGeometry(0.75, 1.85, 6), -1.45, 2.0, 1.15));

    if (level === 3) {
      goldGeoms.push(xform(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 10), -0.55, 1.25, 0.65, Math.PI / 2, 0, 0));
    }
  }

  // ==========================================================================
  // 7. STONE & GOLD QUARRY (مقلع الحجارة ومنجم الذهب العميق)
  // ==========================================================================
  else if (kind === 'quarry') {
    stoneGeoms.push(xform(new THREE.CylinderGeometry(2.6, 2.9, 0.55, 8), 0, 0.28, 0));
    archGeoms.push(xform(new THREE.CylinderGeometry(1.1, 0.85, 0.35, 7), 0.55, 0.48, 0.55));
    plasterGeoms.push(xform(new THREE.BoxGeometry(1.85, 1.45, 1.65), -0.95, 1.25, -0.75));
    secRoofGeoms.push(createPitchedGableRoof(2.1, 1.05, 1.9, -0.95, 1.98, -0.75, 0));

    timberGeoms.push(xform(new THREE.CylinderGeometry(0.18, 0.22, 3.2 + level * 0.45, 6), 0.85, 2.0, -0.75));
    timberGeoms.push(
      xform(new THREE.BoxGeometry(2.4, 0.22, 0.22), 0.15, 3.3 + level * 0.4, -0.75, 0, 0.35, 0.22)
    );
    stoneGeoms.push(xform(new THREE.DodecahedronGeometry(0.65, 0), -0.85, 0.85, 1.05));
    fireGeoms.push(xform(new THREE.OctahedronGeometry(0.45, 0), 0.65, 0.75, 0.55));

    if (level >= 2) {
      goldGeoms.push(xform(new THREE.OctahedronGeometry(0.62, 0), 1.15, 0.95, 0.85));
    }
    if (level === 3) {
      goldGeoms.push(xform(new THREE.OctahedronGeometry(0.85, 0), -0.25, 1.15, 1.25));
    }
  }

  // ==========================================================================
  // 8A. FORTIFIED STONE WALL SEGMENT (سور حجري محصّن قابل للوصل بدون فجوات)
  // ==========================================================================
  else if (kind === 'stone_wall') {
    const wallH = level === 1 ? 3.05 : level === 2 ? 3.75 : 4.45;
    const wallW = 4.35; // Exceeds 4.2m segment spacing so adjacent curtains lock seamlessly
    const wallD = level === 1 ? 1.35 : level === 2 ? 1.56 : 1.78;

    // Deep battered bedrock foundation skirt (-2.2m..+0.6m) prevents floating on mesas, hills & outcrops
    stoneGeoms.push(xform(new THREE.BoxGeometry(wallW + 0.16, 2.25, wallD + 0.58), 0, -1.08, 0));
    stoneGeoms.push(xform(new THREE.BoxGeometry(wallW + 0.12, 0.72, wallD + 0.36), 0, 0.34, 0));

    if (culture === 'bedouin_nomadic') {
      // Fortified desert rubble-stone rampart + sharpened cedar palisade stakes + sentry catwalk
      stoneGeoms.push(xform(new THREE.BoxGeometry(wallW, wallH * 0.56, wallD), 0, 0.52 + wallH * 0.28, 0));
      for (let i = -3; i <= 3; i++) {
        timberGeoms.push(
          xform(new THREE.CylinderGeometry(0.16, 0.21, wallH + 0.65, 6), i * 0.6, wallH * 0.54 + 0.25, 0)
        );
      }
      // Horizontal timber lashings & rear wooden sentry catwalk with braces
      timberGeoms.push(xform(new THREE.BoxGeometry(wallW, 0.18, 0.14), 0, wallH * 0.72, wallD * 0.45));
      timberGeoms.push(xform(new THREE.BoxGeometry(wallW, 0.18, 0.82), 0, wallH * 0.64, -wallD * 0.5 - 0.26));
      for (const sx of [-1.45, 0, 1.45]) {
        timberGeoms.push(
          xform(new THREE.BoxGeometry(0.16, 0.85, 0.16), sx, wallH * 0.64 - 0.42, -wallD * 0.5 - 0.42, 0.42, 0, 0)
        );
      }
    } else {
      // Solid regional masonry curtain wall (Iraqi ochre brick, Shami Ablaq, Hejazi coral limestone)
      plasterGeoms.push(xform(new THREE.BoxGeometry(wallW, wallH, wallD), 0, 0.5 + wallH * 0.5, 0));
      // Heavy outer battered buttress pilasters & corner engagement piers
      for (const px of [-wallW * 0.47, 0, wallW * 0.47]) {
        stoneGeoms.push(xform(new THREE.BoxGeometry(0.68, wallH + 0.38, wallD + 0.24), px, 0.5 + wallH * 0.52, 0));
      }
      // Stone wall-walk cornice & overhanging front parapet lip
      stoneGeoms.push(xform(new THREE.BoxGeometry(wallW + 0.12, 0.26, wallD + 0.36), 0, 0.5 + wallH - 0.08, 0.04));
      // Authentic crenellated merlons with narrow arrow slits along outer crest
      for (let m = -2; m <= 2; m++) {
        stoneGeoms.push(
          xform(new THREE.BoxGeometry(0.58, 0.72, 0.36), m * 0.88, 0.5 + wallH + 0.36, wallD * 0.44)
        );
        if (m !== 0) {
          archGeoms.push(
            xform(new THREE.BoxGeometry(0.1, 0.42, 0.4), m * 0.88, 0.5 + wallH + 0.34, wallD * 0.46)
          );
        }
      }
      // Rear walkable parapet deck (chemin de ronde) + stone corbels + wooden defender access ladder
      stoneGeoms.push(xform(new THREE.BoxGeometry(wallW, 0.22, 0.72), 0, 0.5 + wallH - 0.55, -wallD * 0.5 - 0.26));
      for (const bx of [-1.5, 0, 1.5]) {
        stoneGeoms.push(
          xform(new THREE.BoxGeometry(0.28, 0.58, 0.48), bx, 0.5 + wallH - 0.9, -wallD * 0.5 - 0.16)
        );
      }
      // Rear wooden access ladder leaning onto the wall-walk
      timberGeoms.push(xform(new THREE.BoxGeometry(0.08, wallH - 0.3, 0.08), -0.95, (wallH + 0.3) * 0.5, -wallD * 0.5 - 0.52, 0.18, 0, 0));
      timberGeoms.push(xform(new THREE.BoxGeometry(0.08, wallH - 0.3, 0.08), -0.45, (wallH + 0.3) * 0.5, -wallD * 0.5 - 0.52, 0.18, 0, 0));
      for (let r = 1; r <= 4; r++) {
        timberGeoms.push(
          xform(new THREE.BoxGeometry(0.54, 0.06, 0.06), -0.7, r * (wallH * 0.2), -wallD * 0.5 - 0.62 + r * 0.08)
        );
      }
    }

    if (level >= 2) {
      // Overhanging timber machicolation hoarding, murder-holes & stone corbels
      timberGeoms.push(xform(new THREE.BoxGeometry(wallW * 0.88, 0.64, 0.48), 0, 0.5 + wallH - 0.1, wallD * 0.58));
      for (const cx of [-1.35, 0, 1.35]) {
        stoneGeoms.push(xform(new THREE.BoxGeometry(0.24, 0.42, 0.42), cx, 0.5 + wallH - 0.52, wallD * 0.52));
      }
      archGeoms.push(xform(new THREE.BoxGeometry(0.2, 0.46, 0.26), -1.0, 0.5 + wallH - 0.1, wallD * 0.78));
      archGeoms.push(xform(new THREE.BoxGeometry(0.2, 0.46, 0.26), 1.0, 0.5 + wallH - 0.1, wallD * 0.78));
      factionGeoms.push(xform(new THREE.BoxGeometry(0.58, 1.05, 0.09), 0, 0.5 + wallH * 0.56, wallD * 0.56));
    }
    if (level === 3) {
      // Armored granite crown band & corner fire braziers
      goldGeoms.push(xform(new THREE.BoxGeometry(wallW + 0.1, 0.18, wallD + 0.16), 0, 0.5 + wallH + 0.06, 0));
      fireGeoms.push(xform(new THREE.SphereGeometry(0.24, 5, 5), -wallW * 0.45, 0.5 + wallH + 0.92, 0));
      fireGeoms.push(xform(new THREE.SphereGeometry(0.24, 5, 5), wallW * 0.45, 0.5 + wallH + 0.92, 0));
    }
  }

  // ==========================================================================
  // 8B. FORTIFIED GATEHOUSE (بوابة الحصن المحصّنة ببرجين أسطوانيين ومزلاج حديدي متحرك)
  // ==========================================================================
  else if (kind === 'gatehouse') {
    const towerH = level === 1 ? 4.55 : level === 2 ? 5.45 : 6.35;
    const bridgeY = level === 1 ? 2.75 : level === 2 ? 3.25 : 3.65;

    // Deep stone bedrock foundation skirt (-2.2m..+0.28m) + paved gate threshold
    stoneGeoms.push(xform(new THREE.BoxGeometry(5.2, 2.25, 3.2), 0, -1.08, 0));
    stoneGeoms.push(xform(new THREE.BoxGeometry(5.15, 0.3, 3.05), 0, 0.15, 0));

    // Side wall-docking wings so neighboring stone_wall curtains interlock with zero gaps
    for (const side of [-1, 1]) {
      const wx = side * 2.38;
      plasterGeoms.push(xform(new THREE.BoxGeometry(0.68, 3.05, 1.48), wx, 1.85, 0));
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.72, 0.42, 1.65), wx, 3.45, 0));
    }

    // Twin octagonal drum gate towers flanking the barbican passage
    for (const side of [-1, 1]) {
      const tx = side * 1.78;
      stoneGeoms.push(xform(new THREE.CylinderGeometry(1.06, 1.24, 1.35, 8), tx, 0.72, 0));
      plasterGeoms.push(xform(new THREE.CylinderGeometry(0.96, 1.05, towerH, 8), tx, 0.5 + towerH * 0.5, 0));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(1.16, 1.02, 0.52, 8), tx, 0.5 + towerH, 0));
      // Arrow slits facing forward & outward
      archGeoms.push(xform(new THREE.BoxGeometry(0.14, 0.65, 0.22), tx, 0.5 + towerH * 0.52, 1.02));
      addGlowingWindows(tx, 0.5 + towerH * 0.68, 1.02, 1, 0.35, false, windowGeoms, timberGeoms);

      if (culture === 'iraqi_mesopotamian') {
        roofGeoms.push(createOnionDome(0.84, 1.22, tx, 0.5 + towerH + 0.26, 0, 8));
      } else if (culture === 'levantine_shami') {
        secRoofGeoms.push(createOnionDome(0.78, 0.96, tx, 0.5 + towerH + 0.26, 0, 8));
      } else if (culture === 'hejazi_arabian') {
        timberGeoms.push(xform(new THREE.BoxGeometry(1.82, 0.75, 1.82), tx, 0.5 + towerH - 0.1, 0));
        roofGeoms.push(createOnionDome(0.74, 0.98, tx, 0.5 + towerH + 0.3, 0, 8));
      } else {
        secRoofGeoms.push(xform(new THREE.ConeGeometry(1.18, 1.18, 8), tx, 0.5 + towerH + 0.74, 0));
      }
      fireGeoms.push(xform(new THREE.SphereGeometry(0.24, 6, 6), tx, 0.5 + towerH + 0.44, 1.1));
    }

    // Overhead barbican gatehouse bridge & crenellated battlements spanning between drum towers
    plasterGeoms.push(xform(new THREE.BoxGeometry(2.48, 1.56, 2.02), 0, bridgeY + 0.76, 0));
    stoneGeoms.push(xform(new THREE.BoxGeometry(2.62, 0.36, 2.24), 0, bridgeY + 1.58, 0));
    for (let m = -1; m <= 1; m++) {
      stoneGeoms.push(xform(new THREE.BoxGeometry(0.55, 0.54, 0.32), m * 0.82, bridgeY + 1.98, 0.96));
    }
    // Recessed pointed stone archway frame (portcullis grille & doors are mounted dynamically in buildOrUpdateStructureLOD!)
    archGeoms.push(xform(new THREE.CylinderGeometry(0.96, 0.96, 1.92, 8), 0, bridgeY - 0.44, 0, Math.PI / 2, 0, 0));
    // Faction heraldic banners flanking the gate arch
    factionGeoms.push(xform(new THREE.BoxGeometry(0.64, 1.32, 0.1), -1.78, bridgeY + 0.28, 1.08));
    factionGeoms.push(xform(new THREE.BoxGeometry(0.64, 1.32, 0.1), 1.78, bridgeY + 0.28, 1.08));

    if (level >= 2) {
      // Murder-hole machicolation balcony projecting above the gate arch
      timberGeoms.push(xform(new THREE.BoxGeometry(2.25, 0.68, 0.68), 0, bridgeY + 0.95, 1.18));
    }
    if (level === 3) {
      goldGeoms.push(xform(new THREE.ConeGeometry(0.24, 0.95, 6), -1.78, 0.5 + towerH + 1.68, 0));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.24, 0.95, 6), 1.78, 0.5 + towerH + 1.68, 0));
    }
  }

  // ==========================================================================
  // 8C. DEFENSIVE MOAT & SHARPENED STAKES (خندق دفاعي وأوتاد حادة)
  // ==========================================================================
  else if (kind === 'moat_trench') {
    const trenchW = 4.32;
    const trenchD = 2.55;
    // Deep retaining skirt so moat edges never expose gaps on sloped ground
    stoneGeoms.push(xform(new THREE.BoxGeometry(trenchW + 0.12, 1.65, trenchD + 0.24), 0, -0.78, 0));
    // Excavated outer & inner stone retaining berms
    stoneGeoms.push(xform(new THREE.BoxGeometry(trenchW, 0.46, 0.48), 0, 0.23, -trenchD * 0.48));
    stoneGeoms.push(xform(new THREE.BoxGeometry(trenchW, 0.4, 0.44), 0, 0.2, trenchD * 0.48));
    terracottaGeoms.push(xform(new THREE.BoxGeometry(trenchW + 0.16, 0.18, trenchD + 0.16), 0, 0.08, 0));
    // Deep dark trench floor + shimmering moat water sheet
    archGeoms.push(xform(new THREE.BoxGeometry(trenchW - 0.12, 0.2, trenchD - 0.68), 0, 0.11, 0));
    waterGeoms.push(
      xform(
        new THREE.BoxGeometry(trenchW - 0.16, level >= 2 ? 0.28 : 0.22, trenchD - 0.78),
        0,
        level >= 2 ? 0.21 : 0.16,
        0
      )
    );
    // Angled sharpened wooden/iron stakes (chevaux-de-frise) bristling outward
    const stakeRows = level >= 2 ? [-0.42, 0.4] : [0.34];
    for (const rz of stakeRows) {
      for (let i = -3; i <= 3; i++) {
        const sx = i * 0.58;
        timberGeoms.push(
          xform(new THREE.ConeGeometry(0.11, 1.1, 5), sx, 0.5, rz, 0.54, 0, 0)
        );
        if (level === 3) {
          goldGeoms.push(
            xform(new THREE.ConeGeometry(0.08, 0.36, 4), sx, 0.9, rz + 0.24, 0.54, 0, 0)
          );
        }
      }
    }
    // Narrow allied timber crossing planks
    timberGeoms.push(xform(new THREE.BoxGeometry(0.86, 0.12, trenchD * 0.94), 0, 0.34, 0));
  }

  // ==========================================================================
  // 8D. SIEGE WORKSHOP (ورشة آلات الحصار والمجانيق)
  // ==========================================================================
  else if (kind === 'siege_workshop') {
    stoneGeoms.push(xform(new THREE.BoxGeometry(4.95, 1.75, 4.75), 0, -0.85, 0));
    stoneGeoms.push(xform(new THREE.BoxGeometry(4.85, 0.42, 4.65), 0, 0.21, 0));
    // Heavy stone & timber carpentry hall (rear)
    plasterGeoms.push(xform(new THREE.BoxGeometry(4.2, 2.25, 1.85), 0, 1.54, -1.25));
    roofGeoms.push(createPitchedGableRoof(4.45, 1.05, 2.15, 0, 2.72, -1.25, Math.PI / 2));
    addGlowingWindows(0, 1.65, -0.3, 3, 0.95, false, windowGeoms, timberGeoms);

    // Tall A-Frame Siege Gantry Crane & Counterweight Beam under construction (front yard)
    timberGeoms.push(xform(new THREE.BoxGeometry(0.24, 3.45, 0.24), -1.35, 2.0, 0.85, 0, 0, -0.18));
    timberGeoms.push(xform(new THREE.BoxGeometry(0.24, 3.45, 0.24), 0.15, 2.0, 0.85, 0, 0, 0.18));
    timberGeoms.push(xform(new THREE.BoxGeometry(2.15, 0.24, 0.28), -0.6, 3.55, 0.85));
    timberGeoms.push(xform(new THREE.BoxGeometry(0.22, 3.25, 0.22), -0.6, 2.75, 0.95, 0, 0, -0.68));
    stoneGeoms.push(xform(new THREE.DodecahedronGeometry(0.46, 0), 1.35, 0.72, 0.85));
    stoneGeoms.push(xform(new THREE.DodecahedronGeometry(0.42, 0), 1.85, 0.68, 1.25));
    stoneGeoms.push(xform(new THREE.DodecahedronGeometry(0.38, 0), 1.55, 1.12, 1.02));
    stoneGeoms.push(xform(new THREE.CylinderGeometry(0.55, 0.68, 0.55, 7), 1.45, 0.68, -0.05));
    fireGeoms.push(xform(new THREE.ConeGeometry(0.36, 0.68, 6), 1.45, 1.15, -0.05));
    factionGeoms.push(xform(new THREE.BoxGeometry(1.45, 0.15, 0.95), 0.95, 2.25, -0.25, 0.22, 0, 0));

    if (level >= 2) {
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.26, 0.28, 2.45, 7), -0.55, 0.98, 1.55, 0, 0, Math.PI / 2));
      goldGeoms.push(xform(new THREE.ConeGeometry(0.32, 0.58, 6), 0.82, 0.98, 1.55, 0, 0, -Math.PI / 2));
    }
    if (level === 3) {
      goldGeoms.push(createOnionDome(0.85, 1.25, 0, 3.28, -1.25, 8));
      timberGeoms.push(xform(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 5), -2.0, 2.5, -1.8));
    }
  }

  // ==========================================================================
  // 8E. DEFENSIVE WATCHTOWER & CORNER BASTION TOWER (برج المراقبة والحصن الزاوي)
  // ==========================================================================
  else {
    const h = 4.0 + level * 1.25;
    // Deep battered stone bedrock plinth (-2.2m..+1.35m) so hilltop & mesa watchtowers never float
    stoneGeoms.push(xform(new THREE.CylinderGeometry(1.62, 1.95, 2.35, 8), 0, -1.14, 0));
    stoneGeoms.push(xform(new THREE.CylinderGeometry(1.45, 1.75, 1.38, 8), 0, 0.68, 0));
    // 4-way wall-walk engagement collars so stone_wall segments dock seamlessly into watchtowers
    stoneGeoms.push(xform(new THREE.BoxGeometry(3.25, 2.85, 1.24), 0, 1.42, 0));
    stoneGeoms.push(xform(new THREE.BoxGeometry(1.24, 2.85, 3.25), 0, 1.42, 0));

    if (culture === 'iraqi_mesopotamian') {
      plasterGeoms.push(xform(new THREE.CylinderGeometry(1.06, 1.32, h, 10), 0, 1.35 + h / 2, 0));
      stoneGeoms.push(xform(new THREE.CylinderGeometry(1.52, 1.18, 0.68, 10), 0, 1.35 + h, 0));
      roofGeoms.push(createOnionDome(1.12, 1.82, 0, 1.35 + h + 0.34, 0, 10));
    } else if (culture === 'levantine_shami') {
      // Square Ablaq stone bastion watchtower with corbelled machicolation battlements
      plasterGeoms.push(xform(new THREE.BoxGeometry(2.02, h, 2.02), 0, 1.35 + h / 2, 0));
      stoneGeoms.push(xform(new THREE.BoxGeometry(2.42, 0.68, 2.42), 0, 1.35 + h, 0));
      for (const sx of [-0.95, 0, 0.95]) {
        stoneGeoms.push(xform(new THREE.BoxGeometry(0.45, 0.48, 0.28), sx, 1.35 + h + 0.56, 1.12));
        stoneGeoms.push(xform(new THREE.BoxGeometry(0.45, 0.48, 0.28), sx, 1.35 + h + 0.56, -1.12));
      }
      secRoofGeoms.push(createOnionDome(0.92, 1.18, 0, 1.35 + h + 0.34, 0, 8));
    } else if (culture === 'hejazi_arabian') {
      // White coral-stone Hejazi bastion tower with projecting carved dark-wood Roshan lookout deck
      plasterGeoms.push(xform(new THREE.BoxGeometry(1.92, h, 1.92), 0, 1.35 + h / 2, 0));
      timberGeoms.push(xform(new THREE.BoxGeometry(2.48, 0.98, 2.48), 0, 1.35 + h - 0.12, 0));
      roofGeoms.push(createOnionDome(0.96, 1.28, 0, 1.35 + h + 0.36, 0, 8));
    } else {
      // Bedouin timber-and-stone desert lookout beacon with Sadu sun-canopy
      timberGeoms.push(xform(new THREE.CylinderGeometry(1.02, 1.26, h, 8), 0, 1.35 + h / 2, 0));
      timberGeoms.push(xform(new THREE.BoxGeometry(2.35, 0.38, 2.35), 0, 1.35 + h, 0));
      secRoofGeoms.push(xform(new THREE.ConeGeometry(1.58, 1.48, 4), 0, 1.35 + h + 0.92, 0, 0, Math.PI / 4, 0));
    }

    // Arrow slits on all 4 cardinal sides + glowing watch room + signal fire brazier
    archGeoms.push(xform(new THREE.BoxGeometry(0.14, 0.72, 0.26), 0, 1.35 + h * 0.46, 1.15));
    archGeoms.push(xform(new THREE.BoxGeometry(0.14, 0.72, 0.26), 0, 1.35 + h * 0.46, -1.15));
    archGeoms.push(xform(new THREE.BoxGeometry(0.26, 0.72, 0.14), 1.15, 1.35 + h * 0.46, 0));
    archGeoms.push(xform(new THREE.BoxGeometry(0.26, 0.72, 0.14), -1.15, 1.35 + h * 0.46, 0));
    addGlowingWindows(0, 1.35 + h * 0.68, 1.14, 1, 0.4, false, windowGeoms, timberGeoms);
    fireGeoms.push(xform(new THREE.SphereGeometry(0.34, 6, 6), 1.24, 1.35 + h + 0.42, 0));

    if (level === 3) {
      goldGeoms.push(xform(new THREE.ConeGeometry(0.38, 1.45, 6), 0, 1.35 + h + 2.85, 0));
    }
  }

  const template: BakedStructureTemplate = {
    lod0: {
      plasterWall: safeMerge(plasterGeoms),
      carvedStone: safeMerge(stoneGeoms),
      timber: safeMerge(timberGeoms),
      roofTile: safeMerge(roofGeoms),
      secondaryRoof: safeMerge(secRoofGeoms),
      factionCloth: safeMerge(factionGeoms),
      accentGold: safeMerge(goldGeoms),
      windowGlow: safeMerge(windowGeoms),
      darkArch: safeMerge(archGeoms),
      foliage: safeMerge(foliageGeoms),
      waterPool: safeMerge(waterGeoms),
      terracotta: safeMerge(terracottaGeoms),
      forgeFire: safeMerge(fireGeoms),
    },
  };

  STRUCTURE_TEMPLATE_CACHE.set(key, template);
  return template;
}

const SCAFFOLD_WOOD_MAT = new THREE.MeshStandardMaterial({
  color: 0xb47b3c,
  roughness: 0.88,
  metalness: 0.04,
  flatShading: true,
});
applyRetroPixelShader(SCAFFOLD_WOOD_MAT);

const SCAFFOLD_PLANK_MAT = new THREE.MeshStandardMaterial({
  color: 0xd69e5c,
  roughness: 0.82,
  metalness: 0.04,
  flatShading: true,
});
applyRetroPixelShader(SCAFFOLD_PLANK_MAT);

const PROGRESS_BG_MAT = new THREE.MeshBasicMaterial({
  color: 0x17110a,
});

const SCAFFOLD_CACHE = new Map<
  StructureKind,
  {
    foundationGeom: THREE.BufferGeometry;
    skeletonGeom: THREE.BufferGeometry;
    polesAndBracesGeom: THREE.BufferGeometry;
    planksAndLaddersGeom: THREE.BufferGeometry;
    stonePileGeom: THREE.BufferGeometry;
    footprintW: number;
    footprintD: number;
    heightH: number;
  }
>();

function getBakedScaffoldingGeometries(kind: StructureKind) {
  let cached = SCAFFOLD_CACHE.get(kind);
  if (cached) return cached;

  const dims: Record<StructureKind, { w: number; d: number; h: number }> = {
    house: { w: 3.1, d: 3.1, h: 3.3 },
    bedouin_tent: { w: 3.5, d: 2.9, h: 2.5 },
    war_tent: { w: 3.6, d: 3.6, h: 3.4 },
    livestock_ranch: { w: 4.2, d: 4.2, h: 2.6 },
    horse_stable: { w: 4.4, d: 4.4, h: 3.1 },
    farm: { w: 4.1, d: 4.1, h: 2.7 },
    market: { w: 4.3, d: 4.3, h: 3.5 },
    temple: { w: 4.7, d: 4.7, h: 5.8 },
    keep: { w: 5.8, d: 5.8, h: 6.4 },
    barracks: { w: 4.4, d: 4.4, h: 3.8 },
    lumber_camp: { w: 3.4, d: 3.4, h: 2.9 },
    quarry: { w: 3.9, d: 3.9, h: 2.8 },
    watchtower: { w: 2.5, d: 2.5, h: 6.8 },
    stone_wall: { w: 3.6, d: 1.5, h: 3.4 },
    gatehouse: { w: 4.8, d: 2.6, h: 5.2 },
    moat_trench: { w: 3.6, d: 2.4, h: 1.1 },
    siege_workshop: { w: 4.6, d: 4.4, h: 3.8 },
  };

  const { w, d, h } = dims[kind] ?? { w: 3.6, d: 3.6, h: 3.5 };
  const hw = w * 0.5;
  const hd = d * 0.5;

  const foundationGeoms: THREE.BufferGeometry[] = [];
  const skeletonGeoms: THREE.BufferGeometry[] = [];
  const polesGeoms: THREE.BufferGeometry[] = [];
  const planksGeoms: THREE.BufferGeometry[] = [];
  const stoneGeoms: THREE.BufferGeometry[] = [];

  // 1. Foundation Stone Trench & Perimeter Curb
  foundationGeoms.push(xform(new THREE.BoxGeometry(w + 0.55, 0.24, 0.28), 0, 0.12, hd + 0.12));
  foundationGeoms.push(xform(new THREE.BoxGeometry(w + 0.55, 0.24, 0.28), 0, 0.12, -hd - 0.12));
  foundationGeoms.push(xform(new THREE.BoxGeometry(0.28, 0.24, d + 0.55), hw + 0.12, 0.12, 0));
  foundationGeoms.push(xform(new THREE.BoxGeometry(0.28, 0.24, d + 0.55), -hw - 0.12, 0.12, 0));

  // 2. Internal Structural Timber Skeleton (Columns, Floor Joists & Roof Truss Rafters)
  const skW = hw * 0.78;
  const skD = hd * 0.78;
  const colH = h * 0.78;
  for (const sx of [-skW, 0, skW]) {
    for (const sz of [-skD, 0, skD]) {
      if (sx === 0 && sz === 0 && kind !== 'keep' && kind !== 'temple') continue;
      skeletonGeoms.push(
        xform(new THREE.BoxGeometry(0.16, colH, 0.16), sx, colH * 0.5, sz)
      );
    }
  }
  // Horizontal structural ring beams at mid-level and eaves level
  for (const by of [colH * 0.48, colH * 0.96]) {
    skeletonGeoms.push(xform(new THREE.BoxGeometry(skW * 2 + 0.18, 0.14, 0.14), 0, by, skD));
    skeletonGeoms.push(xform(new THREE.BoxGeometry(skW * 2 + 0.18, 0.14, 0.14), 0, by, -skD));
    skeletonGeoms.push(xform(new THREE.BoxGeometry(0.14, 0.14, skD * 2 + 0.18), skW, by, 0));
    skeletonGeoms.push(xform(new THREE.BoxGeometry(0.14, 0.14, skD * 2 + 0.18), -skW, by, 0));
  }
  // Pitched Roof Truss Rafters (هيكل السقف الخشبي)
  const trussRise = h * 0.22;
  const rafterLen = Math.hypot(skW, trussRise);
  const rafterAngle = Math.atan2(trussRise, skW);
  for (const rz of [-skD, 0, skD]) {
    skeletonGeoms.push(
      xform(
        new THREE.BoxGeometry(rafterLen, 0.12, 0.12),
        -skW * 0.5,
        colH + trussRise * 0.5,
        rz,
        0,
        0,
        rafterAngle
      )
    );
    skeletonGeoms.push(
      xform(
        new THREE.BoxGeometry(rafterLen, 0.12, 0.12),
        skW * 0.5,
        colH + trussRise * 0.5,
        rz,
        0,
        0,
        -rafterAngle
      )
    );
  }
  skeletonGeoms.push(
    xform(new THREE.BoxGeometry(0.14, 0.14, skD * 2 + 0.2), 0, colH + trussRise, 0)
  );

  // 3. External Multi-Tier Wooden Scaffolding Cage (سقالات البناء المحيطة بالمبنى)
  const outW = hw + 0.42;
  const outD = hd + 0.42;
  const scafH = h * 0.92;
  const tier1Y = scafH * 0.42;
  const tier2Y = scafH * 0.82;

  // Vertical Scaffolding Poles around all 4 facades
  const xPosts = [-outW, 0, outW];
  const zPosts = [-outD, 0, outD];
  for (const px of xPosts) {
    for (const pz of [-outD, outD]) {
      polesGeoms.push(
        xform(new THREE.CylinderGeometry(0.065, 0.075, scafH, 5), px, scafH * 0.5, pz)
      );
    }
  }
  for (const pz of zPosts) {
    if (pz === -outD || pz === outD) continue;
    for (const px of [-outW, outW]) {
      polesGeoms.push(
        xform(new THREE.CylinderGeometry(0.065, 0.075, scafH, 5), px, scafH * 0.5, pz)
      );
    }
  }

  // Horizontal Scaffolding Ledgers & Wooden Catwalk Planks at Tier 1 & Tier 2
  for (const ty of [tier1Y, tier2Y]) {
    // Front & Back Ledgers + Catwalks
    for (const sz of [-outD, outD]) {
      polesGeoms.push(xform(new THREE.BoxGeometry(outW * 2 + 0.2, 0.09, 0.09), 0, ty, sz));
      planksGeoms.push(
        xform(new THREE.BoxGeometry(outW * 1.92, 0.08, 0.42), 0, ty + 0.06, sz * 0.92)
      );
    }
    // Left & Right Ledgers + Catwalks
    for (const sx of [-outW, outW]) {
      polesGeoms.push(xform(new THREE.BoxGeometry(0.09, 0.09, outD * 2 + 0.2), sx, ty, 0));
      planksGeoms.push(
        xform(new THREE.BoxGeometry(0.42, 0.08, outD * 1.92), sx * 0.92, ty + 0.06, 0)
      );
    }
  }

  // Diagonal X-Bracing across scaffolding bays
  const bayDiagLen = Math.hypot(outW, tier1Y);
  const bayAngle = Math.atan2(tier1Y, outW);
  for (const sz of [-outD, outD]) {
    for (const sideX of [-outW * 0.5, outW * 0.5]) {
      polesGeoms.push(
        xform(
          new THREE.BoxGeometry(bayDiagLen, 0.065, 0.065),
          sideX,
          tier1Y * 0.5,
          sz,
          0,
          0,
          bayAngle
        )
      );
      polesGeoms.push(
        xform(
          new THREE.BoxGeometry(bayDiagLen, 0.065, 0.065),
          sideX,
          tier1Y * 0.5,
          sz,
          0,
          0,
          -bayAngle
        )
      );
    }
  }

  // 4. Angled Wooden Construction Ladders with Rungs (سلالم خشبية للعمال)
  const ladderH = tier2Y + 0.45;
  const ladderX = outW * 0.48;
  const ladderZ = outD + 0.28;
  planksGeoms.push(
    xform(new THREE.BoxGeometry(0.07, ladderH, 0.07), ladderX - 0.22, ladderH * 0.48, ladderZ, -0.18, 0, 0)
  );
  planksGeoms.push(
    xform(new THREE.BoxGeometry(0.07, ladderH, 0.07), ladderX + 0.22, ladderH * 0.48, ladderZ, -0.18, 0, 0)
  );
  const rungsCount = 6;
  for (let r = 1; r <= rungsCount; r++) {
    const ry = (r / (rungsCount + 1)) * ladderH * 0.94;
    const rz = ladderZ + (0.5 - r / (rungsCount + 1)) * 0.35;
    planksGeoms.push(
      xform(new THREE.BoxGeometry(0.48, 0.055, 0.055), ladderX, ry, rz)
    );
  }

  // 5. Stacked Construction Timber Planks & Cut Masonry Stone Piles on Ground
  planksGeoms.push(
    xform(new THREE.BoxGeometry(1.15, 0.22, 0.55), -outW * 0.65, 0.12, outD + 0.45, 0, 0.15, 0)
  );
  planksGeoms.push(
    xform(new THREE.BoxGeometry(1.05, 0.18, 0.48), -outW * 0.65, 0.32, outD + 0.45, 0, -0.08, 0)
  );
  stoneGeoms.push(
    xform(new THREE.BoxGeometry(0.55, 0.38, 0.55), outW + 0.45, 0.19, -outD * 0.45)
  );
  stoneGeoms.push(
    xform(new THREE.BoxGeometry(0.48, 0.34, 0.48), outW + 0.42, 0.52, -outD * 0.42, 0, 0.25, 0)
  );

  cached = {
    foundationGeom: safeMerge(foundationGeoms)!,
    skeletonGeom: safeMerge(skeletonGeoms)!,
    polesAndBracesGeom: safeMerge(polesGeoms)!,
    planksAndLaddersGeom: safeMerge(planksGeoms)!,
    stonePileGeom: safeMerge(stoneGeoms)!,
    footprintW: w,
    footprintD: d,
    heightH: h,
  };
  SCAFFOLD_CACHE.set(kind, cached);
  return cached;
}

export function buildConstructionScaffoldingGroup(kind: StructureKind): THREE.Group {
  const rig = new THREE.Group();
  rig.name = 'scaffoldingRig';

  const tpl = getBakedScaffoldingGeometries(kind);

  // 1. Stone Foundation Curb & Stacked Stone Blocks
  const foundationMesh = new THREE.Mesh(tpl.foundationGeom, SHARED_MATERIALS.stone);
  foundationMesh.castShadow = true;
  foundationMesh.receiveShadow = true;
  rig.add(foundationMesh);

  const stonePileMesh = new THREE.Mesh(tpl.stonePileGeom, SHARED_MATERIALS.stone);
  stonePileMesh.castShadow = true;
  rig.add(stonePileMesh);

  // 2. Internal Structural Timber Skeleton (Scales up from ground as construction starts)
  const skeletonMesh = new THREE.Mesh(tpl.skeletonGeom, SCAFFOLD_WOOD_MAT);
  skeletonMesh.name = 'skeletonMesh';
  skeletonMesh.castShadow = true;
  skeletonMesh.receiveShadow = true;
  rig.add(skeletonMesh);

  // 3. External Scaffolding Cage (Poles, X-Braces, Catwalk Planks & Ladders)
  const polesMesh = new THREE.Mesh(tpl.polesAndBracesGeom, SCAFFOLD_WOOD_MAT);
  polesMesh.castShadow = true;
  rig.add(polesMesh);

  const planksMesh = new THREE.Mesh(tpl.planksAndLaddersGeom, SCAFFOLD_PLANK_MAT);
  planksMesh.castShadow = true;
  planksMesh.receiveShadow = true;
  rig.add(planksMesh);

  // 4. Animated Medieval Wooden Pulley Crane (رافعة البناء الخشبية المتحركة)
  const craneGroup = new THREE.Group();
  craneGroup.name = 'craneGroup';
  const craneH = tpl.heightH + 1.0;
  craneGroup.position.set(-tpl.footprintW * 0.52, 0, -tpl.footprintD * 0.52);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.13, craneH, 6),
    SCAFFOLD_WOOD_MAT
  );
  mast.position.y = craneH * 0.5;
  mast.castShadow = true;
  craneGroup.add(mast);

  const boomPivot = new THREE.Group();
  boomPivot.name = 'boomPivot';
  boomPivot.position.y = craneH - 0.15;

  const boomArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 2.4),
    SCAFFOLD_PLANK_MAT
  );
  boomArm.position.set(0, 0.25, 1.0);
  boomArm.rotation.x = -0.22;
  boomArm.castShadow = true;
  boomPivot.add(boomArm);

  const hookGroup = new THREE.Group();
  hookGroup.name = 'hookGroup';
  hookGroup.position.set(0, 0.35, 2.05);

  const ropeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.5, 4),
    SCAFFOLD_PLANK_MAT
  );
  ropeMesh.position.y = -0.75;
  hookGroup.add(ropeMesh);

  const suspendedBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.42, 0.48),
    SHARED_MATERIALS.stone
  );
  suspendedBlock.position.y = -1.55;
  suspendedBlock.castShadow = true;
  hookGroup.add(suspendedBlock);

  boomPivot.add(hookGroup);
  craneGroup.add(boomPivot);
  rig.add(craneGroup);

  // 5. Floating 3D Construction Progress Bar above Scaffolding
  const barGroup = new THREE.Group();
  barGroup.name = 'progressBarGroup';
  barGroup.position.set(0, tpl.heightH + 1.65, 0);

  const barBg = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 0.12), PROGRESS_BG_MAT);
  barGroup.add(barBg);

  const barFillMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const barFill = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.18, 0.16), barFillMat);
  barFill.name = 'progressFillMesh';
  barGroup.add(barFill);

  rig.add(barGroup);
  rig.visible = false;
  return rig;
}

export function updateStructureConstructionVisual(
  lod: THREE.LOD,
  isConstructing: boolean,
  progressPct: number,
  timeSec: number,
  cameraYaw = 0
): void {
  const rootGroup = lod.children[0] as THREE.Group | undefined;
  if (!rootGroup) return;

  const buildingCore = rootGroup.getObjectByName('buildingCore') as THREE.Group | undefined;
  const scaffoldingRig = rootGroup.getObjectByName('scaffoldingRig') as THREE.Group | undefined;
  if (!buildingCore || !scaffoldingRig) return;

  if (!isConstructing) {
    if (scaffoldingRig.visible) {
      scaffoldingRig.visible = false;
      buildingCore.scale.set(1, 1, 1);
    }
    return;
  }

  scaffoldingRig.visible = true;
  const clampedPct = Math.max(0, Math.min(100, progressPct));
  const t = clampedPct / 100;

  // Progressive vertical building rise inside the scaffolding cage (from 10% foundation to 100% roof)
  const coreScaleY = 0.1 + t * 0.9;
  buildingCore.scale.set(1, coreScaleY, 1);

  // Structural Timber Skeleton rises ahead of the solid masonry walls
  const skeletonMesh = scaffoldingRig.getObjectByName('skeletonMesh');
  if (skeletonMesh) {
    const skScaleY = Math.min(1.0, 0.38 + t * 0.85);
    skeletonMesh.scale.set(1, skScaleY, 1);
  }

  // Animate wooden pulley crane jib rotation & stone block hoisting
  const boomPivot = scaffoldingRig.getObjectByName('boomPivot');
  if (boomPivot) {
    boomPivot.rotation.y = Math.sin(timeSec * 1.4) * 0.55 + 0.6;
  }
  const hookGroup = scaffoldingRig.getObjectByName('hookGroup');
  if (hookGroup) {
    hookGroup.position.y = 0.35 + Math.sin(timeSec * 2.6) * 0.35;
  }

  // Update floating 3D progress bar above scaffolding
  const barGroup = scaffoldingRig.getObjectByName('progressBarGroup');
  if (barGroup) {
    barGroup.rotation.y = cameraYaw;
    const fillMesh = barGroup.getObjectByName('progressFillMesh') as THREE.Mesh | undefined;
    if (fillMesh) {
      const fillRatio = Math.max(0.03, t);
      fillMesh.scale.x = fillRatio;
      fillMesh.position.x = -1.34 * (1 - fillRatio);
      const mat = fillMesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(clampedPct >= 75 ? 0x10b981 : clampedPct >= 40 ? 0xfacc15 : 0xf59e0b);
    }
  }
}

/**
 * Builds or updates the 3D Architectural Structure (Always renders full high-detail `group0`
 * so Orthographic Isometric cameras at distance 220 never degrade into simple proxy boxes!).
 */
export function buildOrUpdateStructureLOD(
  kind: StructureKind,
  level: StructureLevel,
  factionColor: string,
  rawCulture: CultureKind = 'iraqi_mesopotamian',
  existingLod?: THREE.LOD,
  secondaryColor = '#fbbf24',
  bannerPattern: BannerPatternKind = 'crescent_star',
  variant: 0 | 1 | 2 = 0
): THREE.LOD {
  const culture = normalizeCultureKind(rawCulture);
  const lod = existingLod ?? new THREE.LOD();
  while (lod.children.length > 0) {
    lod.remove(lod.children[0]);
  }
  lod.levels.length = 0;

  const template = getBakedStructureTemplate(kind, level, culture, variant);
  const factionMat = getSharedFactionMaterial(factionColor, secondaryColor);
  const cultureMats = getCultureMaterials(culture);

  const group0 = new THREE.Group();
  const buildingCore = new THREE.Group();
  buildingCore.name = 'buildingCore';

  const addLayer = (geom: THREE.BufferGeometry | undefined, mat: THREE.Material, recvShadow = true) => {
    if (!geom) return;
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = recvShadow;
    buildingCore.add(m);
  };

  addLayer(template.lod0.plasterWall, cultureMats.plasterWall, true);
  addLayer(template.lod0.carvedStone, cultureMats.carvedStone, true);
  addLayer(template.lod0.timber, cultureMats.timber, true);
  addLayer(template.lod0.roofTile, cultureMats.roofTile, true);
  addLayer(template.lod0.secondaryRoof, cultureMats.secondaryRoof, true);
  addLayer(template.lod0.factionCloth, factionMat, false);
  addLayer(template.lod0.accentGold, SHARED_MATERIALS.accentGold, false);
  addLayer(template.lod0.windowGlow, SHARED_MATERIALS.windowGlow, false);
  addLayer(template.lod0.darkArch, SHARED_MATERIALS.darkArch, false);
  addLayer(template.lod0.foliage, SHARED_MATERIALS.foliage, true);
  addLayer(template.lod0.waterPool, SHARED_MATERIALS.waterPool, true);
  addLayer(template.lod0.terracotta, SHARED_MATERIALS.terracotta, true);
  addLayer(template.lod0.forgeFire, SHARED_MATERIALS.forgeFire, false);

  // Attach animated Iron-Shod Portcullis & Double Timber Doors for Gatehouses
  if (kind === 'gatehouse') {
    const portcullisGroup = buildGatehousePortcullisGroup(level, cultureMats.timber);
    buildingCore.add(portcullisGroup);
  }

  // Attach 3D Heraldic Flag & Standard displaying player's Primary Color, Secondary Color & Banner Pattern
  const heraldicBanners = buildHeraldicBannerGroup(
    kind,
    level,
    factionColor,
    secondaryColor,
    bannerPattern
  );
  buildingCore.add(heraldicBanners);

  group0.add(buildingCore);

  // Attach 3D Structural Skeleton & Multi-Tier Scaffolding Rig (shown during construction / placement)
  const scaffoldingRig = buildConstructionScaffoldingGroup(kind);
  group0.add(scaffoldingRig);

  // Only register the full-detail architectural group so Orthographic cameras at distance 220
  // ALWAYS render the complete multi-part architectural design!
  lod.addLevel(group0, 0);

  lod.userData = {
    kind,
    level,
    factionColor,
    secondaryColor,
    bannerPattern,
    culture,
    variant,
  };
  return lod;
}

const PORTCULLIS_GEOM_CACHE = new Map<StructureLevel, THREE.BufferGeometry>();
const WALL_PIER_GEOM_CACHE = new Map<string, { stone: THREE.BufferGeometry; plaster: THREE.BufferGeometry }>();

function buildGatehousePortcullisGroup(
  level: StructureLevel,
  timberMat: THREE.MeshStandardMaterial
): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'gatePortcullisGroup';

  let geom = PORTCULLIS_GEOM_CACHE.get(level);
  if (!geom) {
    const parts: THREE.BufferGeometry[] = [];
    const gateH = level === 1 ? 2.15 : level === 2 ? 2.45 : 2.75;
    // Heavy double timber gate panels with iron cross-braces
    parts.push(xform(new THREE.BoxGeometry(1.76, gateH * 0.86, 0.14), 0, gateH * 0.43 + 0.22, 0.72));
    // Vertical iron portcullis spikes & bars
    for (let bar = -2; bar <= 2; bar++) {
      parts.push(xform(new THREE.BoxGeometry(0.11, gateH, 0.2), bar * 0.36, gateH * 0.5 + 0.16, 0.78));
    }
    parts.push(xform(new THREE.BoxGeometry(1.86, 0.16, 0.22), 0, gateH * 0.32 + 0.2, 0.78));
    parts.push(xform(new THREE.BoxGeometry(1.86, 0.16, 0.22), 0, gateH * 0.72 + 0.2, 0.78));
    geom = safeMerge(parts)!;
    PORTCULLIS_GEOM_CACHE.set(level, geom);
  }

  const mesh = new THREE.Mesh(geom, timberMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  grp.add(mesh);

  // Default open (raised up into the gatehouse arch) until locked
  grp.position.y = 1.45;
  grp.userData.targetY = 1.45;
  return grp;
}

/**
 * Smoothly raises or lowers a gatehouse's iron portcullis & timber doors based on `isGateLocked`.
 */
export function updateGatehouseDoorVisual(
  lod: THREE.LOD,
  isGateLocked: boolean,
  delta = 0.016
): void {
  const rootGroup = lod.children[0] as THREE.Group | undefined;
  if (!rootGroup) return;
  const portcullis = rootGroup.getObjectByName('gatePortcullisGroup');
  if (!portcullis) return;
  const targetY = isGateLocked ? 0.0 : 1.48;
  const step = Math.min(1, Math.max(0.08, delta * 6.5));
  portcullis.position.y += (targetY - portcullis.position.y) * step;
}

/**
 * Builds a heavy fortified stone corner bastion pier placed automatically where two stone_wall
 * segments meet at an angle (30°..150°), sealing corner joints like a real medieval curtain wall.
 */
export function createWallJunctionPier(
  rawCulture: CultureKind,
  level: StructureLevel
): THREE.Group {
  const culture = normalizeCultureKind(rawCulture);
  const key = `${culture}_L${level}`;
  let cached = WALL_PIER_GEOM_CACHE.get(key);
  if (!cached) {
    const wallH = level === 1 ? 3.05 : level === 2 ? 3.75 : 4.45;
    const stoneParts: THREE.BufferGeometry[] = [];
    const plasterParts: THREE.BufferGeometry[] = [];
    // Deep battered foundation skirt (-2.2m..+0.6m) + octagonal corner bastion shaft + crenellated crown
    stoneParts.push(xform(new THREE.CylinderGeometry(1.18, 1.45, 2.35, 8), 0, -1.14, 0));
    stoneParts.push(xform(new THREE.CylinderGeometry(1.06, 1.18, 0.85, 8), 0, 0.42, 0));
    plasterParts.push(xform(new THREE.CylinderGeometry(0.96, 1.04, wallH + 0.45, 8), 0, 0.5 + (wallH + 0.45) * 0.5, 0));
    stoneParts.push(xform(new THREE.CylinderGeometry(1.18, 1.02, 0.48, 8), 0, 0.5 + wallH + 0.48, 0));
    // 4 corner merlons on the pier crown
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      stoneParts.push(
        xform(new THREE.BoxGeometry(0.45, 0.52, 0.34), Math.cos(a) * 0.82, 0.5 + wallH + 0.94, Math.sin(a) * 0.82, 0, -a, 0)
      );
    }
    cached = {
      stone: safeMerge(stoneParts)!,
      plaster: safeMerge(plasterParts)!,
    };
    WALL_PIER_GEOM_CACHE.set(key, cached);
  }

  const mats = getCultureMaterials(culture);
  const group = new THREE.Group();
  const mStone = new THREE.Mesh(cached.stone, mats.carvedStone);
  mStone.castShadow = true;
  mStone.receiveShadow = true;
  group.add(mStone);

  const mPlaster = new THREE.Mesh(cached.plaster, mats.plasterWall);
  mPlaster.castShadow = true;
  mPlaster.receiveShadow = true;
  group.add(mPlaster);

  group.userData = { culture, level };
  return group;
}

const UNIT_GEOM_CACHE = new Map<
  UnitKind,
  { factionGeom: THREE.BufferGeometry; armorGeom: THREE.BufferGeometry }
>();

function getBakedUnitTemplate(kind: UnitKind) {
  let cached = UNIT_GEOM_CACHE.get(kind);
  if (cached) return cached;

  const factionList: THREE.BufferGeometry[] = [
    xform(new THREE.CylinderGeometry(0.75, 0.82, 0.22, 8), 0, 0.11, 0),
  ];
  const armorList: THREE.BufferGeometry[] = [];

  if (kind === 'worker') {
    armorList.push(xform(new THREE.BoxGeometry(0.68, 1.15, 0.55), 0, 0.72, 0));
    factionList.push(xform(new THREE.BoxGeometry(0.52, 0.52, 0.52), 0, 1.55, 0));
    armorList.push(xform(new THREE.BoxGeometry(0.65, 0.22, 0.22), 0.45, 1.25, 0.35));
  } else if (kind === 'infantry') {
    armorList.push(xform(new THREE.BoxGeometry(0.82, 1.25, 0.58), 0, 0.8, 0));
    armorList.push(xform(new THREE.BoxGeometry(0.56, 0.55, 0.56), 0, 1.68, 0));
    factionList.push(xform(new THREE.BoxGeometry(0.18, 1.05, 0.78), -0.52, 0.95, 0.18));
    armorList.push(xform(new THREE.BoxGeometry(0.12, 2.65, 0.12), 0.48, 1.45, 0.18));
  } else if (kind === 'battering_ram') {
    // Wheeled Armored Battering Ram Shed + Iron Ram Head
    armorList.push(xform(new THREE.BoxGeometry(1.35, 1.05, 2.25), 0, 0.82, 0));
    factionList.push(xform(new THREE.ConeGeometry(1.05, 0.72, 4), 0, 1.65, 0, 0, Math.PI / 4, 0));
    armorList.push(xform(new THREE.CylinderGeometry(0.24, 0.24, 2.65, 6), 0, 0.72, 0.35, Math.PI / 2, 0, 0));
  } else if (kind === 'trebuchet') {
    // Tall Timber Counterweight Trebuchet Frame & Throwing Arm
    armorList.push(xform(new THREE.BoxGeometry(1.55, 0.32, 2.35), 0, 0.38, 0));
    armorList.push(xform(new THREE.BoxGeometry(0.22, 2.4, 0.22), -0.58, 1.5, 0));
    armorList.push(xform(new THREE.BoxGeometry(0.22, 2.4, 0.22), 0.58, 1.5, 0));
    factionList.push(xform(new THREE.BoxGeometry(0.24, 3.1, 0.24), 0, 2.35, 0, -0.55, 0, 0));
    armorList.push(xform(new THREE.BoxGeometry(0.75, 0.72, 0.75), 0, 1.35, 0.58));
  } else {
    armorList.push(xform(new THREE.BoxGeometry(0.92, 0.9, 1.75), 0, 0.72, 0));
    factionList.push(xform(new THREE.BoxGeometry(0.52, 0.85, 0.56), 0, 1.3, 0.72, 0.35, 0, 0));
    factionList.push(xform(new THREE.BoxGeometry(0.68, 0.95, 0.56), 0, 1.55, -0.1));
    armorList.push(xform(new THREE.ConeGeometry(0.36, 0.65, 4), 0, 2.25, -0.1));
    armorList.push(
      xform(new THREE.ConeGeometry(0.18, 2.7, 4), 0.46, 1.45, 0.95, Math.PI / 2, 0, 0)
    );
  }

  cached = {
    factionGeom: safeMerge(factionList)!,
    armorGeom: safeMerge(armorList)!,
  };
  UNIT_GEOM_CACHE.set(kind, cached);
  return cached;
}

export function buildBlockoutUnitMesh(kind: UnitKind, factionColor: string): THREE.Group {
  const group = new THREE.Group();
  const tpl = getBakedUnitTemplate(kind);
  const factionMat = getSharedFactionMaterial(factionColor);

  const mFaction = new THREE.Mesh(tpl.factionGeom, factionMat);
  mFaction.castShadow = true;
  mFaction.receiveShadow = true;
  group.add(mFaction);

  const mArmor = new THREE.Mesh(tpl.armorGeom, SHARED_MATERIALS.armor);
  mArmor.castShadow = true;
  group.add(mArmor);

  return group;
}

const RESOURCE_GEOM_CACHE = new Map<
  ResourceKind,
  Array<{ geom: THREE.BufferGeometry; mat: THREE.Material }>
>();

export function buildResourceNodeMesh(kind: ResourceKind): THREE.Group {
  const group = new THREE.Group();
  let cached = RESOURCE_GEOM_CACHE.get(kind);

  if (!cached) {
    if (kind === 'wood') {
      const trunks: THREE.BufferGeometry[] = [];
      const canopies: THREE.BufferGeometry[] = [];
      const treePositions = [
        [0, 0, 1.15],
        [-1.15, 0.85, 0.9],
        [1.15, 0.65, 1.0],
        [0.2, -1.15, 0.85],
      ];
      treePositions.forEach(([tx, tz, s]) => {
        trunks.push(
          xform(new THREE.BoxGeometry(0.45 * s, 1.25 * s, 0.45 * s), tx, 0.62 * s, tz)
        );
        canopies.push(
          xform(new THREE.ConeGeometry(1.18 * s, 2.2 * s, 5), tx, 1.95 * s, tz)
        );
        canopies.push(
          xform(new THREE.ConeGeometry(0.92 * s, 1.65 * s, 5), tx, 2.9 * s, tz)
        );
      });
      cached = [
        { geom: safeMerge(trunks)!, mat: SHARED_MATERIALS.treeTrunk },
        { geom: safeMerge(canopies)!, mat: SHARED_MATERIALS.treeCanopy },
      ];
    } else if (kind === 'stone') {
      const rocks = [
        xform(new THREE.DodecahedronGeometry(1.45, 0), 0, 0.9, 0, 0, 0, 0, 1.2, 0.85, 1),
        xform(new THREE.DodecahedronGeometry(1.05, 0), 1.15, 0.7, 0.7),
        xform(new THREE.DodecahedronGeometry(0.9, 0), -1.05, 0.6, -0.6),
      ];
      cached = [{ geom: safeMerge(rocks)!, mat: SHARED_MATERIALS.stone }];
    } else if (kind === 'gold') {
      const base = [xform(new THREE.CylinderGeometry(1.6, 2.0, 0.8, 6), 0, 0.4, 0)];
      const crystals = [0, 2.1, 4.2].map((ang, idx) =>
        xform(
          new THREE.OctahedronGeometry(0.8 - idx * 0.08, 0),
          Math.cos(ang) * 0.58,
          1.2,
          Math.sin(ang) * 0.58,
          0,
          0,
          (idx - 1) * 0.22,
          0.85,
          1.8,
          0.85
        )
      );
      cached = [
        { geom: safeMerge(base)!, mat: SHARED_MATERIALS.darkStone },
        { geom: safeMerge(crystals)!, mat: SHARED_MATERIALS.accentGold },
      ];
    } else {
      const soil = [xform(new THREE.BoxGeometry(3.6, 0.25, 3.6), 0, 0.12, 0)];
      const rows = [-1, 0, 1].map((r) =>
        xform(new THREE.BoxGeometry(2.9, 0.65, 0.65), 0, 0.5, r * 0.98)
      );
      cached = [
        { geom: safeMerge(soil)!, mat: SHARED_MATERIALS.soil },
        { geom: safeMerge(rows)!, mat: SHARED_MATERIALS.wheat },
      ];
    }
    RESOURCE_GEOM_CACHE.set(kind, cached);
  }

  cached.forEach(({ geom, mat }) => {
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });

  return group;
}

export function createBlockoutGridTexture(
  renderer: THREE.WebGLRenderer,
  bgColor = '#1b222c',
  majorLineColor = '#334155',
  minorLineColor = '#242f3d'
): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = minorLineColor;
  for (let i = 0; i < size; i += 8) {
    ctx.fillRect(i, 0, 1, size);
    ctx.fillRect(0, i, size, 1);
  }

  ctx.fillStyle = majorLineColor;
  ctx.fillRect(0, 0, size, 1);
  ctx.fillRect(0, 0, 1, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function buildRemotePlayerPresence(colorHex: string): {
  root: THREE.Group;
  frustumFrame: THREE.LineLoop;
  cursorBeacon: THREE.Group;
} {
  const root = new THREE.Group();
  const color = new THREE.Color(colorHex);

  const points = [
    new THREE.Vector3(-12, 0.18, -8),
    new THREE.Vector3(12, 0.18, -8),
    new THREE.Vector3(12, 0.18, 8),
    new THREE.Vector3(-12, 0.18, 8),
  ];
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
  const frustumFrame = new THREE.LineLoop(geom, mat);
  root.add(frustumFrame);

  const cursorBeacon = new THREE.Group();
  const ringGeom = new THREE.RingGeometry(0.65, 0.95, 8);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.y = 0.12;
  cursorBeacon.add(ring);

  const pointerCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.2, 4),
    getSharedFactionMaterial(colorHex)
  );
  pointerCone.rotation.x = Math.PI;
  pointerCone.position.y = 1.15;
  cursorBeacon.add(pointerCone);

  root.add(cursorBeacon);

  return { root, frustumFrame, cursorBeacon };
}
