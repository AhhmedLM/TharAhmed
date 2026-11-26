import React, { useCallback, useEffect, useState } from 'react';
import { Crown, Shield, Swords, Users, X, RotateCcw, KeyRound } from 'lucide-react';
import type { PveDifficulty, PvpMode, SultanHassanMode, WorldDirectorConfig } from '../shared/protocol';

interface AdminPlayerInfo {
  id: string;
  uid: string | null;
  name: string;
  factionName: string;
  isSultanHassan: boolean;
  isDefeated: boolean;
  connected: boolean;
  keepsCount: number;
  structuresCount: number;
  unitsCount: number;
}

interface AdminCityInfo {
  id: string;
  nameAr: string;
  factionKind: string;
  enabled: boolean;
  active: boolean;
  structuresCount: number;
  unitsCount: number;
}

interface AdminWorldResponse {
  directorConfig: WorldDirectorConfig;
  humanPlayers: AdminPlayerInfo[];
  cities: AdminCityInfo[];
  activeBanditCamps: number;
  tick: number;
}

interface AdminDirectorModalProps {
  onClose: () => void;
}

const ADMIN_KEY_STORAGE = 'thar_ahmed_admin_key_v1';

export const AdminDirectorModal: React.FC<AdminDirectorModalProps> = ({ onClose }) => {
  const [adminKey, setAdminKey] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
    } catch {
      return '';
    }
  });
  const [data, setData] = useState<AdminWorldResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminKey.trim()) h['X-Admin-Key'] = adminKey.trim();
    return h;
  }, [adminKey]);

  const fetchAdminWorld = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/world', { headers: authHeaders() });
      if (!res.ok) {
        const text = res.status === 401 || res.status === 403
          ? 'مطلوب مفتاح المشرف (X-Admin-Key) أو صلاحية الإدارة للوصول'
          : `فشل تحميل لوحة التحكم (HTTP ${res.status})`;
        setErrorMsg(text);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as AdminWorldResponse;
      setData(json);
    } catch {
      setErrorMsg('تعذر الاتصال بخادم الإدارة');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchAdminWorld();
  }, [fetchAdminWorld]);

  const updateConfig = async (patch: Partial<WorldDirectorConfig>, labelAr: string) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setErrorMsg(`تعذر تحديث الإعدادات (${res.status})`);
        return;
      }
      setStatusMsg(labelAr);
      await fetchAdminWorld();
    } catch {
      setErrorMsg('تعذر إرسال التعديلات للخادم');
    }
  };

  const runPlayerAction = async (
    action: 'assign_sultan' | 'revoke_sultan' | 'kick' | 'reset_world',
    targetPlayerId?: string
  ) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/player-action', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action, targetPlayerId }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) {
        setErrorMsg(json.message || json.error || 'تعذر تنفيذ الإجراء');
        return;
      }
      setStatusMsg(json.message ?? 'تم تنفيذ الإجراء');
      setConfirmReset(false);
      await fetchAdminWorld();
    } catch {
      setErrorMsg('تعذر تنفيذ الإجراء الإداري');
    }
  };

  const cfg = data?.directorConfig;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-2 sm:p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col rts2k-stone-panel text-[#241609] shadow-2xl overflow-hidden">
        <div className="px-3 py-2.5 bg-[#2a1d11] text-[#fde68a] border-b-2 border-[#7c5c2c] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-[#facc15]" />
            <h2 className="text-xs sm:text-sm font-extrabold">
              لوحة مدير العالم والتحكم الحي — ثار أحمد
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded bg-[#422c17] hover:bg-[#5c3d21] text-[#fde68a] cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 bg-[#e8d5b5]">
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#d6be96] border border-[#8f6834]">
            <div className="flex items-center gap-2 flex-1 min-w-[210px]">
              <KeyRound className="w-3.5 h-3.5 text-[#5c3d1e] shrink-0" />
              <input
                type="password"
                value={adminKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setAdminKey(val);
                  try {
                    if (val.trim()) window.sessionStorage.setItem(ADMIN_KEY_STORAGE, val.trim());
                    else window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="مفتاح الإدارة (اختياري محلياً — X-Admin-Key)"
                className="flex-1 px-2 py-1 text-xs bg-[#fdf6e6] border border-[#8f6834] text-[#241609]"
              />
            </div>
            <button
              type="button"
              onClick={() => void fetchAdminWorld()}
              className="px-3 py-1.5 rts2k-bevel-btn-gold text-xs font-bold cursor-pointer"
            >
              تحديث الحالة ({data ? `Tick #${data.tick}` : '...'})
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-950/90 text-rose-100 border border-rose-500 text-xs font-bold">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="p-2.5 bg-emerald-950/90 text-emerald-100 border border-emerald-500 text-xs font-bold">
              {statusMsg}
            </div>
          )}

          {loading && !cfg ? (
            <div className="p-8 text-center text-xs font-bold text-[#4e3417]">
              جارٍ تحميل بيانات القوى والمدن...
            </div>
          ) : cfg ? (
            <>
              {/* 1. Sultan Hassan & Online PvP Rules */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-[#f3e5c9] border border-[#9d7540] space-y-2.5">
                  <div className="flex items-center gap-1.5 font-extrabold text-xs text-[#3b230d]">
                    <Crown className="w-4 h-4 text-[#b45309]" />
                    <span>وضع السلطان حسن وعاصمة مرقاب</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'ai_ruler', label: 'ذكاء اصطناعي حاكم' },
                        { id: 'human_claimable', label: 'متاح للاعبين' },
                        { id: 'disabled', label: 'معطّل حالياً' },
                      ] as Array<{ id: SultanHassanMode; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          void updateConfig(
                            { sultanHassanMode: m.id },
                            `تم تحويل وضع السلطان حسن إلى: ${m.label}`
                          )
                        }
                        className={`px-2 py-2 text-[11px] font-bold border cursor-pointer ${
                          cfg.sultanHassanMode === m.id
                            ? 'bg-[#b45309] text-white border-[#78350f]'
                            : 'bg-[#e3cfa9] text-[#241609] border-[#9d7540] hover:bg-[#d8be8f]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#5c4020]">
                    عند اختيار «متاح للاعبين» يستطيع أي لاعب تولّي عرش السلطان حسن وجيش الدولة السندية في مرقاب، أو يمكنك تعيين أي لاعب أدناه مباشرة.
                  </p>
                </div>

                <div className="p-3 bg-[#f3e5c9] border border-[#9d7540] space-y-2.5">
                  <div className="flex items-center gap-1.5 font-extrabold text-xs text-[#3b230d]">
                    <Swords className="w-4 h-4 text-[#991b1b]" />
                    <span>نظام المواجهة والأونلاين (PvP)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'diplomacy', label: 'دبلوماسية وتحالفات' },
                        { id: 'free_for_all', label: 'حرب مفتوحة (PvP)' },
                        { id: 'coop', label: 'تعاوني (Co-op)' },
                      ] as Array<{ id: PvpMode; label: string }>
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          void updateConfig({ pvpMode: p.id }, `تم تغيير نظام اللعب إلى: ${p.label}`)
                        }
                        className={`px-2 py-2 text-[11px] font-bold border cursor-pointer ${
                          cfg.pvpMode === p.id
                            ? 'bg-[#991b1b] text-white border-[#450a0a]'
                            : 'bg-[#e3cfa9] text-[#241609] border-[#9d7540] hover:bg-[#d8be8f]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="font-bold">هدف النصر (عدد القلاع):</span>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={cfg.dominionVictoryTargetCities}
                      onChange={(e) =>
                        void updateConfig(
                          { dominionVictoryTargetCities: Number(e.target.value) || 6 },
                          'تم تحديث هدف النصر بالسيطرة'
                        )
                      }
                      className="w-16 px-2 py-1 bg-white border border-[#8f6834] text-center font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Bandits Controls */}
              <div className="p-3 bg-[#f3e5c9] border border-[#9d7540] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#7c2d12]" />
                  <span className="text-xs font-extrabold">قطاع الطرق والأوكار:</span>
                  <button
                    type="button"
                    onClick={() =>
                      void updateConfig(
                        { banditsEnabled: !cfg.banditsEnabled },
                        cfg.banditsEnabled ? 'تم إيقاف قطاع الطرق' : 'تم تفعيل قطاع الطرق'
                      )
                    }
                    className={`px-3 py-1 text-xs font-bold border cursor-pointer ${
                      cfg.banditsEnabled
                        ? 'bg-emerald-800 text-white border-emerald-950'
                        : 'bg-slate-700 text-slate-100 border-slate-900'
                    }`}
                  >
                    {cfg.banditsEnabled ? 'مفعّل' : 'معطّل'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 font-bold">
                    <span>الصعوبة:</span>
                    <select
                      value={cfg.banditDifficulty}
                      onChange={(e) =>
                        void updateConfig(
                          { banditDifficulty: e.target.value as PveDifficulty },
                          'تم تحديث صعوبة قطاع الطرق والمدن'
                        )
                      }
                      className="px-2 py-1 bg-white border border-[#8f6834] text-xs"
                    >
                      <option value="casual">هادئ</option>
                      <option value="balanced">متوازن</option>
                      <option value="aggressive">شرس</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 font-bold">
                    <span>الأوكار:</span>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={cfg.banditCampCount}
                      onChange={(e) =>
                        void updateConfig(
                          { banditCampCount: Number(e.target.value) || 3 },
                          'تم تعديل عدد أوكار قطاع الطرق'
                        )
                      }
                      className="w-14 px-2 py-1 bg-white border border-[#8f6834] text-center font-mono"
                    />
                  </label>
                </div>
              </div>

              {/* 3. Live Connected Players & Sultan Assignment */}
              <div className="p-3 bg-[#f3e5c9] border border-[#9d7540] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-extrabold text-xs">
                    <Users className="w-4 h-4 text-[#0f766e]" />
                    <span>اللاعبون المتصلون ({data?.humanPlayers.length ?? 0})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runPlayerAction('revoke_sultan')}
                    className="px-2.5 py-1 bg-[#d6be96] hover:bg-[#c5a87a] border border-[#8f6834] text-[11px] font-bold cursor-pointer"
                  >
                    إعادة مرقاب والسلطان للـ AI
                  </button>
                </div>

                {(!data?.humanPlayers || data.humanPlayers.length === 0) ? (
                  <p className="text-xs text-[#6b4d26]">لا يوجد لاعبون متصلون حالياً.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.humanPlayers.map((hp) => (
                      <div
                        key={hp.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#fdf6e6] border border-[#c5a97c] text-xs"
                      >
                        <div>
                          <span className="font-extrabold">{hp.name}</span>
                          {hp.isSultanHassan && (
                            <span className="mr-2 px-1.5 py-0.5 bg-amber-600 text-white text-[10px] font-bold">
                              السلطان حسن
                            </span>
                          )}
                          <div className="text-[10.5px] text-[#5c4020]">
                            قلاع: {hp.keepsCount} · مبانٍ: {hp.structuresCount} · جنود: {hp.unitsCount} ·{' '}
                            {hp.connected ? 'متصل' : 'مهلة عودة'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void runPlayerAction('assign_sultan', hp.id)}
                            className="px-2 py-1 rts2k-bevel-btn-gold text-[10.5px] font-bold cursor-pointer"
                          >
                            تعيين كسلطان حسن
                          </button>
                          <button
                            type="button"
                            onClick={() => void runPlayerAction('kick', hp.id)}
                            className="px-2 py-1 bg-rose-800 hover:bg-rose-700 text-white text-[10.5px] font-bold cursor-pointer"
                          >
                            طرد
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. 16 Historic Cities Toggles */}
              <div className="p-3 bg-[#f3e5c9] border border-[#9d7540] space-y-2">
                <div className="font-extrabold text-xs">تفعيل وتعطيل المدن والحاميات (16 مدينة)</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {data?.cities.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        void updateConfig(
                          { enabledCities: { ...cfg.enabledCities, [c.id]: !c.enabled } },
                          `${c.enabled ? 'تم تعطيل' : 'تم تفعيل'} مدينة ${c.nameAr}`
                        )
                      }
                      className={`p-2 text-right border transition-colors cursor-pointer ${
                        c.enabled
                          ? 'bg-[#e9f5ef] border-emerald-700 text-[#0f3b28]'
                          : 'bg-[#dcd0be] border-[#8f6834] text-[#5c4a35] opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-extrabold">
                        <span>{c.nameAr}</span>
                        <span className="text-[10px]">{c.enabled ? 'مفعّلة' : 'معطّلة'}</span>
                      </div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        مبانٍ: {c.structuresCount} · جنود: {c.unitsCount}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Admin World Reset (2-step safe confirmation) */}
              <div className="p-3 bg-[#edd9b8] border border-[#8f6834] flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#611f15]">
                  إعادة بناء العالم من جديد بآخر إعدادات المدير أعلاه:
                </span>
                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="px-3 py-1.5 bg-rose-900 hover:bg-rose-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة تهيئة العالم</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runPlayerAction('reset_world')}
                      className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer"
                    >
                      تأكيد إعادة التهيئة الآن
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-1.5 bg-[#d6be96] text-[#241609] text-xs font-bold border border-[#8f6834] cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
