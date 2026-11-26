import React, { useMemo, useState } from 'react';
import {
  Compass,
  Flag,
  Navigation,
  RotateCcw,
  Route,
  Send,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BlockoutStructure,
  BlockoutUnit,
  MarchWaypoint,
  PlayerState,
  UNIT_SPECS,
} from '../shared/protocol';
import {
  calculateMarchRouteStats,
  ClimateKind,
  formatDurationAr,
  formatWorldCoordKm,
  WORLD_MAP_SIZE,
} from '../shared/worldMap';
import {
  ProceduralStrategicMap,
  StrategicMapFlyToCommand,
} from './ProceduralStrategicMap';

interface ContinentalAtlasCanvasProps {
  structures: Record<string, BlockoutStructure>;
  units: Record<string, BlockoutUnit>;
  players: PlayerState[];
  myPlayerId: string | null;
  selectedUnitIds: string[];
  activeClimate: ClimateKind;
  onJumpToWorld: (worldX: number, worldZ: number) => void;
  onDispatchMarch: (unitIds: string[], waypoints: MarchWaypoint[]) => void;
}

export const ContinentalAtlasCanvas: React.FC<ContinentalAtlasCanvasProps> = ({
  structures,
  units,
  players,
  myPlayerId,
  selectedUnitIds,
  activeClimate,
  onJumpToWorld,
  onDispatchMarch,
}) => {
  const myUnits = useMemo(
    () => Object.values(units).filter((u) => u.ownerId === myPlayerId),
    [units, myPlayerId]
  );

  // Selected units for Atlas expedition (defaults to currently selected units, or all mobile military units)
  const dispatchUnitIds = useMemo(() => {
    if (selectedUnitIds.length > 0) return selectedUnitIds;
    return myUnits.filter((u) => u.kind !== 'worker').map((u) => u.id);
  }, [selectedUnitIds, myUnits]);

  const leadDispatchUnit = useMemo(
    () => myUnits.find((u) => dispatchUnitIds.includes(u.id)) ?? myUnits[0] ?? null,
    [myUnits, dispatchUnitIds]
  );

  const [atlasMode, setAtlasMode] = useState<'jump' | 'march'>('jump');
  const [viewCenter, setViewCenter] = useState<{ x: number; z: number }>({ x: 0, z: 2000 });
  const [viewSpanM, setViewSpanM] = useState<number>(WORLD_MAP_SIZE);
  const [flyToCmd, setFlyToCmd] = useState<StrategicMapFlyToCommand | null>(null);
  const [waypoints, setWaypoints] = useState<MarchWaypoint[]>([]);

  const marchStats = useMemo(() => {
    if (!leadDispatchUnit || waypoints.length === 0) return null;
    const baseSpeed = UNIT_SPECS[leadDispatchUnit.kind]?.speed ?? leadDispatchUnit.speed;
    return calculateMarchRouteStats(
      leadDispatchUnit.x,
      leadDispatchUnit.z,
      waypoints,
      baseSpeed,
      leadDispatchUnit.kind,
      activeClimate
    );
  }, [leadDispatchUnit, waypoints, activeClimate]);

  const handleZoom = (factor: number) => {
    const nextSpan = Math.max(850, Math.min(130_000, Math.round(viewSpanM * factor)));
    setFlyToCmd({ x: viewCenter.x, z: viewCenter.z, spanM: nextSpan, nonce: Date.now() + Math.random() });
  };

  return (
    <div className="space-y-2">
      {/* Top Toolbar: Mode Switch + Smooth GPU Zoom Controls */}
      <div className="flex flex-nowrap items-center justify-between gap-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setAtlasMode('jump')}
            className={`h-6 sm:h-7 px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
              atlasMode === 'jump' ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn'
            }`}
          >
            <Compass className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="sm:hidden">استكشاف</span>
            <span className="hidden sm:inline">استكشاف وانتقال</span>
          </button>
          <button
            type="button"
            onClick={() => setAtlasMode('march')}
            className={`h-6 sm:h-7 px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
              atlasMode === 'march' ? 'rts2k-bevel-btn-emerald' : 'rts2k-bevel-btn'
            }`}
          >
            <Route className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="sm:hidden">مسير ({dispatchUnitIds.length})</span>
            <span className="hidden sm:inline">رسم مسار مسير ({dispatchUnitIds.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleZoom(0.55)}
            title="تقريب الخريطة"
            className="w-6 h-6 sm:w-7 sm:h-7 rts2k-bevel-btn flex items-center justify-center cursor-pointer"
          >
            <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.8)}
            title="تبعيد الخريطة"
            className="w-6 h-6 sm:w-7 sm:h-7 rts2k-bevel-btn flex items-center justify-center cursor-pointer"
          >
            <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setFlyToCmd({ x: 0, z: 2000, spanM: WORLD_MAP_SIZE, nonce: Date.now() + Math.random() });
            }}
            title="عرض المسرح كاملاً 100 × 100 كم"
            className="h-6 sm:h-7 px-1.5 sm:px-2 rts2k-bevel-btn text-[9.5px] sm:text-[10px] font-mono tabular-nums flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
            <span>
              {viewSpanM >= 2000
                ? `${Math.round(viewSpanM / 1000)} كم`
                : `${(viewSpanM / 1000).toFixed(1)} كم`}
            </span>
          </button>
        </div>
      </div>

      {/* High-Resolution Cached-Texture WebGL2 Atlas */}
      <div className="relative w-full h-[240px] sm:h-[340px] mx-auto overflow-hidden border-2 border-[#9e7634] bg-[#162735]">
        <ProceduralStrategicMap
          structures={structures}
          units={units}
          players={players}
          myPlayerId={myPlayerId}
          activeClimate={activeClimate}
          viewCenter={viewCenter}
          viewSpanM={viewSpanM}
          onChangeView={(nextCenter, nextSpanM) => {
            setViewCenter(nextCenter);
            setViewSpanM(nextSpanM);
          }}
          mode={atlasMode}
          waypoints={waypoints}
          leadDispatchUnit={leadDispatchUnit}
          minSpanM={850}
          maxSpanM={130_000}
          flyToCommand={flyToCmd}
          showInternalTelemetry={true}
          onClickWorld={(wx, wz) => {
            if (atlasMode === 'march') {
              setWaypoints((prev) => [...prev.slice(-7), { x: wx, z: wz }]);
            }
          }}
          onRightClickWorld={(wx, wz) => {
            setAtlasMode('march');
            setWaypoints((prev) => [...prev.slice(-7), { x: wx, z: wz }]);
          }}
          onDoubleClickWorld={(wx, wz) => {
            onJumpToWorld(wx, wz);
          }}
        />
      </div>

      {/* Long-Distance Waypoint Route Summary & Dispatch Bar */}
      {atlasMode === 'march' && (
        <div className="p-2 rts2k-parchment flex flex-col gap-1.5 text-[#241609]">
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold">
            <span className="flex items-center gap-1">
              <Flag className="w-3.5 h-3.5 text-[#7c2d12]" />
              {waypoints.length === 0
                ? 'انقر على الخريطة لإضافة نقاط مسار الحملة'
                : `نقاط المسار: ${waypoints.length} محطة`}
            </span>
            {marchStats && (
              <span className="font-mono text-[10.5px] text-[#14532d]">
                المسافة: {formatWorldCoordKm(marchStats.totalDistanceM)} · الوصول المتوقع:{' '}
                {formatDurationAr(marchStats.estimatedSeconds)}
              </span>
            )}
          </div>

          {marchStats && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#3f2912]">
              <span>متوسط السرعة: {marchStats.avgSpeedMps} م/ث</span>
              {marchStats.usesHighway && (
                <span className="text-[#065f46] font-bold">· طريق القوافل (+45%)</span>
              )}
              {marchStats.passesThroughMountains && (
                <span className="text-[#7c2d12] font-bold">· ممرات جبلية وعرة</span>
              )}
              {marchStats.passesThroughDesert && (
                <span className="text-[#92400e] font-bold">· صحراء الكثبان</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-1.5">
            {waypoints.length > 0 && (
              <button
                type="button"
                onClick={() => setWaypoints([])}
                className="h-7 px-2 rts2k-bevel-btn-crimson text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>مسح</span>
              </button>
            )}
            <button
              type="button"
              disabled={waypoints.length === 0 || dispatchUnitIds.length === 0}
              onClick={() => {
                onDispatchMarch(dispatchUnitIds, waypoints);
                setWaypoints([]);
              }}
              className="h-7 px-3 rts2k-bevel-btn-emerald disabled:opacity-45 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>انطلاق الحملة ({dispatchUnitIds.length} وحدة)</span>
            </button>
          </div>
        </div>
      )}

      {atlasMode === 'jump' && (
        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-[#c8b28e] px-1">
          <span className="flex items-center gap-1">
            <Navigation className="w-3 h-3 text-[#d4a656]" />
            <span>خريطة إجرائية فائقة الدقة: اسحب للتحريك، وقرب بالعجلة أو اللمس من 130 كم حتى 850 م</span>
          </span>
        </div>
      )}
    </div>
  );
};
