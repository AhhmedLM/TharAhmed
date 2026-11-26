import React, { useEffect, useId, useMemo, useRef } from 'react';
import {
  BannerPatternKind,
  BlockoutStructure,
  BlockoutUnit,
  getStructureVisionRadius,
  getUnitVisionRadius,
  PlayerState,
  ResourceNode,
} from '../shared/protocol';
import {
  ClimateKind,
  getBiomeAt,
  getRoadDistance,
  getSnowlineElevationAt,
  getTerrainHeight,
  WATER_LEVEL_Y,
} from '../shared/worldMap';

export type ResourceKind = 'wood' | 'stone' | 'gold' | 'food' | 'cloth' | 'horses';

/**
 * Stronghold-style Hammered Brass Corner Mount SVG (L-bracket with rivets)
 */
export const BrassCornerMountSvg: React.FC<{
  corner: 'tr' | 'tl' | 'br' | 'bl';
  className?: string;
}> = ({ corner, className = '' }) => {
  const rotate =
    corner === 'tr'
      ? 'rotate(0)'
      : corner === 'tl'
        ? 'rotate(-90)'
        : corner === 'bl'
          ? 'rotate(180)'
          : 'rotate(90)';

  return (
    <svg
      viewBox="0 0 14 14"
      className={`w-3 h-3 pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      <g transform={`translate(7 7) ${rotate} translate(-7 -7)`}>
        <path
          d="M1,1 L13,1 L13,4 L4,4 L4,13 L1,13 Z"
          fill="#c99846"
          stroke="#261808"
          strokeWidth="0.9"
        />
        <line x1="2" y1="2" x2="12" y2="2" stroke="#ffebb0" strokeWidth="0.8" />
        <circle cx="3" cy="3" r="1.1" fill="#261808" />
        <circle cx="10.5" cy="2.5" r="0.9" fill="#261808" />
        <circle cx="2.5" cy="10.5" r="0.9" fill="#261808" />
      </g>
    </svg>
  );
};

/**
 * Wrought-Iron & Brass Vertical Spearhead Divider SVG
 */
export const ChiseledSeparatorSvg: React.FC<{ className?: string }> = ({
  className = 'w-2 h-6',
}) => (
  <svg
    viewBox="0 0 8 28"
    className={`shrink-0 pointer-events-none select-none ${className}`}
    aria-hidden="true"
  >
    <line x1="3.5" y1="1" x2="3.5" y2="27" stroke="#160f08" strokeWidth="2" />
    <line x1="4.5" y1="1" x2="4.5" y2="27" stroke="#856229" strokeWidth="1" />
    <polygon
      points="4,8 7.2,14 4,20 0.8,14"
      fill="#d9a84e"
      stroke="#261808"
      strokeWidth="0.8"
    />
  </svg>
);

/**
 * Hand-Crafted 2000s Bitmap/Sprite-Style Resource Artwork SVG
 * Replaces generic Lucide icons with classic medieval RTS resource illustrations.
 */
export const ResourceArtworkSvg: React.FC<{
  kind: ResourceKind;
  className?: string;
}> = ({ kind, className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    className={`pointer-events-none select-none shrink-0 ${className}`}
    aria-hidden="true"
  >
    {kind === 'wood' && (
      <g>
        {/* Bottom Stacked Logs */}
        <path d="M4,15 L15,9 L19,12 L8,18 Z" fill="#7c471b" stroke="#241305" strokeWidth="1" />
        <ellipse cx="6" cy="16.5" rx="2.6" ry="2.2" fill="#e6b87d" stroke="#241305" strokeWidth="0.9" />
        <path d="M7,19 L18,13 L21,16 L10,22 Z" fill="#633611" stroke="#241305" strokeWidth="1" />
        <ellipse cx="8.5" cy="20.5" rx="2.5" ry="2" fill="#d9a362" stroke="#241305" strokeWidth="0.9" />
        {/* Top Crossed Log */}
        <path d="M6,10 L16,4 L20,7 L10,13 Z" fill="#9a5b25" stroke="#241305" strokeWidth="1" />
        <ellipse cx="8" cy="11.5" rx="2.6" ry="2.2" fill="#f3cfa0" stroke="#241305" strokeWidth="0.9" />
        <circle cx="8" cy="11.5" r="0.8" fill="#7c471b" />
      </g>
    )}

    {kind === 'stone' && (
      <g>
        {/* Back Hewn Ashlar Block */}
        <polygon points="8,6 16,3 21,7 13,10" fill="#cbd5e1" stroke="#1e293b" strokeWidth="0.9" />
        <polygon points="8,6 13,10 13,17 8,13" fill="#94a3b8" stroke="#1e293b" strokeWidth="0.9" />
        <polygon points="13,10 21,7 21,14 13,17" fill="#64748b" stroke="#1e293b" strokeWidth="0.9" />
        {/* Front Chiseled Stone */}
        <polygon points="3,13 10,10 15,13 8,16" fill="#e2e8f0" stroke="#0f172a" strokeWidth="0.9" />
        <polygon points="3,13 8,16 8,21 3,18" fill="#94a3b8" stroke="#0f172a" strokeWidth="0.9" />
        <polygon points="8,16 15,13 15,18 8,21" fill="#475569" stroke="#0f172a" strokeWidth="0.9" />
      </g>
    )}

    {kind === 'gold' && (
      <g>
        {/* Gold Ingot Bar Behind */}
        <polygon points="8,8 17,5 21,8 12,11" fill="#fef08a" stroke="#451a03" strokeWidth="0.9" />
        <polygon points="8,8 12,11 12,16 8,13" fill="#eab308" stroke="#451a03" strokeWidth="0.9" />
        <polygon points="12,11 21,8 21,13 12,16" fill="#b45309" stroke="#451a03" strokeWidth="0.9" />
        {/* Stacked Gold Dinars in Front */}
        <ellipse cx="8" cy="18" rx="4.5" ry="2.2" fill="#ca8a04" stroke="#451a03" strokeWidth="0.9" />
        <ellipse cx="8" cy="15.8" rx="4.5" ry="2.2" fill="#eab308" stroke="#451a03" strokeWidth="0.9" />
        <ellipse cx="8" cy="13.6" rx="4.5" ry="2.2" fill="#fde047" stroke="#451a03" strokeWidth="0.9" />
        <circle cx="16.5" cy="17.5" r="3" fill="#facc15" stroke="#451a03" strokeWidth="0.9" />
        <circle cx="16.5" cy="17.5" r="1.3" fill="#b45309" />
      </g>
    )}

    {kind === 'food' && (
      <g>
        {/* Golden Wheat Sheaf */}
        <path d="M12,20 L7,6 M12,20 L12,4 M12,20 L17,6" stroke="#eab308" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="7" cy="6.5" rx="1.6" ry="2.6" fill="#fde047" stroke="#713f12" strokeWidth="0.7" />
        <ellipse cx="12" cy="4.5" rx="1.7" ry="2.7" fill="#fef08a" stroke="#713f12" strokeWidth="0.7" />
        <ellipse cx="17" cy="6.5" rx="1.6" ry="2.6" fill="#fde047" stroke="#713f12" strokeWidth="0.7" />
        {/* Warm Baked Bread Loaf */}
        <path d="M5,18 Q12,11 19,18 L18,21 L6,21 Z" fill="#b45309" stroke="#451a03" strokeWidth="1" />
        <path d="M7,17 Q12,13 17,17" fill="none" stroke="#fde68a" strokeWidth="1.1" />
      </g>
    )}

    {kind === 'cloth' && (
      <g>
        {/* Folded Crimson & Violet Silk Bolt */}
        <path d="M5,11 L17,7 L20,14 L8,18 Z" fill="#9333ea" stroke="#2e1065" strokeWidth="1" />
        <path d="M4,14 L16,10 L19,17 L7,21 Z" fill="#c084fc" stroke="#2e1065" strokeWidth="1" />
        <ellipse cx="5.5" cy="17.5" rx="2" ry="3.2" fill="#f5d0fe" stroke="#2e1065" strokeWidth="0.9" />
        {/* Cotton Boll */}
        <circle cx="16.5" cy="7.5" r="2.3" fill="#f8fafc" stroke="#475569" strokeWidth="0.7" />
        <circle cx="19" cy="9" r="2" fill="#f1f5f9" stroke="#475569" strokeWidth="0.7" />
        <circle cx="14.5" cy="9.5" r="2" fill="#ffffff" stroke="#475569" strokeWidth="0.7" />
      </g>
    )}

    {kind === 'horses' && (
      <g>
        {/* Noble Bridled Arabian Warhorse Silhouette */}
        <path
          d="M6,20 L8,11 L13,5 L16,3 L17,6 L20,9 L18,12 L15,11 L14,15 L17,20 Z"
          fill="#9a3412"
          stroke="#261105"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Golden Bridle & Eye */}
        <line x1="15" y1="6" x2="18.5" y2="10.5" stroke="#fde047" strokeWidth="1.1" />
        <circle cx="15.8" cy="6.8" r="0.9" fill="#fde047" />
        {/* Flowing Mane */}
        <path d="M12,5 L8,9 M11,7 L7,12" stroke="#431407" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    )}
  </svg>
);

/**
 * Crisp Heraldic Banner Emblem SVG
 */
export const HeraldicEmblemSvg: React.FC<{
  pattern: BannerPatternKind;
  color: string;
  className?: string;
}> = ({ pattern, color, className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    className={`pointer-events-none select-none ${className}`}
    aria-hidden="true"
  >
    {pattern === 'crescent_star' && (
      <g fill={color}>
        <path d="M13.5,4.5 A7.5,7.5 0 1,0 13.5,19.5 A6,6 0 1,1 13.5,4.5 Z" />
        <polygon points="16.5,9 17.4,11 19.5,11.2 17.9,12.5 18.4,14.5 16.5,13.4 14.6,14.5 15.1,12.5 13.5,11.2 15.6,11" />
      </g>
    )}
    {pattern === 'crossed_swords' && (
      <g stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none">
        <line x1="5" y1="19" x2="19" y2="5" />
        <line x1="5" y1="5" x2="19" y2="19" />
        <line x1="4.5" y1="14.5" x2="9.5" y2="19.5" />
        <line x1="14.5" y1="19.5" x2="19.5" y2="14.5" />
      </g>
    )}
    {pattern === 'crusader_cross' && (
      <g fill={color}>
        <polygon points="10,3 14,3 13,10 21,9 21,15 13,14 14,21 10,21 11,14 3,15 3,9 11,10" />
      </g>
    )}
    {pattern === 'royal_lion' && (
      <g fill={color}>
        <polygon points="4,9 7,4 12,8 17,4 20,9 18,16 6,16" />
        <rect x="6" y="17" width="12" height="2.5" rx="0.5" />
      </g>
    )}
    {pattern === 'nordic_raven' && (
      <g fill={color}>
        <polygon points="12,3 14,8 22,6 17,13 20,18 12,15 4,18 7,13 2,6 10,8" />
      </g>
    )}
    {pattern === 'imperial_sun' && (
      <g fill={color}>
        <circle cx="12" cy="12" r="4.5" />
        <polygon points="12,2 13.5,6.5 10.5,6.5" />
        <polygon points="12,22 13.5,17.5 10.5,17.5" />
        <polygon points="2,12 6.5,10.5 6.5,13.5" />
        <polygon points="22,12 17.5,10.5 17.5,13.5" />
        <polygon points="4.8,4.8 8.5,7 7,8.5" />
        <polygon points="19.2,4.8 17,8.5 15.5,7" />
        <polygon points="4.8,19.2 7,15.5 8.5,17" />
        <polygon points="19.2,19.2 15.5,17 17,15.5" />
      </g>
    )}
  </svg>
);

/**
 * Engraved Kingdom Coat-of-Arms Shield SVG
 */
export const HeraldicBannerShieldSvg: React.FC<{
  primaryColor: string;
  secondaryColor: string;
  pattern: BannerPatternKind;
  className?: string;
}> = ({ primaryColor, secondaryColor, pattern, className = 'w-7 h-8' }) => (
  <svg
    viewBox="0 0 36 40"
    className={`pointer-events-none select-none shrink-0 ${className}`}
    aria-hidden="true"
  >
    <path
      d="M3,3 L33,3 L33,18 Q33,32 18,38 Q3,32 3,18 Z"
      fill={primaryColor}
      stroke={secondaryColor}
      strokeWidth="2.8"
    />
    <path
      d="M5.5,5.5 L30.5,5.5 L30.5,17.5 Q30.5,29 18,34.5 Q5.5,29 5.5,17.5 Z"
      fill="none"
      stroke="#1a1107"
      strokeWidth="1"
    />
    <g transform="translate(8, 7) scale(0.83)">
      {pattern === 'crescent_star' && (
        <g fill={secondaryColor}>
          <path d="M13.5,4.5 A7.5,7.5 0 1,0 13.5,19.5 A6,6 0 1,1 13.5,4.5 Z" />
          <polygon points="16.5,9 17.4,11 19.5,11.2 17.9,12.5 18.4,14.5 16.5,13.4 14.6,14.5 15.1,12.5 13.5,11.2 15.6,11" />
        </g>
      )}
      {pattern === 'crossed_swords' && (
        <g stroke={secondaryColor} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <line x1="5" y1="19" x2="19" y2="5" />
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="4.5" y1="14.5" x2="9.5" y2="19.5" />
          <line x1="14.5" y1="19.5" x2="19.5" y2="14.5" />
        </g>
      )}
      {pattern === 'crusader_cross' && (
        <polygon
          fill={secondaryColor}
          points="10,3 14,3 13,10 21,9 21,15 13,14 14,21 10,21 11,14 3,15 3,9 11,10"
        />
      )}
      {pattern === 'royal_lion' && (
        <g fill={secondaryColor}>
          <polygon points="4,9 7,4 12,8 17,4 20,9 18,16 6,16" />
          <rect x="6" y="17" width="12" height="2.5" rx="0.5" />
        </g>
      )}
      {pattern === 'nordic_raven' && (
        <polygon
          fill={secondaryColor}
          points="12,3 14,8 22,6 17,13 20,18 12,15 4,18 7,13 2,6 10,8"
        />
      )}
      {pattern === 'imperial_sun' && (
        <g fill={secondaryColor}>
          <circle cx="12" cy="12" r="4.5" />
          <polygon points="12,2 13.5,6.5 10.5,6.5" />
          <polygon points="12,22 13.5,17.5 10.5,17.5" />
          <polygon points="2,12 6.5,10.5 6.5,13.5" />
          <polygon points="22,12 17.5,10.5 17.5,13.5" />
        </g>
      )}
    </g>
  </svg>
);

export const TacticalMinimapSvg: React.FC<{
  resourceNodes: Record<string, ResourceNode>;
  structures: Record<string, BlockoutStructure>;
  units?: Record<string, BlockoutUnit>;
  players: PlayerState[];
  myPlayerId: string | null;
  climate?: ClimateKind;
  onJumpToWorld: (worldX: number, worldZ: number) => void;
  className?: string;
}> = ({
  resourceNodes,
  structures,
  units,
  players,
  myPlayerId,
  climate = 'temperate_clear',
  onJumpToWorld,
  className = 'w-full h-full',
}) => {
  const maskUid = useId().replace(/:/g, '');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const myPlayer = useMemo(
    () => players.find((p) => p.id === myPlayerId),
    [players, myPlayerId]
  );

  const curZoom = myPlayer?.camera?.zoom ?? 38;
  const radarSpan = useMemo(
    () =>
      curZoom > 200
        ? Math.min(4800, Math.max(2000, Math.round(curZoom * 5.4)))
        : 2000,
    [curZoom]
  );
  const radarHalf = radarSpan / 2;

  // Quantize radar anchor to 128m steps so the radar raster refreshes smoothly without flickering
  const anchorX = Math.round((myPlayer?.camera?.targetX ?? 4800) / 128) * 128;
  const anchorZ = Math.round((myPlayer?.camera?.targetZ ?? 3200) / 128) * 128;

  // Friendly vision circles within/overlapping the local radar window
  const friendlyObservers = useMemo(() => {
    const obs: Array<{ x: number; z: number; r: number; kind: string }> = [];
    Object.values(structures).forEach((s) => {
      if (s.ownerId !== myPlayerId) return;
      const r = getStructureVisionRadius(s.kind, s.level, climate);
      if (
        Math.abs(s.x - anchorX) <= radarHalf + r &&
        Math.abs(s.z - anchorZ) <= radarHalf + r
      ) {
        obs.push({ x: s.x, z: s.z, r, kind: s.kind });
      }
    });
    if (units) {
      Object.values(units).forEach((u) => {
        if (u.ownerId !== myPlayerId) return;
        const r = getUnitVisionRadius(u.kind, climate);
        if (
          Math.abs(u.x - anchorX) <= radarHalf + r &&
          Math.abs(u.z - anchorZ) <= radarHalf + r
        ) {
          obs.push({ x: u.x, z: u.z, r, kind: u.kind });
        }
      });
    }
    return obs;
  }, [structures, units, myPlayerId, climate, anchorX, anchorZ, radarHalf]);

  const isInFriendlySight = (wx: number, wz: number) => {
    for (let i = 0; i < friendlyObservers.length; i++) {
      const o = friendlyObservers[i];
      const dx = wx - o.x;
      const dz = wz - o.z;
      if (dx * dx + dz * dz <= o.r * o.r) return true;
    }
    return false;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const res = 128;
    const stepM = radarSpan / res;
    const img = ctx.createImageData(res, res);
    const data = img.data;

    for (let py = 0; py < res; py++) {
      const wz = anchorZ - radarHalf + ((py + 0.5) / res) * radarSpan;
      for (let px = 0; px < res; px++) {
        const wx = anchorX - radarHalf + ((px + 0.5) / res) * radarSpan;
        const h = getTerrainHeight(wx, wz);
        const idx = (py * res + px) * 4;

        let r = 60;
        let g = 114;
        let b = 49;

        if (h < WATER_LEVEL_Y - 0.5) {
          r = 9;
          g = 36;
          b = 64;
        } else if (h < WATER_LEVEL_Y + 0.04) {
          r = 14;
          g = 116;
          b = 144;
        } else if (Math.abs(h - WATER_LEVEL_Y) < 0.08) {
          r = 14;
          g = 46;
          b = 68;
        } else if (h < 0.45) {
          r = 212;
          g = 176;
          b = 112;
        } else if (getRoadDistance(wx, wz) < 34) {
          r = 178;
          g = 136;
          b = 88;
        } else {
          const biome = getBiomeAt(wx, wz);
          const snowLine = getSnowlineElevationAt(wx, wz);
          if (biome === 'northern_peaks') {
            if (h > snowLine) {
              r = 226;
              g = 232;
              b = 240;
            } else {
              r = 100;
              g = 116;
              b = 139;
            }
          } else if (biome === 'southern_dunes') {
            r = 200;
            g = 148;
            b = 72;
          } else if (biome === 'western_forest') {
            r = 31;
            g = 84;
            b = 52;
          } else if (biome === 'eastern_basalt') {
            r = 98;
            g = 75;
            b = 70;
          } else if (biome === 'river_basin' || biome === 'waterfall_gorge') {
            r = 38;
            g = 132;
            b = 86;
          }
        }

        // Directional terrain relief hillshade
        const hx = getTerrainHeight(wx + stepM, wz);
        const hz = getTerrainHeight(wx, wz + stepM);
        const slopeShade = h >= WATER_LEVEL_Y ? Math.max(-24, Math.min(28, Math.round(((h - hx) + (h - hz)) * 8.5))) : 0;
        const elevLift = h > 1.5 ? Math.min(20, Math.round((h - 1.5) * 2.6)) : 0;
        const shade = slopeShade + elevLift;

        data[idx] = Math.max(0, Math.min(255, r + shade));
        data[idx + 1] = Math.max(0, Math.min(255, g + shade));
        data[idx + 2] = Math.max(0, Math.min(255, b + shade));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
  }, [anchorX, anchorZ, radarSpan, radarHalf]);

  const handleRadarClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const nz = (e.clientY - rect.top) / Math.max(1, rect.height);
    const worldX = Math.round(anchorX - radarHalf + nx * radarSpan);
    const worldZ = Math.round(anchorZ - radarHalf + nz * radarSpan);
    onJumpToWorld(worldX, worldZ);
  };

  const minX = anchorX - radarHalf;
  const minZ = anchorZ - radarHalf;
  const iconScale = Math.max(1, radarSpan / 2000);
  const shroudMaskId = `radar-shroud-mask-${maskUid}`;

  return (
    <div className={`relative overflow-hidden select-none bg-[#091f33] ${className}`}>
      <canvas
        ref={canvasRef}
        width={128}
        height={128}
        className="w-full h-full block"
      />
      <svg
        viewBox={`${minX} ${minZ} ${radarSpan} ${radarSpan}`}
        onClick={handleRadarClick}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      >
        <defs>
          <mask id={shroudMaskId}>
            <rect x={minX} y={minZ} width={radarSpan} height={radarSpan} fill="white" />
            {friendlyObservers.map((o, idx) => (
              <circle key={idx} cx={o.x} cy={o.z} r={o.r} fill="black" />
            ))}
          </mask>
        </defs>

        {/* RESOURCE NODES WITHIN LOCAL RADAR */}
        {Object.values(resourceNodes).map((r) => {
          if (Math.abs(r.x - anchorX) > radarHalf || Math.abs(r.z - anchorZ) > radarHalf) {
            return null;
          }
          const visible = isInFriendlySight(r.x, r.z);
          return (
            <circle
              key={r.id}
              cx={r.x}
              cy={r.z}
              r={14 * iconScale}
              fill={
                r.kind === 'gold'
                  ? '#facc15'
                  : r.kind === 'stone'
                    ? '#cbd5e1'
                    : r.kind === 'wood'
                      ? '#4ade80'
                      : r.kind === 'horses'
                        ? '#fb923c'
                        : r.kind === 'cloth'
                          ? '#e879f9'
                          : '#34d399'
              }
              opacity={visible ? '0.92' : '0.32'}
            />
          );
        })}

        {/* AMONG-US TWILIGHT SHROUD OVER UNSEEN TERRAIN */}
        <rect
          x={minX}
          y={minZ}
          width={radarSpan}
          height={radarSpan}
          fill="#040812"
          fillOpacity="0.62"
          mask={`url(#${shroudMaskId})`}
          pointerEvents="none"
        />

        {/* CRISP SIGHT PERIMETER RINGS FOR WATCHTOWERS & KEEPS */}
        {friendlyObservers.map((o, idx) => {
          if (o.kind !== 'watchtower' && o.kind !== 'keep') return null;
          return (
            <circle
              key={`ring-${idx}`}
              cx={o.x}
              cy={o.z}
              r={o.r}
              fill="none"
              stroke="#38bdf8"
              strokeOpacity="0.4"
              strokeWidth={6 * iconScale}
              strokeDasharray={`${16 * iconScale} ${12 * iconScale}`}
              pointerEvents="none"
            />
          );
        })}

        {/* STRUCTURES (own always shown; enemies only inside friendly sight!) */}
        {Object.values(structures).map((s) => {
          if (Math.abs(s.x - anchorX) > radarHalf || Math.abs(s.z - anchorZ) > radarHalf) {
            return null;
          }
          if (s.ownerId !== myPlayerId && !isInFriendlySight(s.x, s.z)) {
            return null;
          }
          const size = 44 * iconScale;
          return (
            <rect
              key={s.id}
              x={s.x - size / 2}
              y={s.z - size / 2}
              width={size}
              height={size}
              fill={s.ownerColor}
              stroke="#ffffff"
              strokeWidth={6 * iconScale}
            />
          );
        })}

        {/* UNITS (own always shown; enemies strictly inside friendly sight!) */}
        {units &&
          Object.values(units).map((u) => {
            if (Math.abs(u.x - anchorX) > radarHalf || Math.abs(u.z - anchorZ) > radarHalf) {
              return null;
            }
            if (u.ownerId !== myPlayerId && !isInFriendlySight(u.x, u.z)) {
              return null;
            }
            return (
              <circle
                key={u.id}
                cx={u.x}
                cy={u.z}
                r={13 * iconScale}
                fill={u.ownerColor}
                stroke="#090603"
                strokeWidth={3 * iconScale}
              />
            );
          })}

        {/* CAMERA VIEWPORT RETICLES (remote players hidden outside sight) */}
        {players.map((p) => {
          const isMe = p.id === myPlayerId;
          if (!p.camera) return null;
          if (
            Math.abs(p.camera.targetX - anchorX) > radarHalf ||
            Math.abs(p.camera.targetZ - anchorZ) > radarHalf
          ) {
            return null;
          }
          if (!isMe && !isInFriendlySight(p.camera.targetX, p.camera.targetZ)) {
            return null;
          }
          const boxW = Math.max(90, Math.min(1800, (p.camera.zoom ?? 40) * 2.4));
          const boxH = Math.round(boxW * 0.65);
          return isMe ? (
            <rect
              key={p.id}
              x={p.camera.targetX - boxW / 2}
              y={p.camera.targetZ - boxH / 2}
              width={boxW}
              height={boxH}
              fill="none"
              stroke="#fff7d6"
              strokeWidth={12 * iconScale}
            />
          ) : (
            <circle
              key={p.id}
              cx={p.camera.targetX}
              cy={p.camera.targetZ}
              r={34 * iconScale}
              fill="none"
              stroke={p.color}
              strokeWidth={10 * iconScale}
            />
          );
        })}

        {/* Compass markers */}
        <text
          x={anchorX}
          y={minZ + 110 * iconScale}
          textAnchor="middle"
          fill="#fde047"
          fontSize={95 * iconScale}
          fontWeight="bold"
        >
          ش
        </text>
      </svg>
    </div>
  );
};
