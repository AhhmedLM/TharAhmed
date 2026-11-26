import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Crown,
  Flag,
  Landmark,
  UserCheck,
} from 'lucide-react';
import {
  BlockoutUnit,
  CharacterStatus,
  CommanderRankReport,
  SeasonState,
} from '../shared/protocol';

interface RankProgressionWidgetProps {
  season?: SeasonState;
  rankReport: CommanderRankReport;
  characterStatus: CharacterStatus;
  heroUnit: BlockoutUnit | null;
  onFocusHero: () => void;
  onJumpNearestNeutralNode: () => void;
  onFoundExileKeep: () => void;
}

export const RankProgressionWidget: React.FC<RankProgressionWidgetProps> = ({
  season,
  rankReport,
  characterStatus,
  heroUnit,
  onFocusHero,
  onJumpNearestNeutralNode,
  onFoundExileKeep,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const heroHpPct = heroUnit
    ? Math.max(0, Math.min(100, Math.round((heroUnit.hp / Math.max(1, heroUnit.maxHp)) * 100)))
    : 0;

  return (
    <aside
      aria-label="مسار الرتبة والقائد"
      className="pointer-events-auto fixed top-[40px] sm:top-[44px] right-2 z-[17] w-[228px] sm:w-[258px] bg-[#16100a]/92 border border-[#9c7333]/90 shadow-xl text-[#f3e5c8]"
    >
      {/* Compact Header */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full px-2.5 py-1.5 flex items-center justify-between gap-1.5 border-b border-[#6b4d22]/60 cursor-pointer hover:bg-[#241a10]/80 transition"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Crown
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: rankReport.spec.badgeColor }}
          />
          <span className="font-chronicle text-[11px] font-bold text-[#ffebb0] truncate">
            {rankReport.spec.titleAr}
          </span>
          <span className="text-[9px] font-mono text-[#c8b28e] shrink-0">
            · م{season?.seasonNumber ?? 1}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#d4a656] shrink-0" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-[#d4a656] shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="p-2 space-y-2 text-[10px]">
          {/* Hero Character Live Status */}
          {heroUnit && (
            <div className="flex items-center justify-between gap-1.5 bg-[#0f0b07]/80 border border-[#5c4223]/60 px-2 py-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#fde68a] truncate">
                  <UserCheck className="w-3 h-3 text-[#fbbf24] shrink-0" />
                  <span className="truncate">{heroUnit.displayNameAr || 'قائدك'}</span>
                </div>
                <div className="w-full h-1 bg-[#291b0e] mt-1 overflow-hidden">
                  <div
                    className={`h-full ${heroHpPct > 45 ? 'bg-[#65a30d]' : 'bg-[#dc2626]'}`}
                    style={{ width: `${heroHpPct}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={onFocusHero}
                title="تحديد القائد والانتقال إليه"
                className="h-6 px-1.5 rts2k-bevel-btn text-[9.5px] font-bold text-[#ffebb0] shrink-0 cursor-pointer"
              >
                القائد
              </button>
            </div>
          )}

          {/* Exile Fleeing Urgent Rebellion Action */}
          {characterStatus === 'exile_fleeing' && (
            <div className="p-2 bg-[#451a03]/90 border border-[#f59e0b] space-y-1.5">
              <div className="text-[10px] font-bold text-[#fde68a]">
                سقط معقلك لكن قائدك نجا! اهرب به لمكان آمن وأسّس معقلاً جديداً:
              </div>
              <button
                type="button"
                onClick={onFoundExileKeep}
                className="w-full h-7 rts2k-bevel-btn-gold text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Landmark className="w-3.5 h-3.5 shrink-0" />
                <span>تأسيس معقل جديد / ثورة هنا</span>
              </button>
            </div>
          )}

          {/* Next Rank Requirements (Dual: Economy + Field/Capture) */}
          {rankReport.nextSpec ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[9.5px] font-bold text-[#d4a656]">
                <span>للترقية إلى «{rankReport.nextSpec.titleAr}»:</span>
                <span className="font-mono text-[#a3e635]">
                  +{rankReport.nextSpec.unlockedStructures.length} مبانٍ
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-start gap-1.5">
                  {rankReport.economyDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#84cc16] shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-[#a88b5e] shrink-0 mt-0.5" />
                  )}
                  <span className={rankReport.economyDone ? 'text-[#bef264]' : 'text-[#e7d7bc]'}>
                    {rankReport.economyProgressAr}
                  </span>
                </div>

                <div className="flex items-start gap-1.5">
                  {rankReport.fieldDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#84cc16] shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-[#a88b5e] shrink-0 mt-0.5" />
                  )}
                  <span className={rankReport.fieldDone ? 'text-[#bef264]' : 'text-[#e7d7bc]'}>
                    {rankReport.fieldProgressAr}
                  </span>
                </div>
              </div>

              {!rankReport.fieldDone && (
                <button
                  type="button"
                  onClick={onJumpNearestNeutralNode}
                  className="w-full h-6.5 px-2 rts2k-bevel-btn-emerald text-[9.5px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Flag className="w-3 h-3 shrink-0" />
                  <span>انتقل لأقرب مصدر موارد للسيطرة</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1 text-[9.5px] text-[#fde68a]">
              <span className="flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>المصادر: {rankReport.capturedNodesCount} · المدن: {rankReport.capturedCitiesCount}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
