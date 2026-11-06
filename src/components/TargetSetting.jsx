import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { YearPicker } from './YearPicker';
import { DAESUNG_SEASONAL_TARGETS, TARGETS_2026 } from '../lib/constants';
import { calculateEmissions, formatVal } from '../lib/emissions';
import { buildSeasonalProfile, generateMonthlyPlan, resolveYearTarget } from '../lib/planning';

export const TargetSetting = ({ targets, onSaveTargets, records, onRefresh, availableYears = [2026, 2025, 2024], onRegisterYear, isSaving, planMeta = {} }) => {
  const [years, setYears] = useState(availableYears);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [editedTargets, setEditedTargets] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [planS1, setPlanS1] = useState('');
  const [planS2, setPlanS2] = useState('');
  const [planSource, setPlanSource] = useState('');
  const [planYears, setPlanYears] = useState(2);
  const [planPreview, setPlanPreview] = useState(null);
  const [draftMeta, setDraftMeta] = useState(null);

  useEffect(() => {
    const t = resolveYearTarget(selectedYear);
    setPlanS1(t ? t.scope1.toFixed(3) : '');
    setPlanS2(t ? t.scope2.toFixed(3) : '');
    setPlanSource(t ? (t.assumed ? 'Scope별 공식 목표 미확정 — 최근 확정 연도의 Scope 비율로 배분(가정)' : '공식 로드맵 목표') : '공식 로드맵 목표 없음 — 직접 입력');
    setDraftMeta(null);
    setPlanPreview(null);
  }, [selectedYear]);

  const handleAutoPlan = () => {
    const s1 = parseFloat(planS1);
    const s2 = parseFloat(planS2);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      setErrorMessage('연간 Scope 1·2 목표(tCO₂e)를 0 이상의 숫자로 입력해주세요.');
      return;
    }
    const profile = buildSeasonalProfile(records, { beforeYear: selectedYear, maxYears: planYears });
    const plan = generateMonthlyPlan(profile, selectedYear, s1, s2);
    setEditedTargets(prev => prev.map((t, i) => ({
      ...t,
      diesel: String(plan.months[i].diesel),
      cityGas: String(plan.months[i].cityGas),
      electricity: String(plan.months[i].electricity),
      water: String(plan.months[i].water),
    })));
    const sum = (k) => plan.months.reduce((a, m) => a + m[k], 0);
    const em = calculateEmissions(sum('diesel'), sum('cityGas'), sum('electricity'), selectedYear);
    setPlanPreview({ label: profile.label, basis: profile.basis, scope1: em.scope1, scope2: em.scope2, total: em.total, targetTotal: s1 + s2 });
    setDraftMeta({
      method: '계절 보정 자동 수립 (에너지원별 월 비중 × 연간 목표)',
      seasonalBasis: profile.label,
      basisType: profile.basis,
      usedYears: profile.usedYears,
      scope1Target: s1,
      scope2Target: s2,
      targetSource: planSource,
      dieselShareOfScope1: plan.dieselShare,
      factorYear: selectedYear,
      generatedAt: new Date().toISOString(),
      manuallyEdited: false,
    });
    setSuccessMessage('');
    setErrorMessage('');
  };

  const currentYear = selectedYear;
  const setCurrentYear = (val) => {
    setSelectedYear(Number(val));
  };

  useEffect(() => {
    if (availableYears) {
      setYears(availableYears);
    }
  }, [availableYears]);

  const handleAddYear = () => {
    const newYearStr = window.prompt("등록하실 새로운 연도를 입력하세요 (예: 2027):");
    if (!newYearStr) return;
    const newYear = parseInt(newYearStr, 10);
    if (isNaN(newYear) || newYear < 2000 || newYear > 2100) {
      alert("올바른 연도 4자리를 입력해주세요.");
      return;
    }
    // 연도 선택 드롭다운 배열에 즉시 추가하여 리렌더링 유발
    if (!years.includes(newYear)) {
      const updatedYears = [...years, newYear].sort((a, b) => b - a);
      setYears(updatedYears); // 연도 상태 업데이트 함수를 반드시 실행해줘
      setCurrentYear(newYear); // 새로 등록한 연도로 자동 전환

      if (onRegisterYear) {
        onRegisterYear(newYear);
      }
      alert(newYear + "년이 성공적으로 등록되었습니다. 실적과 목표를 입력해주세요.");
    } else {
      alert("이미 등록된 연도입니다.");
    }
  };

  useEffect(() => {
    if (onRefresh) onRefresh();
  }, [selectedYear]);

  useEffect(() => {
    const yearData = targets[selectedYear] || TARGETS_2026;
    setEditedTargets(yearData.map(t => ({
      diesel: (t.diesel !== undefined && t.diesel !== null) ? t.diesel.toString() : '',
      cityGas: (t.cityGas !== undefined && t.cityGas !== null) ? t.cityGas.toString() : '',
      electricity: (t.electricity !== undefined && t.electricity !== null) ? t.electricity.toString() : '',
      water: (t.water !== undefined && t.water !== null) ? t.water.toString() : '',
      revenue: (t.revenue !== undefined && t.revenue !== null) ? t.revenue.toString() : ''
    })));
  }, [selectedYear, targets]);

  const handleInputChange = (index, field, value) => {
    setDraftMeta(p => (p ? { ...p, manuallyEdited: true } : p));
    setEditedTargets(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveAll = (e) => {
    if (e) e.preventDefault();

    const parsed = [];
    for (let i = 0; i < 12; i++) {
      const t = editedTargets[i];
      if (!t) return;
      const d = parseFloat(t.diesel);
      const g = parseFloat(t.cityGas);
      const el = parseFloat(t.electricity);
      const w = parseFloat(t.water);
      const r = parseFloat(t.revenue);

      if (isNaN(d) || d < 0 || isNaN(g) || g < 0 || isNaN(el) || el < 0 || isNaN(w) || w < 0) {
        setErrorMessage(`${i + 1}월 목표 항목에 0 이상의 올바른 숫자를 입력해주세요.`);
        return;
      }
      parsed.push({ diesel: d, cityGas: g, electricity: el, water: w, revenue: isNaN(r) ? null : r });
    }

    Promise.resolve(onSaveTargets(selectedYear, parsed, draftMeta)).then(ok => { if (ok) setDraftMeta(null); });
    setErrorMessage('');
  };

  const handleLoadDefaults = () => {
    if (window.confirm(`${selectedYear}년도 목표 설정 기본값으로 전년(${selectedYear - 1}년) 동월 실제 사용량 대비 3% 감축(사용량 * 0.97)한 가이드라인 목표를 일괄 불러오시겠습니까?`)) {
      const currentRecords = records;

      const updated = editedTargets.map((t, idx) => {
        const m = idx + 1;
        const prevYear = selectedYear - 1;
        const prevRecord = currentRecords.find(r => Number(r.year) === prevYear && Number(r.month) === m);
        const def = DAESUNG_SEASONAL_TARGETS[idx] || { diesel: 0, cityGas: 0, electricity: 0, water: 0 };

        const getTarget = (key, fallbackVal) => {
          if (prevRecord && prevRecord[key] !== undefined && prevRecord[key] !== null && prevRecord[key] !== '') {
            const val = parseFloat(prevRecord[key]);
            if (!isNaN(val)) {
              return Math.round(val * 0.97);
            }
          }
          return fallbackVal;
        };

        return {
          ...t,
          diesel: getTarget('diesel', def.diesel).toString(),
          cityGas: getTarget('cityGas', def.cityGas).toString(),
          electricity: getTarget('electricity', def.electricity).toString(),
          water: getTarget('water', def.water).toString()
        };
      });

      setEditedTargets(updated);
    }
  };

  if (editedTargets.length === 0) return null;

  // 저장 전 월별 목표 합계와 공식 로드맵 목표의 차이 점검
  const sumTarget = (k) => editedTargets.reduce((acc, t) => acc + (parseFloat(t[k]) || 0), 0);
  const editedAnnualEm = calculateEmissions(sumTarget('diesel'), sumTarget('cityGas'), sumTarget('electricity'), selectedYear);
  const officialTarget = resolveYearTarget(selectedYear);
  const officialGap = officialTarget ? editedAnnualEm.total - officialTarget.total : null;

  return (
    <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#FAF9F6]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#1C1A17] text-[#FAF9F6]">
            <Icon name="edit" className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1C1A17] font-display">에너지원별 월별 목표 설정</h2>
            <p className="text-xs text-[#57534E] mt-0.5">선택한 연도의 1월부터 12월까지 각 에너지원별 가이드라인 목표 사용량을 세밀하게 구성하십시오.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#78716C] font-semibold">연도 설정:</span>
          <YearPicker value={selectedYear} years={years} onChange={(y) => setSelectedYear(y)} />
          <button
            type="button"
            onClick={handleAddYear}
            className="px-3 py-1.5 bg-[#1C1A17] hover:bg-[#1C1A17]/85 text-[#FAF9F6] text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 shadow-sm"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            <span>+ 새 연도 등록</span>
          </button>
          <button
            type="button"
            onClick={handleLoadDefaults}
            className="px-3 py-1.5 border border-[#1C1A17]/30 hover:bg-[#F2EFE9] text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            기본값 불러오기
          </button>
        </div>
      </div>

      <div className="border border-[#1C1A17]/15 bg-[#FCFAF7] p-4 space-y-3 print:hidden">
        <div className="text-sm font-bold text-[#1C1A17]">계절 보정 연간 계획 자동 수립</div>
        <p className="text-[11px] text-[#57534E] leading-relaxed">
          연간 Scope 1·2 목표(tCO₂e)를 직전 실적의 월별 계절 패턴(에너지원별)으로 12개월에 배분해 초안을 만듭니다.
          초안을 검토·수정한 뒤 아래 [저장]을 눌러야 확정되며, 수립 방법·기준 연도·목표 출처가 함께 기록됩니다.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
          <label className="space-y-1"><span className="block font-bold text-[#57534E]">Scope 1 연간 목표 (tCO₂e)</span>
            <input type="number" step="any" value={planS1} onChange={(e) => setPlanS1(e.target.value)} className="w-full bg-white border border-[#E5E2D9] px-2 py-1.5 font-mono text-right" /></label>
          <label className="space-y-1"><span className="block font-bold text-[#57534E]">Scope 2 연간 목표 (tCO₂e)</span>
            <input type="number" step="any" value={planS2} onChange={(e) => setPlanS2(e.target.value)} className="w-full bg-white border border-[#E5E2D9] px-2 py-1.5 font-mono text-right" /></label>
          <label className="space-y-1"><span className="block font-bold text-[#57534E]">계절 패턴 기준 실적 연수</span>
            <select value={planYears} onChange={(e) => setPlanYears(Number(e.target.value))} className="w-full bg-white border border-[#E5E2D9] px-2 py-1.5">
              <option value={1}>직전 1개년</option><option value={2}>최근 2개년 평균</option><option value={3}>최근 3개년 평균</option>
            </select></label>
          <button type="button" onClick={handleAutoPlan} className="px-3 py-2 bg-[#1C1A17] hover:bg-[#1C1A17]/85 text-[#FAF9F6] text-xs font-bold cursor-pointer">자동 수립 (초안 생성)</button>
        </div>
        <div className="text-[11px] text-[#78716C]">목표 출처: {planSource}</div>
        {planPreview && (
          <div className="text-[11px] text-[#1C1A17] bg-white border border-[#E5E2D9] p-3 leading-relaxed">
            <div>초안 합계: Scope 1 {formatVal(planPreview.scope1, 3)} t / Scope 2 {formatVal(planPreview.scope2, 3)} t / 합계 {formatVal(planPreview.total, 3)} t (입력 목표 {formatVal(planPreview.targetTotal, 3)} t, 정수 반올림 차이 포함)</div>
            <div className="text-[#57534E]">계절 패턴: {planPreview.label}</div>
            {planPreview.basis === 'kpi_master' && (
              <div className="text-[#B91C1C] font-bold">12개월이 모두 입력된 실적 연도가 없어 KPI 마스터 패턴을 사용했습니다. 실적이 쌓이면 다시 수립하세요.</div>
            )}
          </div>
        )}
        {planMeta[selectedYear] && (
          <div className="text-[11px] text-[#57534E] bg-white border border-[#E5E2D9] p-3 leading-relaxed">
            저장된 계획 근거: {planMeta[selectedYear].seasonalBasis || planMeta[selectedYear].method}
            {planMeta[selectedYear].scope1Target != null && ` · 목표 S1 ${formatVal(planMeta[selectedYear].scope1Target, 1)} / S2 ${formatVal(planMeta[selectedYear].scope2Target, 1)} t`}
            {planMeta[selectedYear].savedAt && ` · ${String(planMeta[selectedYear].savedAt).slice(0, 10)} 저장`}
            {planMeta[selectedYear].manuallyEdited && ' · 자동 수립 후 수동 수정됨'}
            {planMeta[selectedYear].modifiedAfterPlan && ' · 저장 이후 수동 변경됨'}
          </div>
        )}
      </div>

      <form onSubmit={handleSaveAll} className="space-y-6">
        <div className="overflow-x-auto border border-[#1C1A17]/10 w-full">
          <table className="w-full text-left border-collapse table-auto text-xs">
            <thead>
              <tr className="bg-[#FAF9F6] border-b border-[#1C1A17]/15 text-[10px] sm:text-[11px] font-bold text-[#57534E] uppercase tracking-wider font-mono">
                <th className="py-2.5 px-3 text-center whitespace-nowrap border-r border-[#1C1A17]/10 w-16">월구분</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">경유 목표 (L)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">도시가스 목표 (Nm³)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">구매전력 목표 (kWh)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">상수도 목표 (TON)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">예상 탄소 배출량 (tCO₂e)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1A17]/10 text-xs text-[#1C1A17] font-mono">
              {Array.from({ length: 12 }, (_, i) => {
                const m = i + 1;
                const t = editedTargets[i];
                if (!t) return null;
                const dVal = parseFloat(t.diesel) || 0;
                const gVal = parseFloat(t.cityGas) || 0;
                const eVal = parseFloat(t.electricity) || 0;
                const calc = calculateEmissions(dVal, gVal, eVal, selectedYear);

                return (
                  <tr key={m} className="hover:bg-[#FCFAF7] transition-colors">
                    <td className="py-2 px-3 text-center font-bold text-[#1C1A17] border-r border-[#1C1A17]/10 bg-[#FAF9F6]">
                      {m}월
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        id={`diesel-target-${m}`}
                        type="number"
                        step="any"
                        required
                        value={t.diesel}
                        onChange={(e) => handleInputChange(i, 'diesel', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        id={`citygas-target-${m}`}
                        type="number"
                        step="any"
                        required
                        value={t.cityGas}
                        onChange={(e) => handleInputChange(i, 'cityGas', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        id={`electricity-target-${m}`}
                        type="number"
                        step="any"
                        required
                        value={t.electricity}
                        onChange={(e) => handleInputChange(i, 'electricity', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        id={`water-target-${m}`}
                        type="number"
                        step="any"
                        required
                        value={t.water}
                        onChange={(e) => handleInputChange(i, 'water', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[#1E40AF]">
                      {calc.total.toFixed(3)} t
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-4 text-sm text-slate-500 leading-relaxed flex items-start gap-2.5 rounded-md shadow-sm">
          <span className="text-base shrink-0">💡</span>
          <div className="space-y-1.5">
            <p>
              월별 목표는 사용자가 입력·저장한 값입니다. [자동 수립]으로 만든 경우 수립 방법, 기준 연도, 목표 출처가 함께 기록됩니다.
            </p>
            {officialGap !== null && Math.abs(officialGap) > 0.05 && (
              <p className="font-semibold text-[#B45309]">
                현재 월별 목표 합계 {formatVal(editedAnnualEm.total, 2)} t는 공식 로드맵 {selectedYear}년 목표 {formatVal(officialTarget.total, 2)} t와 {formatVal(Math.abs(officialGap), 2)} t 차이가 있습니다.
                감사 대응을 위해 두 값을 일치시키거나 차이의 사유를 기록해 두세요.
              </p>
            )}
          </div>
        </div>

        {errorMessage && <p className="text-xs text-red-600 font-semibold">{errorMessage}</p>}
        {successMessage && <p className="text-xs text-green-700 font-semibold">{successMessage}</p>}

        <div className="flex justify-end items-center gap-3 pt-2">
          {isSaving && (
            <span className="text-xs text-[#D97706] font-semibold animate-pulse mr-1">
              ⚡ 대성스틸 보안 서버에 고속 저장 중...
            </span>
          )}
          <button
            type="submit"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-6 py-3 bg-[#1C1A17] disabled:bg-[#1C1A17]/60 text-white text-xs font-bold hover:bg-[#2C2A27] transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            {isSaving ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#FAF9F6] border-t-transparent inline-block mr-1"></span>
                <span>데이터 처리 중...</span>
              </>
            ) : (
              <>
                <Icon name="database" className="w-4 h-4" /> <span>{selectedYear}년 목표 저장하기</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

