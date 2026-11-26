import * as THREE from 'three';
import {
  BANDIT_CLAN_OUTFIT_AR,
  BanditCampArchetype,
  BanditRoleKind,
  BannerPatternKind,
  UnitKind,
} from '../shared/protocol';

/**
 * ============================================================================
 * HIGH-CRAFT ANATOMICAL PIXEL-ART UNIT ENGINE (STRONGHOLD CRUSADER / AOE2 STYLE)
 * ============================================================================
 * Renders crisp 48x64 (infantry/workers) and 64x64 (cavalry/commanders/siege)
 * sprites with realistic ~1:5.5 head-to-body proportions, 3-tone shading,
 * authentic Levantine/Arabian helmets, turbans, lamellar armor, shields,
 * warhorses, and an automatic 1px dark silhouette outline pass.
 */

interface UnitPalette {
  skin: string;
  skinDark: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  steel: string;
  steelLight: string;
  steelDark: string;
  wood: string;
  woodDark: string;
  leather: string;
  leatherDark: string;
  cloth: string;
  clothDark: string;
}

function makeUnitPalette(factionColor: string, secondaryColor: string): UnitPalette {
  const f = new THREE.Color(factionColor);
  const fDark = f.clone().multiplyScalar(0.62);
  const fLight = f.clone().lerp(new THREE.Color(0xffffff), 0.28);
  const s = new THREE.Color(secondaryColor || '#fbbf24');
  const sDark = s.clone().multiplyScalar(0.68);
  return {
    skin: '#e7b581',
    skinDark: '#bf8552',
    primary: `#${f.getHexString()}`,
    primaryDark: `#${fDark.getHexString()}`,
    primaryLight: `#${fLight.getHexString()}`,
    secondary: `#${s.getHexString()}`,
    secondaryDark: `#${sDark.getHexString()}`,
    steel: '#cbd5e1',
    steelLight: '#f8fafc',
    steelDark: '#64748b',
    wood: '#8b5a2b',
    woodDark: '#543214',
    leather: '#6b4226',
    leatherDark: '#3f2412',
    cloth: '#ebe2cf',
    clothDark: '#b8a98d',
  };
}

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pxLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thickness = 1
) {
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  while (true) {
    ctx.fillRect(x, y, thickness, thickness);
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Automatic 1px dark silhouette outline around all opaque pixels (clean Stronghold/AoE2 look).
 */
function applyCrispOutline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r = 18,
  g = 14,
  b = 20
) {
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const dst = img.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (src[idx + 3] > 20) continue;
      const hasNeighbor =
        src[((y - 1) * w + x) * 4 + 3] > 20 ||
        src[((y + 1) * w + x) * 4 + 3] > 20 ||
        src[(y * w + (x - 1)) * 4 + 3] > 20 ||
        src[(y * w + (x + 1)) * 4 + 3] > 20;
      if (hasNeighbor) {
        dst[idx] = r;
        dst[idx + 1] = g;
        dst[idx + 2] = b;
        dst[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawEmblemDot(
  ctx: CanvasRenderingContext2D,
  pattern: BannerPatternKind,
  cx: number,
  cy: number,
  color: string
) {
  if (pattern === 'crescent_star') {
    px(ctx, cx - 2, cy - 2, 3, 1, color);
    px(ctx, cx - 3, cy - 1, 2, 3, color);
    px(ctx, cx - 2, cy + 2, 3, 1, color);
    px(ctx, cx + 2, cy, 1, 1, color);
  } else if (pattern === 'crusader_cross') {
    px(ctx, cx, cy - 3, 2, 7, color);
    px(ctx, cx - 2, cy - 1, 6, 2, color);
  } else if (pattern === 'crossed_swords') {
    pxLine(ctx, cx - 2, cy - 2, cx + 2, cy + 2, color, 1);
    pxLine(ctx, cx - 2, cy + 2, cx + 2, cy - 2, color, 1);
  } else {
    px(ctx, cx - 1, cy - 2, 3, 5, color);
    px(ctx, cx - 2, cy - 1, 5, 3, color);
  }
}

/**
 * Draws a well-proportioned standing human soldier (48x64 canvas, ~44px tall, head ~8px).
 */
function drawFootHumanBase(
  ctx: CanvasRenderingContext2D,
  pal: UnitPalette,
  frame: 0 | 1,
  opts: {
    headgear: 'turban' | 'helmet_spiked' | 'hood' | 'kettle_helm' | 'bandit_litham';
    armored: boolean;
    cloakColor?: string;
    tunicColor?: string;
    tunicDark?: string;
    headColor?: string;
    headDark?: string;
  }
) {
  const cx = 24;
  const bob = frame === 1 ? 1 : 0;
  const legSpread = frame === 0 ? 2 : 5;
  const tunic = opts.tunicColor ?? pal.primary;
  const tunicDark = opts.tunicDark ?? pal.primaryDark;
  const headC = opts.headColor ?? pal.primary;
  const headD = opts.headDark ?? pal.primaryDark;

  // Flowing cloak behind torso
  if (opts.cloakColor) {
    px(ctx, cx - 7, 25 + bob, 14, 21, opts.cloakColor);
    px(ctx, cx - 8, 34 + bob, 16, 13, opts.cloakColor);
  }

  // Boots & Legs (anatomical length: y = 44..59)
  const leftLegX = cx - 4 - Math.floor(legSpread * 0.4);
  const rightLegX = cx + 1 + Math.floor(legSpread * 0.4);
  // Trousers / leggings
  px(ctx, leftLegX, 43 + bob, 3, 10, pal.clothDark);
  px(ctx, rightLegX, 43 + bob, 3, 10, pal.clothDark);
  // Leather boots
  px(ctx, leftLegX - 1, 52 + bob, 4, 7, pal.leather);
  px(ctx, leftLegX - 1, 56 + bob, 4, 3, pal.leatherDark);
  px(ctx, rightLegX, 52 + bob, 4, 7, pal.leather);
  px(ctx, rightLegX, 56 + bob, 4, 3, pal.leatherDark);

  // Tunic skirt / kaftan lower hem (y = 37..46)
  px(ctx, cx - 6, 37 + bob, 12, 9, tunic);
  px(ctx, cx - 6, 43 + bob, 12, 3, tunicDark);
  px(ctx, cx - 1, 38 + bob, 2, 8, pal.secondaryDark);

  // Torso / Chest armor (y = 24..37)
  px(ctx, cx - 6, 24 + bob, 12, 13, opts.armored ? pal.steelDark : tunic);
  px(ctx, cx - 5, 25 + bob, 10, 11, opts.armored ? pal.steel : tunic);
  if (opts.armored) {
    // Lamellar horizontal plates + faction surcoat stripe
    px(ctx, cx - 5, 28 + bob, 10, 1, pal.steelDark);
    px(ctx, cx - 5, 31 + bob, 10, 1, pal.steelDark);
    px(ctx, cx - 5, 34 + bob, 10, 1, pal.steelDark);
    px(ctx, cx - 2, 25 + bob, 4, 11, tunic);
    px(ctx, cx - 1, 25 + bob, 2, 11, pal.primaryLight);
  } else {
    // Tunic shading & highlight
    px(ctx, cx - 5, 25 + bob, 4, 10, pal.primaryLight);
    px(ctx, cx + 2, 25 + bob, 3, 10, tunicDark);
  }
  // Belt / sash
  px(ctx, cx - 6, 36 + bob, 12, 2, pal.leatherDark);
  px(ctx, cx - 2, 36 + bob, 4, 2, pal.secondary);

  // Shoulders & Arms
  px(ctx, cx - 9, 25 + bob, 3, 10, opts.armored ? pal.steelDark : tunicDark);
  px(ctx, cx + 6, 25 + bob, 3, 10, opts.armored ? pal.steel : tunic);
  px(ctx, cx - 9, 34 + bob, 3, 3, pal.skin);
  px(ctx, cx + 6, 34 + bob, 3, 3, pal.skin);

  // Neck & Head (anatomical: 7x8px at y = 15..23)
  px(ctx, cx - 2, 22 + bob, 4, 3, pal.skinDark);
  px(ctx, cx - 3, 16 + bob, 6, 7, pal.skin);
  px(ctx, cx + 1, 17 + bob, 2, 5, pal.skinDark);
  // Subtle facial features (eyes + beard)
  px(ctx, cx - 2, 19 + bob, 1, 1, '#1e1b18');
  px(ctx, cx + 1, 19 + bob, 1, 1, '#1e1b18');
  px(ctx, cx - 2, 21 + bob, 4, 2, '#3b2414');

  // Headgear
  if (opts.headgear === 'turban') {
    px(ctx, cx - 5, 13 + bob, 10, 5, pal.cloth);
    px(ctx, cx - 4, 12 + bob, 8, 2, pal.cloth);
    px(ctx, cx - 5, 16 + bob, 10, 2, pal.clothDark);
    px(ctx, cx - 3, 14 + bob, 6, 1, pal.secondary);
  } else if (opts.headgear === 'helmet_spiked') {
    // Classic Levantine/Arabian Khud conical spiked helmet with mail aventail
    px(ctx, cx - 4, 14 + bob, 8, 4, pal.steel);
    px(ctx, cx - 3, 12 + bob, 6, 2, pal.steelLight);
    px(ctx, cx - 1, 9 + bob, 2, 3, pal.secondary); // Spire
    px(ctx, cx - 4, 17 + bob, 8, 1, pal.secondary); // Rim
    px(ctx, cx - 4, 18 + bob, 1, 5, pal.steelDark); // Cheek mail
    px(ctx, cx + 3, 18 + bob, 1, 5, pal.steelDark);
  } else if (opts.headgear === 'kettle_helm') {
    px(ctx, cx - 4, 13 + bob, 8, 4, pal.steel);
    px(ctx, cx - 3, 12 + bob, 6, 1, pal.steelLight);
    px(ctx, cx - 6, 16 + bob, 12, 2, pal.steelDark);
  } else if (opts.headgear === 'bandit_litham') {
    px(ctx, cx - 5, 13 + bob, 10, 5, headC);
    px(ctx, cx - 4, 12 + bob, 8, 2, headD);
    // Face wrap (litham)
    px(ctx, cx - 3, 20 + bob, 6, 3, headD);
  } else {
    // Worker hood/keffiyeh
    px(ctx, cx - 4, 13 + bob, 8, 4, headC);
    px(ctx, cx - 5, 16 + bob, 2, 7, headD);
    px(ctx, cx + 3, 16 + bob, 2, 7, headD);
  }
}

/**
 * Draws a well-proportioned medieval Arabian warhorse + rider on a 64x64 canvas.
 */
function drawMountedUnit(
  ctx: CanvasRenderingContext2D,
  pal: UnitPalette,
  frame: 0 | 1,
  opts: {
    isCommander: boolean;
    isBandit?: boolean;
    bannerPattern: BannerPatternKind;
    horseCoat: string;
    horseDark: string;
    horseLight: string;
  }
) {
  const bob = frame === 1 ? 1 : 0;
  const stride = frame === 0 ? 0 : 3;

  // Tail
  pxLine(ctx, 13, 35 + bob, 8, 44 + bob, opts.horseDark, 2);
  pxLine(ctx, 12, 37 + bob, 9, 46 + bob, '#1c1917', 1);

  // Horse Legs (4 distinct anatomical legs with gallop stride)
  // Back legs
  px(ctx, 16 - stride, 44 + bob, 3, 14, opts.horseDark);
  px(ctx, 15 - stride, 56 + bob, 3, 3, '#1c1917');
  px(ctx, 21 + Math.floor(stride * 0.5), 44 + bob, 3, 14, opts.horseCoat);
  px(ctx, 21 + Math.floor(stride * 0.5), 56 + bob, 3, 3, '#1c1917');
  // Front legs
  px(ctx, 38 - Math.floor(stride * 0.5), 44 + bob, 3, 14, opts.horseDark);
  px(ctx, 38 - Math.floor(stride * 0.5), 56 + bob, 3, 3, '#1c1917');
  px(ctx, 43 + stride, 43 + bob, 3, 14, opts.horseCoat);
  px(ctx, 44 + stride, 55 + bob, 3, 3, '#1c1917');

  // Horse Barrel / Body (x = 14..45, y = 31..45)
  px(ctx, 14, 32 + bob, 31, 13, opts.horseCoat);
  px(ctx, 16, 31 + bob, 27, 3, opts.horseLight);
  px(ctx, 15, 42 + bob, 29, 3, opts.horseDark);

  // Armored Caparison / Horse Barding (faction colors)
  if (!opts.isBandit) {
    px(ctx, 15, 33 + bob, 29, 10, pal.primary);
    px(ctx, 15, 41 + bob, 29, 2, pal.secondary);
    px(ctx, 16, 34 + bob, 27, 2, pal.primaryLight);
    drawEmblemDot(ctx, opts.bannerPattern, 29, 37 + bob, pal.secondary);
  } else {
    // Bandit saddle blanket
    px(ctx, 22, 32 + bob, 14, 7, pal.primaryDark);
    px(ctx, 22, 38 + bob, 14, 1, pal.secondary);
  }

  // Horse Neck & Head (facing right, x = 40..54, y = 21..36)
  px(ctx, 40, 24 + bob, 8, 12, opts.horseCoat);
  px(ctx, 41, 24 + bob, 3, 10, opts.horseLight);
  // Mane
  px(ctx, 38, 23 + bob, 3, 11, '#1c1917');
  // Horse Head & Muzzle
  px(ctx, 45, 22 + bob, 8, 6, opts.horseCoat);
  px(ctx, 49, 25 + bob, 6, 4, opts.horseDark);
  px(ctx, 46, 20 + bob, 2, 3, opts.horseDark); // Ears
  px(ctx, 49, 24 + bob, 1, 1, '#09090b'); // Eye
  // Chamfron steel horse-head armor for knights/commanders
  if (!opts.isBandit) {
    px(ctx, 46, 22 + bob, 6, 3, opts.isCommander ? pal.secondary : pal.steel);
  }

  // Saddle & Rider (centered at x = 29, y = 9..36)
  const rx = 29;
  px(ctx, rx - 5, 28 + bob, 10, 5, pal.leatherDark);
  // Rider leg in stirrup
  px(ctx, rx - 1, 31 + bob, 4, 10, pal.leather);
  px(ctx, rx, 39 + bob, 4, 3, pal.steelDark);

  // Flowing Commander Cape
  if (opts.isCommander) {
    px(ctx, rx - 13, 21 + bob, 11, 14, pal.primaryDark);
    px(ctx, rx - 15, 25 + bob, 7, 10, pal.primary);
    px(ctx, rx - 15, 34 + bob, 10, 2, pal.secondary);
  }

  // Rider Torso (anatomical: 10x11)
  px(ctx, rx - 5, 19 + bob, 10, 11, opts.isBandit ? pal.primaryDark : pal.steel);
  px(ctx, rx - 3, 20 + bob, 6, 9, pal.primary);
  px(ctx, rx - 5, 28 + bob, 10, 2, pal.secondary);

  // Rider Head (6x6 at y = 12..18)
  px(ctx, rx - 3, 13 + bob, 6, 6, pal.skin);
  px(ctx, rx - 2, 17 + bob, 4, 2, '#3b2414');
  if (opts.isCommander) {
    // Sultan / Commander Golden Crowned Turban & Spire
    px(ctx, rx - 5, 9 + bob, 10, 5, pal.cloth);
    px(ctx, rx - 4, 8 + bob, 8, 2, pal.secondary);
    px(ctx, rx - 1, 5 + bob, 2, 4, pal.secondary);
    px(ctx, rx - 4, 12 + bob, 8, 1, pal.secondary);
  } else if (opts.isBandit) {
    px(ctx, rx - 4, 10 + bob, 8, 4, pal.primaryDark);
    px(ctx, rx - 3, 16 + bob, 6, 3, pal.primaryDark);
  } else {
    // Knight Spiked Helmet
    px(ctx, rx - 4, 10 + bob, 8, 4, pal.steel);
    px(ctx, rx - 2, 8 + bob, 4, 2, pal.steelLight);
    px(ctx, rx - 1, 6 + bob, 2, 2, pal.secondary);
  }

  // Weapon & Shield
  if (opts.isCommander) {
    // Tall Royal War Standard Banner
    px(ctx, rx - 9, 4, 2, 30, pal.woodDark);
    px(ctx, rx - 9, 3, 2, 2, pal.secondary);
    px(ctx, rx - 19, 5, 10, 9, pal.primary);
    px(ctx, rx - 19, 5, 10, 1, pal.secondary);
    px(ctx, rx - 19, 13, 10, 1, pal.secondary);
    drawEmblemDot(ctx, opts.bannerPattern, rx - 14, 9, pal.secondary);
    // Raised Curved Shamshir in right hand
    pxLine(ctx, rx + 5, 22 + bob, rx + 13, 11 + bob, pal.steelLight, 2);
    px(ctx, rx + 4, 22 + bob, 3, 2, pal.secondary);
  } else {
    // Couched Lance / Spear tilted forward
    pxLine(ctx, rx + 3, 25 + bob, 60, 10 + bob, pal.wood, 2);
    pxLine(ctx, 57, 11 + bob, 62, 8 + bob, pal.steelLight, 2);
    if (!opts.isBandit) {
      // Pennant on lance
      px(ctx, 49, 14 + bob, 7, 4, pal.primary);
      px(ctx, 49, 14 + bob, 7, 1, pal.secondary);
    }
    // Round Bossed Shield on left flank
    px(ctx, rx - 6, 21 + bob, 8, 9, pal.primary);
    px(ctx, rx - 5, 22 + bob, 6, 7, pal.secondary);
    px(ctx, rx - 4, 23 + bob, 4, 5, pal.primaryDark);
    px(ctx, rx - 3, 25 + bob, 2, 2, pal.steelLight);
  }
}

export function createHighCraftUnitCanvas(
  kind: UnitKind,
  factionColor: string,
  frame: 0 | 1,
  secondaryColor = '#fbbf24',
  bannerPattern: BannerPatternKind = 'crescent_star'
): HTMLCanvasElement {
  const isWide =
    kind === 'knight' ||
    kind === 'commander' ||
    kind === 'battering_ram' ||
    kind === 'trebuchet';
  const w = isWide ? 64 : 48;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  const pal = makeUnitPalette(factionColor, secondaryColor);
  const bob = frame === 1 ? 1 : 0;

  if (kind === 'worker') {
    drawFootHumanBase(ctx, pal, frame, {
      headgear: 'hood',
      armored: false,
      tunicColor: pal.cloth,
      tunicDark: pal.clothDark,
      headColor: pal.primary,
      headDark: pal.primaryDark,
    });
    // Pickaxe / Wood Axe over right shoulder
    const swing = frame === 1 ? 2 : 0;
    pxLine(ctx, 32, 35 + bob, 40, 17 + swing, pal.wood, 2);
    px(ctx, 36, 15 + swing, 8, 4, pal.steel);
    px(ctx, 37, 15 + swing, 6, 1, pal.steelLight);
  } else if (kind === 'infantry') {
    drawFootHumanBase(ctx, pal, frame, {
      headgear: 'helmet_spiked',
      armored: true,
      cloakColor: pal.primaryDark,
    });
    // Round Shield (left)
    px(ctx, 10, 27 + bob, 9, 11, pal.secondary);
    px(ctx, 11, 28 + bob, 7, 9, pal.primary);
    drawEmblemDot(ctx, bannerPattern, 14, 32 + bob, pal.secondary);
    // Curved Shamshir Sword (right)
    pxLine(ctx, 32, 34 + bob, 41, 18 + bob, pal.steelLight, 2);
    px(ctx, 31, 33 + bob, 4, 2, pal.secondary);
  } else if (kind === 'spearman') {
    drawFootHumanBase(ctx, pal, frame, {
      headgear: 'kettle_helm',
      armored: true,
    });
    // Tall Kite Shield (left)
    px(ctx, 10, 26 + bob, 10, 15, pal.secondary);
    px(ctx, 11, 27 + bob, 8, 13, pal.primary);
    px(ctx, 12, 39 + bob, 6, 3, pal.primaryDark);
    drawEmblemDot(ctx, bannerPattern, 15, 33 + bob, pal.secondary);
    // Long Anti-Cavalry Pike / Spear (right)
    pxLine(ctx, 34, 56, 37, 6 + bob, pal.wood, 2);
    px(ctx, 36, 3 + bob, 3, 6, pal.steelLight);
    px(ctx, 34, 11 + bob, 5, 3, pal.primary);
  } else if (kind === 'archer') {
    drawFootHumanBase(ctx, pal, frame, {
      headgear: 'turban',
      armored: false,
      cloakColor: pal.primaryDark,
    });
    // Quiver on back
    px(ctx, 16, 22 + bob, 3, 9, pal.leather);
    px(ctx, 16, 19 + bob, 1, 3, pal.cloth);
    px(ctx, 18, 20 + bob, 1, 2, pal.secondary);
    // Composite Recurve Bow (right)
    pxLine(ctx, 35, 19 + bob, 39, 28 + bob, pal.wood, 2);
    pxLine(ctx, 39, 28 + bob, 35, 38 + bob, pal.wood, 2);
    pxLine(ctx, 35, 20 + bob, 35, 37 + bob, pal.cloth, 1);
    // Nocked Arrow
    pxLine(ctx, 30, 29 + bob, 42, 29 + bob, pal.woodDark, 1);
    px(ctx, 41, 28 + bob, 3, 2, pal.steelLight);
  } else if (kind === 'knight') {
    drawMountedUnit(ctx, pal, frame, {
      isCommander: false,
      bannerPattern,
      horseCoat: '#7c3f1d',
      horseDark: '#4a230e',
      horseLight: '#a65e33',
    });
  } else if (kind === 'commander') {
    drawMountedUnit(ctx, pal, frame, {
      isCommander: true,
      bannerPattern,
      horseCoat: '#e7e2d8',
      horseDark: '#a89f91',
      horseLight: '#ffffff',
    });
  } else if (kind === 'battering_ram') {
    const shift = frame === 1 ? 2 : 0;
    // Heavy Wooden Timber Wheels
    px(ctx, 12, 46, 11, 11, pal.woodDark);
    px(ctx, 15, 49, 5, 5, pal.steelDark);
    px(ctx, 40, 46, 11, 11, pal.woodDark);
    px(ctx, 43, 49, 5, 5, pal.steelDark);
    // Reinforced Pitched Roof Frame
    px(ctx, 10, 26, 44, 22, pal.wood);
    px(ctx, 12, 28, 40, 18, pal.woodDark);
    px(ctx, 8, 22, 48, 6, pal.leather);
    px(ctx, 14, 18, 36, 5, pal.leatherDark);
    // Faction Heraldic Shield Panel on Side
    px(ctx, 22, 30, 20, 12, pal.primary);
    px(ctx, 22, 30, 20, 2, pal.secondary);
    drawEmblemDot(ctx, bannerPattern, 32, 36, pal.secondary);
    // Iron-Capped Battering Log jutting forward
    px(ctx, 44 + shift, 34, 15, 7, pal.wood);
    px(ctx, 54 + shift, 33, 7, 9, pal.steel);
    px(ctx, 57 + shift, 34, 4, 3, pal.steelLight);
  } else {
    // Trebuchet Siege Engine (64x64)
    // Heavy Timber Base & Wheels
    px(ctx, 10, 48, 44, 8, pal.woodDark);
    px(ctx, 12, 46, 40, 4, pal.wood);
    px(ctx, 12, 52, 8, 8, pal.leatherDark);
    px(ctx, 44, 52, 8, 8, pal.leatherDark);
    // A-Frame Upright Supports
    pxLine(ctx, 18, 48, 31, 20, pal.wood, 4);
    pxLine(ctx, 45, 48, 32, 20, pal.woodDark, 4);
    px(ctx, 29, 18, 6, 5, pal.steelDark); // Axle
    // Throwing Arm & Counterweight
    if (frame === 0) {
      pxLine(ctx, 14, 10, 44, 33, pal.wood, 3);
      px(ctx, 41, 31, 11, 11, pal.steelDark); // Counterweight box
      px(ctx, 43, 33, 7, 7, pal.primary);
      px(ctx, 9, 10, 6, 6, '#94a3b8'); // Stone boulder in sling
    } else {
      pxLine(ctx, 32, 5, 36, 36, pal.wood, 3);
      px(ctx, 31, 34, 11, 11, pal.steelDark);
      px(ctx, 33, 36, 7, 7, pal.primary);
      px(ctx, 28, 3, 6, 6, '#cbd5e1');
    }
    // Faction Pennant
    px(ctx, 15, 28, 9, 6, pal.primary);
    px(ctx, 15, 28, 9, 1, pal.secondary);
  }

  applyCrispOutline(ctx, w, h);
  return canvas;
}

export function createHighCraftBanditCanvas(
  role: BanditRoleKind,
  archetype: BanditCampArchetype,
  frame: 0 | 1,
  carryingLoot: boolean
): HTMLCanvasElement {
  const isMounted = role === 'raider_horse';
  const w = isMounted ? 64 : 48;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  const outfit = BANDIT_CLAN_OUTFIT_AR[archetype] ?? BANDIT_CLAN_OUTFIT_AR.forest_ambush;
  const pal = makeUnitPalette(outfit.cloakHex, outfit.sashHex);
  const bob = frame === 1 ? 1 : 0;

  if (isMounted) {
    drawMountedUnit(ctx, pal, frame, {
      isCommander: false,
      isBandit: true,
      bannerPattern: 'crossed_swords',
      horseCoat: '#3f342d',
      horseDark: '#231c18',
      horseLight: '#5c4d44',
    });
  } else {
    drawFootHumanBase(ctx, pal, frame, {
      headgear: 'bandit_litham',
      armored: role === 'brigand',
      cloakColor: outfit.cloakHex,
      tunicColor: outfit.cloakHex,
      tunicDark: pal.primaryDark,
      headColor: outfit.hoodHex,
      headDark: pal.primaryDark,
    });

    if (role === 'poacher') {
      pxLine(ctx, 34, 20 + bob, 38, 29 + bob, pal.wood, 2);
      pxLine(ctx, 38, 29 + bob, 34, 38 + bob, pal.wood, 2);
      pxLine(ctx, 34, 21 + bob, 34, 37 + bob, pal.cloth, 1);
    } else if (role === 'brigand') {
      // Heavy Axe
      pxLine(ctx, 32, 35 + bob, 40, 15 + bob, pal.woodDark, 2);
      px(ctx, 37, 13 + bob, 7, 7, pal.steel);
    } else {
      // Curved Dagger / Scimitar
      pxLine(ctx, 32, 34 + bob, 40, 21 + bob, pal.steelLight, 2);
    }

    if (carryingLoot) {
      // Golden loot sack on back
      px(ctx, 10, 26 + bob, 9, 10, '#a16207');
      px(ctx, 11, 27 + bob, 7, 7, '#eab308');
      px(ctx, 12, 26 + bob, 5, 2, '#fef08a');
    }
  }

  applyCrispOutline(ctx, w, h);
  return canvas;
}
