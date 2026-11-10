import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { YearPicker } from './YearPicker';
import { formatVal } from '../lib/emissions';
import { buildAuditData, buildWorkbookSheets, LEVER_NAMES, normalizeAuditConfig } from '../lib/audit';
import { downloadJson, downloadWorkbook } from '../lib/exportWorkbook';

const d10 = (iso) => (iso ? String(iso).slice(0, 10) : '');
const STATUS_LABEL = { ok: '정상', warn: '확인 필요', info: '참고' };
const STATUS_CLASS = { ok: 'text-[#15803D]', warn: 'text-[#B91C1C] font-bold', info: 'text-[#57534E]' };
const num = (v, d = 2) => (v === null || v === undefined ? '-' : formatVal(v, d));

export const AuditReport = ({ records, targets, planMeta, auditConfig, scenarios, changeLog, availableYears, backupData, closedMonths = {}, onSaveConfig, isSaving }) => {
  const defaultYear = useMemo(() => {
    const entered = records.filter((r) => (Number(r.diesel) || 0) > 0 || (Number(r.cityGas) || 0) > 0 || (Number(r.electricity) || 0) > 0);
    const latest = entered.length ? Math.max(...entered.map((r) => r.year)) : null;
    return latest || (availableYears.length ? Math.max(...availableYears) : new Date().getFullYear());
  }, [records, availableYears]);

  const [year, setYear] = useState(defaultYear);
  const [draft, setDraft] = useState(() => normalizeAuditConfig(auditConfig));
  const [scenarioId, setScenarioId] = useState('');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setDraft(normalizeAuditConfig(auditConfig)); }, [auditConfig]);
  useEffect(() => {
    if (!scenarioId && scenarios.length > 0) setScenarioId(scenarios[scenarios.length - 1].id);
  }, [scenarios]);

  const scenario = scenarios.find((s) => s.id === scenarioId) || null;
  const data = useMemo(
    () => buildAuditData({ year, records, targets, planMeta, config: draft, scenario, changeLog, closedMonths }),
    [year, records, targets, planMeta, draft, scenario, changeLog, closedMonths]
  );
  const s = data.summary;
  const cfg = data.config;
  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const setSource = (k, v) => setDraft((p) => ({ ...p, factorSources: { ...p.factorSources, [k]: v } }));

  const handleSave = async () => {
    setMessage('');
    const ok = await onSaveConfig(draft);
    if (ok) setMessage('보고서 설정을 저장했습니다.');
  };
  const handleExcel = async () => {
    try {
      setExporting(true);
      await downloadWorkbook(buildWorkbookSheets(data), `대성스틸_온실가스_인벤토리_${year}.xlsx`);
    } catch (e) {
      console.error(e);
      alert('엑셀 파일 생성 중 오류가 발생했습니다: ' + e.toString());
    } finally {
      setExporting(false);
    }
  };
  const handleBackup = () => {
    downloadJson({ exportedAt: new Date().toISOString(), ...backupData }, `daesungsteel_backup_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const inputCls = 'w-full bg-white border border-[#E5E2D9] px-2 py-1.5 text-xs focus:outline-none focus:border-[#1C1A17]';
  const labelCls = 'block text-[11px] font-bold text-[#57534E] mb-1';

  return (
    <div className="space-y-6">
      {/* ── 화면 전용: 제어판 ── */}
      <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#1C1A17] text-[#FAF9F6]"><Icon name="database" className="w-5 h-5" /></div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1C1A17] font-display">감사 대응 보고서</h2>
              <p className="text-xs text-[#57534E] mt-0.5">입력된 실적·목표·계수·변경 이력을 한 문서로 정리합니다. 인쇄(PDF 저장)와 엑셀로 내보낼 수 있습니다.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#57534E]">보고연도</span>
            <YearPicker value={year} years={availableYears} onChange={setYear} />
            <button type="button" onClick={() => window.print()} className="px-3 py-2 bg-[#15803D] hover:bg-[#166534] text-white text-xs font-bold cursor-pointer">인쇄 / PDF 저장</button>
            <button type="button" onClick={handleExcel} disabled={exporting} className="px-3 py-2 bg-[#1C1A17] hover:bg-[#1C1A17]/85 text-[#FAF9F6] text-xs font-bold cursor-pointer disabled:opacity-50">{exporting ? '생성 중…' : '엑셀 내보내기'}</button>
            <button type="button" onClick={handleBackup} className="px-3 py-2 border border-[#1C1A17]/30 hover:bg-[#F2EFE9] text-xs font-bold cursor-pointer">전체 데이터 백업(JSON)</button>
          </div>
        </div>

        {scenarios.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-[#57534E]">보고서에 포함할 로드맵 시나리오</span>
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} className="bg-white border border-[#E5E2D9] px-2 py-1.5">
              <option value="">포함하지 않음</option>
              {scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.name} ({d10(sc.savedAt)})</option>)}
            </select>
          </label>
        )}

        <details className="border border-[#E5E2D9] bg-[#FCFAF7]">
          <summary className="px-4 py-3 text-sm font-bold cursor-pointer select-none">보고서 설정 (조직경계 · 배출계수 출처 · 결재) — 감사 시 반드시 채워 두세요</summary>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label><span className={labelCls}>조직명</span><input className={inputCls} value={draft.orgName} onChange={(e) => setField('orgName', e.target.value)} /></label>
              <label><span className={labelCls}>사업장(명칭·주소)</span><input className={inputCls} value={draft.sites} placeholder="예: 본사 및 ○○공장 (주소)" onChange={(e) => setField('sites', e.target.value)} /></label>
              <label><span className={labelCls}>조직경계 설정 방식</span>
                <select className={inputCls} value={draft.boundaryApproach} onChange={(e) => setField('boundaryApproach', e.target.value)}>
                  <option value="">선택</option><option value="운영통제 기준">운영통제 기준</option><option value="재무통제 기준">재무통제 기준</option><option value="지분율 기준">지분율 기준</option>
                </select></label>
              <label><span className={labelCls}>조직경계 보충 설명</span><input className={inputCls} value={draft.boundaryNote} placeholder="예: 임차 사업장 포함 여부 등" onChange={(e) => setField('boundaryNote', e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelCls}>작성 기준(적용한 지침·표준)</span><input className={inputCls} value={draft.standardNote} placeholder="실제 적용하는 지침·표준을 기재 (미확인 시 비워 두세요)" onChange={(e) => setField('standardNote', e.target.value)} /></label>
              <label className="md:col-span-2"><span className={labelCls}>Scope 3 제외 사유</span><textarea rows={2} className={inputCls} value={draft.scope3Reason} onChange={(e) => setField('scope3Reason', e.target.value)} /></label>
            </div>
            <div>
              <span className={labelCls}>배출계수 출처 (고시명·연도·번호 등)</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.factorRows.map((f) => (
                  <label key={f.key}><span className="block text-[10px] text-[#78716C] mb-0.5">{f.label}</span>
                    <input className={inputCls} value={draft.factorSources[f.key] || ''} placeholder="출처 입력" onChange={(e) => setSource(f.key, e.target.value)} /></label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[['작성', 'preparedBy', 'preparedDate'], ['검토', 'reviewedBy', 'reviewedDate'], ['승인', 'approvedBy', 'approvedDate']].map(([label, nameKey, dateKey]) => (
                <div key={nameKey} className="grid grid-cols-2 gap-2">
                  <label><span className={labelCls}>{label}자</span><input className={inputCls} value={draft[nameKey]} onChange={(e) => setField(nameKey, e.target.value)} /></label>
                  <label><span className={labelCls}>{label}일</span><input type="date" className={inputCls} value={draft[dateKey]} onChange={(e) => setField(dateKey, e.target.value)} /></label>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-[#1C1A17] text-[#FAF9F6] text-xs font-bold cursor-pointer disabled:opacity-50">설정 저장</button>
              {message && <span className="text-xs font-semibold text-[#15803D]">{message}</span>}
              <span className="text-[11px] text-[#78716C]">저장하지 않아도 아래 미리보기에는 즉시 반영되지만, 다시 열면 사라집니다.</span>
            </div>
          </div>
        </details>
      </div>

      {/* ── 보고서 본문(인쇄 대상) ── */}
      <article className="audit-article bg-white border border-[#1C1A17]/15 p-6 sm:p-10 shadow-sm space-y-7 text-[#1C1A17]" data-testid="audit-report">
        <header className="audit-section flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#1C1A17] pb-4">
          <div>
            <p className="text-xs text-[#57534E] font-mono">{cfg.orgName}</p>
            <h1 className="text-xl sm:text-2xl font-bold font-display mt-1">{year}년 온실가스 인벤토리 보고서 (Scope 1·2)</h1>
            <p className="text-xs text-[#57534E] mt-1">보고 기간 {year}-01-01 ~ {year}-12-31 · 생성일 {d10(data.generatedAt)}</p>
          </div>
          <table className="audit-table w-auto" aria-label="결재란">
            <thead><tr><th>구분</th><th>작성</th><th>검토</th><th>승인</th></tr></thead>
            <tbody>
              <tr><th>성명</th><td>{cfg.preparedBy}</td><td>{cfg.reviewedBy}</td><td>{cfg.approvedBy}</td></tr>
              <tr><th>일자</th><td>{cfg.preparedDate}</td><td>{cfg.reviewedDate}</td><td>{cfg.approvedDate}</td></tr>
            </tbody>
          </table>
        </header>

        <section className="audit-section space-y-2">
          <h2 className="text-sm font-bold">1. 보고 개요 및 경계</h2>
          <table className="audit-table">
            <tbody>
              <tr><th className="w-40">산정 범위</th><td>Scope 1(경유·도시가스), Scope 2(구매전력, 위치기반). Scope 3은 산정 대상에서 제외</td></tr>
              <tr><th>조직경계</th><td>{[cfg.boundaryApproach, cfg.boundaryNote].filter(Boolean).join(' · ') || <span className="text-[#B91C1C]">미기재</span>}</td></tr>
              <tr><th>사업장</th><td>{cfg.sites || <span className="text-[#B91C1C]">미기재</span>}</td></tr>
              <tr><th>Scope 3 제외 사유</th><td>{cfg.scope3Reason}</td></tr>
              <tr><th>작성 기준</th><td>{cfg.standardNote || <span className="text-[#B91C1C]">미기재</span>}</td></tr>
              <tr><th>기준연도</th><td>{s.baseYear}년 (공식 기준값 {num(s.baseTotal, 3)} tCO₂e)</td></tr>
              <tr><th>실적 입력 현황</th><td>{s.enteredCount} / 12개월 입력{s.missingMonths.length > 0 && ` · 미입력 ${s.missingMonths.join(', ')}월`}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="audit-section space-y-2">
          <h2 className="text-sm font-bold">2. 배출량 요약 (tCO₂e)</h2>
          <table className="audit-table">
            <thead><tr><th>구분</th><th>실적 (입력 {s.enteredCount}개월)</th><th>동일 기간 누적 목표</th><th>달성률(%)</th><th>기간 전체(12개월) 목표</th></tr></thead>
            <tbody>
              <tr><th>Scope 1 (직접)</th><td className="num">{num(s.actual.scope1)}</td><td className="num">{num(s.sameTarget.scope1)}</td><td className="num">{num(s.rate.scope1, 1)}</td><td className="num">{num(s.fullTarget.scope1)}</td></tr>
              <tr><th>Scope 2 (간접)</th><td className="num">{num(s.actual.scope2)}</td><td className="num">{num(s.sameTarget.scope2)}</td><td className="num">{num(s.rate.scope2, 1)}</td><td className="num">{num(s.fullTarget.scope2)}</td></tr>
              <tr><th>합계</th><td className="num font-bold">{num(s.actual.total)}</td><td className="num font-bold">{num(s.sameTarget.total)}</td><td className="num font-bold">{num(s.rate.total, 1)}</td><td className="num font-bold">{num(s.fullTarget.total)}</td></tr>
            </tbody>
          </table>
          <ul className="text-[11px] text-[#44403C] list-disc pl-5 space-y-0.5">
            <li>달성률 = 실적 ÷ 동일 기간 누적 목표 × 100 (100% 이하면 목표 이내). 목표는 실적이 입력된 달까지만 누적해 같은 기간끼리 비교합니다.</li>
            {s.forecast && <li>연말 예상(계절 보정, 참고용 추정): {num(s.forecast.total)} t — {s.forecast.label}. 실적이 아닌 추정값입니다.</li>}
            {s.vsBase !== null && <li>기준연도({s.baseYear}년) 대비 {s.enteredCount === 12 ? '연간 실적' : '연말 예상'} 증감: {s.vsBase >= 0 ? '+' : '−'}{num(Math.abs(s.vsBase), 1)}%</li>}
            {s.official && <li>공식 로드맵 {year}년 목표: {num(s.official.total, 3)} t{s.official.assumed ? ' (Scope별 목표는 가정 배분)' : ` (Scope 1 ${num(s.official.scope1, 3)} / Scope 2 ${num(s.official.scope2, 3)})`}</li>}
            {s.intensity !== null && <li>평균 탄소 집약도: {num(s.intensity, 3)} tCO₂e/억원 (매출이 입력된 달 기준)</li>}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold audit-section">3. 월별 활동자료 및 배출량 산정표</h2>
          <table className="audit-table">
            <thead><tr><th>월</th><th>경유(L)</th><th>도시가스(Nm³)</th><th>구매전력(kWh)</th><th>수도(TON)<br />참고</th><th>Scope 1</th><th>Scope 2</th><th>합계</th></tr></thead>
            <tbody>
              {data.monthly.map((r) => (
                <tr key={r.month} className={r.entered ? '' : 'text-[#A8A29E]'}>
                  <th>{r.month}월{r.closed && ' 🔒'}</th>
                  {r.entered ? (
                    <>
                      <td className="num">{num(r.diesel)}</td><td className="num">{num(r.cityGas)}</td><td className="num">{num(r.electricity)}</td><td className="num">{num(r.water)}</td>
                      <td className="num">{num(r.scope1, 3)}</td><td className="num">{num(r.scope2, 3)}</td><td className="num">{num(r.total, 3)}</td>
                    </>
                  ) : (<td colSpan={7} className="text-center">미입력</td>)}
                </tr>
              ))}
              <tr>
                <th>합계</th>
                <td className="num font-bold">{num(data.totals.diesel)}</td><td className="num font-bold">{num(data.totals.cityGas)}</td><td className="num font-bold">{num(data.totals.electricity)}</td><td className="num font-bold">{num(data.totals.water)}</td>
                <td className="num font-bold">{num(data.totals.scope1, 3)}</td><td className="num font-bold">{num(data.totals.scope2, 3)}</td><td className="num font-bold">{num(data.totals.total, 3)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="audit-section space-y-2">
          <h2 className="text-sm font-bold">4. 산정 방법 및 배출계수</h2>
          <p className="text-[11px] text-[#44403C] leading-relaxed">
            Scope 1 = 경유(L) × 계수 + 도시가스(Nm³) × 계수 / Scope 2 = 구매전력(kWh) × 계수(위치기반). 월별로 계산해 합산하며 계산 과정에서는 반올림하지 않고 표시할 때만 반올림합니다.
            계수는 {year}년 값을 사용하며, 해당 연도 값이 없으면 직전 가장 가까운 연도 값을 사용합니다.
          </p>
          <table className="audit-table">
            <thead><tr><th>배출원</th><th>배출계수</th><th>단위</th><th>출처</th></tr></thead>
            <tbody>
              {data.factorRows.map((f) => (
                <tr key={f.key}><th className="text-left">{f.label}</th><td className="num">{f.value}</td><td>{f.unit}</td><td>{f.source || <span className="text-[#B91C1C] font-bold">출처 미기재</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold audit-section">5. 목표 수립 기록 및 월별 목표 대비 실적</h2>
          <div className="audit-section text-[11px] text-[#44403C] leading-relaxed space-y-0.5">
            <p><span className="font-bold">적용 기준:</span> {data.planInfo.policy}</p>
            <p><span className="font-bold">{year}년 목표:</span> {data.planInfo.saved ? '저장된 월별 목표 사용' : '저장된 목표 없음(기본값 사용)'}{data.planInfo.methodApplies ? ' · 공식 로드맵 기준 수립 방식 적용 연도' : ' · 기존 목표 유지 연도'}</p>
            {data.planInfo.meta ? (
              <>
                <p><span className="font-bold">수립 방법:</span> {data.planInfo.meta.method} · {data.planInfo.meta.seasonalBasis || '-'}</p>
                <p><span className="font-bold">목표 출처:</span> {data.planInfo.meta.targetSource || '-'}{data.planInfo.meta.scope1Target != null && ` · 연간 목표 S1 ${num(data.planInfo.meta.scope1Target, 3)} / S2 ${num(data.planInfo.meta.scope2Target, 3)} t`}</p>
                {data.planInfo.meta.lockedMonths && data.planInfo.meta.lockedMonths.length > 0 && <p><span className="font-bold">기존 목표 유지 월:</span> {data.planInfo.meta.lockedMonths.join(', ')}월 (남은 달만 재배분)</p>}
                <p><span className="font-bold">적용·변경 사유:</span> {data.planInfo.meta.reason || '-'} · 저장 {d10(data.planInfo.meta.savedAt)}{data.planInfo.meta.modifiedAfterPlan && ' · 저장 이후 수동 변경됨'}</p>
              </>
            ) : (<p>자동 수립 기록 없음(기존 목표 유지 또는 수동 입력)</p>)}
          </div>
          <table className="audit-table">
            <thead><tr><th>월</th><th>목표 경유(L)</th><th>목표 도시가스(Nm³)</th><th>목표 전력(kWh)</th><th>목표 배출</th><th>실적 배출</th><th>달성률(%)</th></tr></thead>
            <tbody>
              {data.monthly.map((r) => (
                <tr key={r.month} className={r.entered ? '' : 'text-[#A8A29E]'}>
                  <th>{r.month}월</th>
                  <td className="num">{num(r.target.diesel, 0)}</td><td className="num">{num(r.target.cityGas, 0)}</td><td className="num">{num(r.target.electricity, 0)}</td>
                  <td className="num">{num(r.target.total, 3)}</td>
                  <td className="num">{r.entered ? num(r.total, 3) : '미입력'}</td>
                  <td className={`num ${r.rate !== null && r.rate > 100 ? 'text-[#B91C1C] font-bold' : ''}`}>{r.rate !== null ? num(r.rate, 1) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="audit-section space-y-2">
          <h2 className="text-sm font-bold">6. 감축 로드맵 시나리오</h2>
          {data.scenario ? (
            <>
              <p className="text-[11px] text-[#44403C]">시나리오 “{data.scenario.name}” · 저장 {d10(data.scenario.savedAt)}</p>
              <table className="audit-table">
                <thead><tr><th>감축 수단 / 가정</th><th>규모·값</th><th>시작</th><th>완료</th><th>근거·출처</th></tr></thead>
                <tbody>
                  {Object.entries(data.scenario.levers).map(([id, l]) => (
                    <tr key={id}><th className="text-left">{LEVER_NAMES[id] || id}</th><td className="num">{l.amount}</td><td>{l.start}</td><td>{l.full}</td><td>{l.basis || <span className="text-[#B91C1C]">근거 미기재</span>}</td></tr>
                  ))}
                  <tr><th className="text-left">BAU 연간 활동량 증가율(%)</th><td className="num">{data.scenario.params.bauGrowth}</td><td>-</td><td>-</td><td>{(data.scenario.paramBasis && data.scenario.paramBasis.bauGrowth) || ''}</td></tr>
                  <tr><th className="text-left">태양광 이용률(kWh/kWp·년)</th><td className="num">{data.scenario.params.solarYield}</td><td>-</td><td>-</td><td>{(data.scenario.paramBasis && data.scenario.paramBasis.solarYield) || ''}</td></tr>
                  <tr><th className="text-left">경유 1L 전동화 시 전력(kWh/L)</th><td className="num">{data.scenario.params.evKwhPerL}</td><td>-</td><td>-</td><td>{(data.scenario.paramBasis && data.scenario.paramBasis.evKwhPerL) || ''}</td></tr>
                </tbody>
              </table>
              <table className="audit-table">
                <thead><tr><th>연도</th><th>공식 목표</th><th>무조치(BAU)</th><th>시나리오</th><th>목표 대비</th></tr></thead>
                <tbody>
                  {data.scenario.results.map((r) => (
                    <tr key={r.year}><th>{r.year}</th><td className="num">{num(r.target, 3)}</td><td className="num">{num(r.bau, 3)}</td><td className="num">{num(r.total, 3)}</td>
                      <td className={`num ${r.total > r.target ? 'text-[#B91C1C] font-bold' : 'text-[#15803D]'}`}>{r.year === 2025 ? '기준' : `${r.total > r.target ? '+' : '−'}${num(Math.abs(r.total - r.target), 2)}`}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-[#78716C]">시나리오는 의사결정 참고용 가정이며 실적이 아닙니다.</p>
            </>
          ) : (<p className="text-[11px] text-[#78716C]">포함된 시나리오가 없습니다. 로드맵 시뮬레이터에서 시나리오를 저장하면 선택해 포함할 수 있습니다.</p>)}
        </section>

        <section className="audit-section space-y-2">
          <h2 className="text-sm font-bold">7. 데이터 품질 점검</h2>
          <table className="audit-table">
            <thead><tr><th>점검 항목</th><th>결과</th><th>내용</th></tr></thead>
            <tbody>
              {data.quality.checks.map((c) => (
                <tr key={c.name}><th className="text-left">{c.name}</th><td className={`text-center ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</td><td>{c.detail}</td></tr>
              ))}
            </tbody>
          </table>
          {data.quality.anomalies.yoy.length > 0 && (
            <ul className="text-[11px] text-[#44403C] list-disc pl-5">
              {data.quality.anomalies.yoy.map((a) => (
                <li key={`${a.month}-${a.field}`}>{a.month}월 {a.field}: 전년 {num(a.prev)} → 올해 {num(a.cur)} ({a.change >= 0 ? '+' : '−'}{num(Math.abs(a.change) * 100, 1)}%)</li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold audit-section">8. 변경 이력</h2>
          <p className="text-[11px] text-[#78716C]">이 시스템에서 저장한 작업의 기록입니다(최근 100건). 브라우저에서 기록되는 내부 이력이며, 서버 인증 기반의 변조 방지 이력은 아닙니다.</p>
          {data.changeLog.length === 0 ? (<p className="text-[11px] text-[#44403C]">기록된 변경 이력이 없습니다. (이력 기능 도입 이후 저장한 작업부터 기록됩니다.)</p>) : (
            <table className="audit-table">
              <thead><tr><th>일시(UTC)</th><th>작업</th><th>내용</th><th>작업자</th></tr></thead>
              <tbody>
                {data.changeLog.map((e, i) => (<tr key={`${e.at}-${i}`}><td className="whitespace-nowrap">{String(e.at).replace('T', ' ').slice(0, 16)}</td><td>{e.action}</td><td>{e.detail}</td><td>{e.actor}</td></tr>))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="audit-section border-t border-[#D6D3D1] pt-3 text-[11px] text-[#78716C] leading-relaxed">
          본 보고서는 시스템에 입력된 데이터를 기반으로 자동 생성된 내부 자료이며, 외부 검증기관의 검증 결과가 아닙니다. 연말 예상과 로드맵 시나리오는 추정·가정이며 실적이 아닙니다.
        </footer>
      </article>
    </div>
  );
};
