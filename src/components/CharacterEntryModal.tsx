import React, { useState } from 'react';
import { Crown, Shield, Skull, Swords } from 'lucide-react';
import {
  BANNER_PATTERN_SPECS,
  BannerPatternKind,
  CULTURE_SPECS,
  CultureKind,
  FACTION_PRIMARY_SWATCHES,
  FACTION_SECONDARY_SWATCHES,
  SeasonState,
} from '../shared/protocol';
import { HeraldicBannerShieldSvg } from './Retro2000sIcons';

interface CharacterEntryModalProps {
  season?: SeasonState;
  defaultName: string;
  defaultPrimaryColor: string;
  defaultSecondaryColor: string;
  defaultBannerPattern: BannerPatternKind;
  defaultCulture: CultureKind;
  sultanHassanClaimable: boolean;
  isPermadeathRebirth?: boolean;
  fallenInfo?: { fallenNameAr: string; killerNameAr: string; reasonAr: string } | null;
  onConfirm: (payload: {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    bannerPattern: BannerPatternKind;
    culture: CultureKind;
    startMode: 'independent' | 'sultan_hassan';
  }) => void;
}

export const CharacterEntryModal: React.FC<CharacterEntryModalProps> = ({
  season,
  defaultName,
  defaultPrimaryColor,
  defaultSecondaryColor,
  defaultBannerPattern,
  defaultCulture,
  sultanHassanClaimable,
  isPermadeathRebirth = false,
  fallenInfo,
  onConfirm,
}) => {
  const [name, setName] = useState(
    isPermadeathRebirth ? '' : defaultName || 'أمير ثار أحمد'
  );
  const [primaryColor, setPrimaryColor] = useState(defaultPrimaryColor || '#0d9488');
  const [secondaryColor, setSecondaryColor] = useState(defaultSecondaryColor || '#fbbf24');
  const [bannerPattern, setBannerPattern] = useState<BannerPatternKind>(
    defaultBannerPattern || 'crescent_star'
  );
  const [culture, setCulture] = useState<CultureKind>(defaultCulture || 'iraqi_mesopotamian');
  const [startMode, setStartMode] = useState<'independent' | 'sultan_hassan'>('independent');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim() || 'أمير ثار أحمد';
    onConfirm({
      name: cleanName,
      primaryColor,
      secondaryColor,
      bannerPattern,
      culture,
      startMode: sultanHassanClaimable ? startMode : 'independent',
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="إنشاء شخصية القائد ودخول الموسم"
      dir="rtl"
      className="pointer-events-auto fixed inset-0 z-50 bg-black/82 backdrop-blur-[2px] flex items-center justify-center p-3 overflow-y-auto"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rts2k-stone-frame p-4 sm:p-5 text-[#f3e5c8] space-y-3.5 shadow-2xl my-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#7d5929]/70 pb-3">
          <div className="flex items-center gap-2.5">
            {isPermadeathRebirth ? (
              <Skull className="w-7 h-7 text-[#f87171] shrink-0" />
            ) : (
              <Crown className="w-7 h-7 text-[#fbbf24] shrink-0" />
            )}
            <div>
              <div className="text-[10px] font-bold text-[#fde68a]">
                {season?.seasonNameAr ?? 'الموسم الأول — عالم أونلاين مستمر'}
              </div>
              <h1 className="font-chronicle text-lg sm:text-xl font-bold text-[#ffebb0]">
                {isPermadeathRebirth
                  ? `سقط ${fallenInfo?.fallenNameAr ?? 'قائدك'} — أنشئ شخصية جديدة`
                  : 'ثار أحمد — أنشئ شخصية قائدك'}
              </h1>
            </div>
          </div>
          <HeraldicBannerShieldSvg
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            pattern={bannerPattern}
            className="w-10 h-12 shrink-0"
          />
        </div>

        {/* Permadeath notice if applicable */}
        {isPermadeathRebirth && fallenInfo && (
          <div className="p-2.5 bg-[#450a0a]/80 border border-[#dc2626]/70 text-[11px] text-[#fecaca] leading-relaxed">
            <span className="font-bold text-[#fca5a5]">نهاية القائد السابق: </span>
            {fallenInfo.reasonAr}
          </div>
        )}

        {/* Concise 3-bullet MMO rules briefing */}
        <div className="rts2k-parchment p-2.5 text-[#241609] text-[10.5px] sm:text-[11px] space-y-1 leading-snug">
          <div className="font-bold flex items-center gap-1.5 text-[#451a03]">
            <Swords className="w-3.5 h-3.5 text-[#9a3412] shrink-0" />
            <span>كيف تلعب وتتطور في الموسم؟</span>
          </div>
          <ul className="list-disc pr-4 space-y-0.5 font-medium">
            <li>
              <strong>شخصيتك على الخريطة:</strong> قائدك يحرس معقلك تلقائياً ولا يحتاج تحكماً دائماً؛ إن سقط معقلك يمكنه <strong>الهرب وتأسيس ثورة</strong>، أما إن قُتل القائد نفسه فموته دائم وتبدأ بشخصية جديدة.
            </li>
            <li>
              <strong>التدرّج والرتب:</strong> تبدأ برتبة <strong>قائد ناشئ</strong> بـ 5 مبانٍ أساسية؛ طوّر اقتصادك وسيطر على <strong>مصادر الموارد والمدن</strong> برفع الراية (6ث) لترتقي إلى <em>أمير ثغر ← والي ← سلطان</em>.
            </li>
          </ul>
        </div>

        {/* Character Name */}
        <div className="space-y-1">
          <label htmlFor="char-name-input" className="block text-xs font-bold text-[#ffebb0]">
            اسم القائد والإمارة
          </label>
          <input
            id="char-name-input"
            type="text"
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: أحمد بن سيف، طارق الحصني..."
            className="w-full h-9 px-3 rts2k-ink-well text-sm font-bold text-[#ffebb0] placeholder:text-[#9c8462] focus:outline-none focus:border-[#fbbf24]"
          />
        </div>

        {/* Starting Path (Independent vs Sultan Hassan if claimable) */}
        {sultanHassanClaimable && (
          <div className="space-y-1">
            <div className="text-xs font-bold text-[#ffebb0]">مسار البداية</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStartMode('independent')}
                className={`p-2 text-right text-[11px] font-bold cursor-pointer ${
                  startMode === 'independent'
                    ? 'rts2k-bevel-btn-gold'
                    : 'rts2k-bevel-btn text-[#d6c3a5]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span>أمير مستقل (رتبة 1)</span>
                </div>
                <div className="text-[9.5px] opacity-80 font-normal mt-0.5">
                  مستوطنة ناشئة + قائدك الميداني
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStartMode('sultan_hassan')}
                className={`p-2 text-right text-[11px] font-bold cursor-pointer ${
                  startMode === 'sultan_hassan'
                    ? 'rts2k-bevel-btn-gold'
                    : 'rts2k-bevel-btn text-[#fde68a]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5 shrink-0" />
                  <span>السلطان حسن (مرقاب)</span>
                </div>
                <div className="text-[9.5px] opacity-80 font-normal mt-0.5">
                  تولّي عاصمة الدولة السندية
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Culture Selection */}
        <div className="space-y-1">
          <div className="text-xs font-bold text-[#ffebb0]">الطراز المعماري</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(Object.keys(CULTURE_SPECS) as CultureKind[]).map((cKey) => (
              <button
                key={cKey}
                type="button"
                onClick={() => setCulture(cKey)}
                className={`h-8 px-2 text-[11px] font-bold cursor-pointer ${
                  culture === cKey ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#d6c3a5]'
                }`}
              >
                {CULTURE_SPECS[cKey].shortAr}
              </button>
            ))}
          </div>
        </div>

        {/* Banner Colors & Pattern */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-[#d6c3a5]">لون الراية الأساسي</div>
            <div className="flex flex-wrap gap-1.5">
              {FACTION_PRIMARY_SWATCHES.slice(0, 6).map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  title={sw.nameAr}
                  onClick={() => setPrimaryColor(sw.hex)}
                  className={`w-6 h-6 border-2 cursor-pointer ${
                    primaryColor === sw.hex ? 'border-[#ffebb0] scale-110' : 'border-black/70'
                  }`}
                  style={{ backgroundColor: sw.hex }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-[#d6c3a5]">لون الشعار</div>
            <div className="flex flex-wrap gap-1.5">
              {FACTION_SECONDARY_SWATCHES.slice(0, 6).map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  title={sw.nameAr}
                  onClick={() => setSecondaryColor(sw.hex)}
                  className={`w-6 h-6 border-2 cursor-pointer ${
                    secondaryColor === sw.hex ? 'border-[#ffebb0] scale-110' : 'border-black/70'
                  }`}
                  style={{ backgroundColor: sw.hex }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(BANNER_PATTERN_SPECS) as BannerPatternKind[]).slice(0, 5).map((pat) => (
            <button
              key={pat}
              type="button"
              onClick={() => setBannerPattern(pat)}
              className={`h-6 px-2 text-[10px] font-bold cursor-pointer ${
                bannerPattern === pat ? 'rts2k-bevel-btn-gold' : 'rts2k-bevel-btn text-[#c8b28e]'
              }`}
            >
              {BANNER_PATTERN_SPECS[pat].nameAr.split(' ')[0]}
            </button>
          ))}
        </div>

        <button
          type="submit"
          className="w-full h-10 rts2k-bevel-btn-emerald text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
        >
          <Swords className="w-4 h-4 shrink-0" />
          <span>
            {isPermadeathRebirth ? 'انطلق بشخصية جديدة في الموسم' : 'دخول العالم ورفع الراية'}
          </span>
        </button>
      </form>
    </div>
  );
};
