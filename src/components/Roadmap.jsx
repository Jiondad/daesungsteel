import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { RoadmapSimulatorChart } from './charts/RoadmapSimulatorChart';
import { ROADMAP_BASE_YEAR, ROADMAP_TARGETS, ROADMAP_YEARS } from '../lib/constants';
import { formatVal } from '../lib/emissions';
import { buildSeasonalProfile, forecastAnnual, resolveYearTarget } from '../lib/planning';
import { computeRoadmapScenario } from '../lib/roadmap';

// --- ROADMAP COMPONENT ---
const ROADMAP_LEVER_DEFS = [
  { id: 'eff', name: '전력 효율 개선 (고효율 설비·수요관리)', unit: '% (구매전력 절감률)', step: 1, max: 100 },
  { id: 'gas', name: '도시가스 연소설비 효율화', unit: '% (도시가스 절감률)', step: 1, max: 100 },
  { id: 'ev', name: '경유 설비 전동화 (지게차·차량)', unit: '% (경유 사용량 중 전환 비율)', step: 1, max: 100 },
  { id: 'solar', name: '자가 태양광', unit: 'kWp (누적 설치 용량)', step: 10, max: null },
  { id: 'rec', name: '재생에너지 구매 (PPA·REC·녹색프리미엄)', unit: 'kWh/년 (시장기반 Scope 2에만 반영)', step: 1000, max: null },
];

export const Roadmap = ({ records, scenarios = [], onSaveScenario }) => {
  const [params, setParams] = useState({ bauGrowth: 0, solarYield: 1200, evKwhPerL: 3.5 });
  const [paramBasis, setParamBasis] = useState({ bauGrowth: '', solarYield: '', evKwhPerL: '' });
  const [levers, setLevers] = useState({
    eff: { amount: 0, start: 2027, full: 2030, basis: '' },
    gas: { amount: 0, start: 2027, full: 2030, basis: '' },
    ev: { amount: 0, start: 2027, full: 2030, basis: '' },
    solar: { amount: 0, start: 2027, full: 2030, basis: '' },
    rec: { amount: 0, start: 2027, full: 2030, basis: '' },
  });
  const [scenarioName, setScenarioName] = useState('');
  const setLever = (id, field, value) => setLevers(p => ({ ...p, [id]: { ...p[id], [field]: value } }));
  const setParam = (key, value) => setParams(p => ({ ...p, [key]: value }));

  const rows = useMemo(() => ROADMAP_YEARS.map(y => {
    const sc = computeRoadmapScenario(y, params, levers);
    const off = resolveYearTarget(y);
    return { ...sc, target: off.total, targetS1: off.scope1, targetS2: off.scope2, assumedSplit: off.assumed };
  }), [params, levers]);

  const actuals = useMemo(() => ROADMAP_YEARS.map(y => {
    const profile = buildSeasonalProfile(records, { beforeYear: y, maxYears: 2 });
    const fc = forecastAnnual(records, y, profile);
    return fc ? { year: y, ...fc } : { year: y, none: true };
  }), [records]);

  const chartData = rows.map((r, i) => ({
    year: `${r.year}년`,
    target: r.target,
    bau: r.bau.total,
    sim: r.total,
    actual: actuals[i].none ? null : actuals[i].total,
    actualIsForecast: !actuals[i].none && !actuals[i].complete,
  }));

  const last = rows[rows.length - 1];
  const gap = last.total - last.target;
  const achieved = gap <= 0;
  const firstAchieved = rows.find(r => r.year > ROADMAP_BASE_YEAR && r.total <= r.target);
  const extraKwp = gap > 0 ? gap / ((Number(params.solarYield) || 1) * last.factorElec) : 0;
  const solarFeasible = gap <= last.remainingElec * last.factorElec;
  const base2025 = actuals[0];
  const officialBase = ROADMAP_TARGETS[0].target;

  const handleSaveScenario = async () => {
    if (!onSaveScenario) return;
    const name = scenarioName.trim() || `시나리오 ${scenarios.length + 1}`;
    const snapshot = {
      id: `sc-${Date.now()}`,
      name,
      savedAt: new Date().toISOString(),
      params: { ...params },
      paramBasis: { ...paramBasis },
      levers: JSON.parse(JSON.stringify(levers)),
      results: rows.map((r) => ({ year: r.year, target: r.target, bau: r.bau.total, total: r.total, totalMarket: r.totalMarket, scope1: r.scope1, scope2: r.scope2 })),
    };
    const ok = await onSaveScenario(snapshot);
    if (ok) setScenarioName('');
  };
  const loadScenario = (sc) => {
    setParams({ ...sc.params });
    setParamBasis({ bauGrowth: '', solarYield: '', evKwhPerL: '', ...(sc.paramBasis || {}) });
    setLevers(JSON.parse(JSON.stringify(sc.levers)));
  };

  const cellNum = "w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs font-mono text-right focus:outline-none focus:border-[#1C1A17]";
  const cellTxt = "w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs focus:outline-none focus:border-[#1C1A17]";
  const yearOpts = ROADMAP_YEARS.filter(y => y > ROADMAP_BASE_YEAR);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#1C1A17] text-[#FAF9F6]"><Icon name="compass" className="w-5 h-5" /></div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1C1A17] font-display">감축 로드맵 시뮬레이터 (Scope 1·2)</h2>
            <p className="text-xs text-[#57534E] mt-0.5">공식 목표(고정)와 무조치(BAU) 경로를 기준으로, 감축 수단을 연도별 도입 일정으로 입력해 목표 달성 여부를 검토합니다.</p>
          </div>
        </div>
        <p className="text-[11px] text-[#78716C] leading-relaxed">
          기준연도 {ROADMAP_BASE_YEAR}년 {formatVal(officialBase, 3)} tCO₂e(공식 기준값) · Scope 3는 산정 대상에서 제외 · 배출량은 위치기반(location-based) Scope 2 기준이며, 재생에너지 구매는 시장기반 수치로 별도 표시합니다.
          입력한 가정값은 의사결정 참고용이므로, 감사·보고에 쓰려면 각 가정의 근거를 아래 칸에 기록하세요.
        </p>
      </div>

      <div className="bg-white border border-[#1C1A17]/15 p-4 shadow-sm space-y-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#57534E]">시나리오 저장 (감사 보고서에 포함 가능)</span>
          <input type="text" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="시나리오 이름 (예: 태양광 도입안)"
            className="bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1.5 text-xs w-56 focus:outline-none focus:border-[#1C1A17]" />
          <button type="button" onClick={handleSaveScenario} className="px-3 py-1.5 bg-[#1C1A17] text-[#FAF9F6] text-xs font-bold cursor-pointer">현재 가정 저장</button>
        </div>
        {scenarios.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#78716C]">저장된 시나리오:</span>
            {scenarios.map((sc) => (
              <button key={sc.id} type="button" onClick={() => loadScenario(sc)} title={`${String(sc.savedAt).slice(0, 10)} 저장 · 눌러서 불러오기`}
                className="px-2.5 py-1 border border-[#1C1A17]/25 hover:bg-[#F2EFE9] cursor-pointer">{sc.name}</button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#1C1A17]/15 p-4 shadow-sm">
          <div className="text-[11px] text-[#78716C] font-bold">{last.year}년 시나리오 vs 공식 목표</div>
          <div className="mt-1 text-xl font-bold font-mono text-[#1C1A17]">{formatVal(last.total, 1)} <span className="text-xs font-normal">/ {formatVal(last.target, 1)} t</span></div>
          <div className={`mt-1 text-xs font-bold ${achieved ? 'text-[#0D9488]' : 'text-[#B91C1C]'}`}>
            {achieved ? `목표 달성 (여유 ${formatVal(-gap, 1)} t)` : `목표 미달 (${formatVal(gap, 1)} t 추가 감축 필요)`}
          </div>
        </div>
        <div className="bg-white border border-[#1C1A17]/15 p-4 shadow-sm">
          <div className="text-[11px] text-[#78716C] font-bold">무조치(BAU) 대비 시나리오 감축</div>
          <div className="mt-1 text-xl font-bold font-mono text-[#1C1A17]">{formatVal(last.bau.total - last.total, 1)} <span className="text-xs font-normal">t ({last.year}년)</span></div>
          <div className="mt-1 text-xs text-[#57534E]">{firstAchieved ? `연도별 목표 첫 달성: ${firstAchieved.year}년` : '시나리오가 목표를 달성하는 연도 없음'}</div>
        </div>
        <div className="bg-white border border-[#1C1A17]/15 p-4 shadow-sm">
          <div className="text-[11px] text-[#78716C] font-bold">{last.year}년 목표 달성에 필요한 추가 감축</div>
          {achieved ? (
            <div className="mt-1 text-sm font-bold text-[#0D9488]">추가 감축 불필요</div>
          ) : (
            <div className="mt-1 text-xs text-[#1C1A17] leading-relaxed">
              {solarFeasible
                ? <>자가 태양광만으로 보완하면 약 <span className="font-bold font-mono">{formatVal(extraKwp, 0)} kWp</span> 추가 필요 (이용률 {formatVal(Number(params.solarYield) || 0, 0)} kWh/kWp, 전량 자가소비 가정)</>
                : <>자가 태양광만으로는 보완할 수 없습니다. 효율 개선·전동화·가스 절감 등 다른 수단이 필요합니다.</>}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#57534E]">
          <span><span className="inline-block w-3 h-0.5 bg-[#B91C1C] align-middle mr-1"></span>공식 목표</span>
          <span><span className="inline-block w-3 h-0.5 bg-[#78716C] align-middle mr-1"></span>무조치(BAU)</span>
          <span><span className="inline-block w-3 h-0.5 bg-[#0D9488] align-middle mr-1"></span>시나리오</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-[#1D4ED8] align-middle mr-1"></span>실적(●) / 연말 예상(▲)</span>
        </div>
        <RoadmapSimulatorChart data={chartData} />
      </div>

      <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-[#1C1A17]">감축 수단 및 도입 일정 (가정과 근거)</h3>
        <div className="overflow-x-auto border border-[#1C1A17]/10">
          <table className="w-full text-left border-collapse text-xs min-w-[760px]">
            <thead>
              <tr className="bg-[#FAF9F6] border-b border-[#1C1A17]/15 text-[11px] font-bold text-[#57534E]">
                <th className="px-3 py-2">감축 수단</th>
                <th className="px-3 py-2 w-32">최종 규모</th>
                <th className="px-3 py-2 w-24">시작연도</th>
                <th className="px-3 py-2 w-24">완료연도</th>
                <th className="px-3 py-2">근거·출처 (감사 대응)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1A17]/10">
              {ROADMAP_LEVER_DEFS.map(def => (
                <tr key={def.id}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-bold text-[#1C1A17]">{def.name}</div>
                    <div className="text-[10px] text-[#78716C]">{def.unit}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input type="number" min="0" max={def.max === null ? undefined : def.max} step={def.step} value={levers[def.id].amount}
                      onChange={(e) => setLever(def.id, 'amount', e.target.value)} className={cellNum} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select value={levers[def.id].start} onChange={(e) => setLever(def.id, 'start', Number(e.target.value))} className={cellTxt}>
                      {yearOpts.map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select value={levers[def.id].full} onChange={(e) => setLever(def.id, 'full', Number(e.target.value))} className={cellTxt}>
                      {yearOpts.map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input type="text" value={levers[def.id].basis} placeholder="예: 설비 도입 계획서, 견적서, 설계 보고서"
                      onChange={(e) => setLever(def.id, 'basis', e.target.value)} className={cellTxt} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 align-top"><div className="font-bold text-[#1C1A17]">BAU 연간 활동량 증가율</div><div className="text-[10px] text-[#78716C]">% / 년 (생산·가동 증감, 2025년 대비 누적)</div></td>
                <td className="px-3 py-2 align-top" colSpan={3}><input type="number" step="0.1" value={params.bauGrowth} onChange={(e) => setParam('bauGrowth', e.target.value)} className={cellNum} /></td>
                <td className="px-3 py-2 align-top"><input type="text" value={paramBasis.bauGrowth} placeholder="예: 중기 생산계획" onChange={(e) => setParamBasis(p => ({ ...p, bauGrowth: e.target.value }))} className={cellTxt} /></td>
              </tr>
              <tr>
                <td className="px-3 py-2 align-top"><div className="font-bold text-[#1C1A17]">태양광 연간 이용률</div><div className="text-[10px] text-[#78716C]">kWh / kWp·년 (설치 조건에 따라 변동)</div></td>
                <td className="px-3 py-2 align-top" colSpan={3}><input type="number" step="10" min="0" value={params.solarYield} onChange={(e) => setParam('solarYield', e.target.value)} className={cellNum} /></td>
                <td className="px-3 py-2 align-top"><input type="text" value={paramBasis.solarYield} placeholder="예: 시공사 발전량 시뮬레이션" onChange={(e) => setParamBasis(p => ({ ...p, solarYield: e.target.value }))} className={cellTxt} /></td>
              </tr>
              <tr>
                <td className="px-3 py-2 align-top"><div className="font-bold text-[#1C1A17]">경유 1L 전동화 시 전력 증가</div><div className="text-[10px] text-[#78716C]">kWh / L (전동화로 늘어나는 구매전력)</div></td>
                <td className="px-3 py-2 align-top" colSpan={3}><input type="number" step="0.1" min="0" value={params.evKwhPerL} onChange={(e) => setParam('evKwhPerL', e.target.value)} className={cellNum} /></td>
                <td className="px-3 py-2 align-top"><input type="text" value={paramBasis.evKwhPerL} placeholder="예: 장비 제원 기준 환산" onChange={(e) => setParamBasis(p => ({ ...p, evKwhPerL: e.target.value }))} className={cellTxt} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#78716C] leading-relaxed">
          적용 순서: BAU → 효율 개선 → 경유 전동화(전력 증가 반영) → 자가 태양광(구매전력 한도 내 차감) → 재생에너지 구매(시장기반). 도입률은 시작연도부터 완료연도까지 균등하게 증가합니다.
          초기값은 모두 0(무조치)이며, 태양광 이용률·전동화 환산값은 가정값이므로 실제 설비 자료로 교체해야 합니다.
        </p>
      </div>

      <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-[#1C1A17]">연도별 목표 · 시나리오 · 실적 (tCO₂e)</h3>
        <div className="overflow-x-auto border border-[#1C1A17]/10">
          <table className="w-full text-right border-collapse text-xs font-mono min-w-[820px]">
            <thead>
              <tr className="bg-[#FAF9F6] border-b border-[#1C1A17]/15 text-[11px] font-bold text-[#57534E]">
                <th className="px-3 py-2 text-left">연도</th>
                <th className="px-3 py-2">공식 목표</th>
                <th className="px-3 py-2">목표 S1 / S2</th>
                <th className="px-3 py-2">BAU</th>
                <th className="px-3 py-2">시나리오</th>
                <th className="px-3 py-2">시나리오 S1 / S2</th>
                <th className="px-3 py-2">시장기반 합계</th>
                <th className="px-3 py-2">목표 대비</th>
                <th className="px-3 py-2">실적/연말예상</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1A17]/10">
              {rows.map((r, i) => {
                const diff = r.total - r.target;
                const a = actuals[i];
                return (
                  <tr key={r.year}>
                    <td className="px-3 py-2 text-left font-bold">{r.year}</td>
                    <td className="px-3 py-2">{formatVal(r.target, 3)}</td>
                    <td className="px-3 py-2 text-[#57534E]">{formatVal(r.targetS1, 1)} / {formatVal(r.targetS2, 1)}{r.assumedSplit ? '*' : ''}</td>
                    <td className="px-3 py-2">{formatVal(r.bau.total, 3)}</td>
                    <td className="px-3 py-2 font-bold">{formatVal(r.total, 3)}</td>
                    <td className="px-3 py-2 text-[#57534E]">{formatVal(r.scope1, 1)} / {formatVal(r.scope2, 1)}</td>
                    <td className="px-3 py-2 text-[#57534E]">{formatVal(r.totalMarket, 3)}</td>
                    <td className={`px-3 py-2 font-bold ${r.year === ROADMAP_BASE_YEAR ? 'text-[#78716C]' : (diff <= 0 ? 'text-[#0D9488]' : 'text-[#B91C1C]')}`}>
                      {r.year === ROADMAP_BASE_YEAR ? '기준' : (diff <= 0 ? '달성 ' : '미달 +') + formatVal(Math.abs(diff), 1)}
                    </td>
                    <td className="px-3 py-2">
                      {a.none ? <span className="text-[#A8A29E]">-</span> : <span>{formatVal(a.total, 3)} <span className="text-[10px] text-[#78716C]">{a.complete ? '(실적)' : `(${a.months}개월 입력, 예상)`}</span></span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="text-[11px] text-[#78716C] leading-relaxed list-disc pl-4 space-y-0.5">
          <li>* 표시: Scope별 공식 목표가 확정되지 않은 연도로, 가장 최근 확정 연도의 Scope 비율로 배분한 가정값입니다.</li>
          <li>연말 예상: 입력된 달의 실적을 에너지원별 계절 비중(직전 완비 연도 패턴, 없으면 KPI 마스터)으로 역산한 값이며, 12개월이 모두 입력되면 실적 그대로입니다.</li>
          {base2025 && !base2025.none && base2025.complete && (
            <li>기준연도 점검: 입력된 {ROADMAP_BASE_YEAR}년 실적 {formatVal(base2025.total, 3)} t는 공식 기준값 {formatVal(officialBase, 3)} t와 {formatVal(base2025.total - officialBase, 3)} t 차이입니다. 차이가 크면 기준연도 재산정 여부를 검토하세요.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

