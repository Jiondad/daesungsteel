// 감사 대응 보고서·내보내기용 순수 로직(화면과 분리해 테스트 가능하게 유지)
import { PLAN_METHOD_START_YEAR, ROADMAP_TARGETS, TARGETS_2026 } from './constants';
import { calculateEmissions, getFactors, isEntered } from './emissions';
import { buildSeasonalProfile, forecastAnnual, resolveYearTarget } from './planning';

// ───────── 보고서 설정(조직경계·배출계수 출처·결재) ─────────
export const DEFAULT_AUDIT_CONFIG = {
  orgName: '(주)대성스틸',
  sites: '',
  boundaryApproach: '',
  boundaryNote: '',
  standardNote: '',
  scope3Reason:
    '공급망·출장·통근 등 Scope 3 활동자료를 신뢰성 있게 수집·산정하기 어려워 본 인벤토리의 산정 대상에서 제외하였습니다. 수도 사용량은 참고 지표로만 관리하며 배출량 합계에 포함하지 않습니다.',
  factorSources: { diesel: '', cityGas: '', electricity: '', water: '' },
  preparedBy: '', preparedDate: '',
  reviewedBy: '', reviewedDate: '',
  approvedBy: '', approvedDate: '',
};

export function normalizeAuditConfig(c) {
  const src = c && typeof c === 'object' ? c : {};
  return {
    ...DEFAULT_AUDIT_CONFIG,
    ...src,
    factorSources: { ...DEFAULT_AUDIT_CONFIG.factorSources, ...(src.factorSources || {}) },
  };
}

// ───────── 변경 이력 ─────────
export const LOG_LIMIT = 500;

export function makeLogEntry(action, detail, { year = null, actor = '' } = {}) {
  return { at: new Date().toISOString(), action, detail, year, actor };
}

export function appendLog(log, entry) {
  return [...(Array.isArray(log) ? log : []), entry].slice(-LOG_LIMIT);
}

const DIFF_FIELDS = [['diesel', '경유'], ['cityGas', '도시가스'], ['electricity', '전력'], ['water', '수도'], ['revenue', '매출']];

// 연도별 실적 변경 내역(신규·삭제·값 변경). 실적이 입력되지 않은 0 레코드의 추가/삭제는 변경으로 보지 않는다.
export function diffRecords(oldRecords, newRecords, year) {
  const index = (list) => new Map((list || []).filter((r) => r.year === year).map((r) => [r.month, r]));
  const a = index(oldRecords);
  const b = index(newRecords);
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const o = a.get(m);
    const n = b.get(m);
    if (!o && n) { if (isEntered(n)) out.push({ month: m, type: 'add' }); continue; }
    if (o && !n) { if (isEntered(o)) out.push({ month: m, type: 'remove' }); continue; }
    if (o && n) {
      DIFF_FIELDS.forEach(([k, label]) => {
        const from = Number(o[k]) || 0;
        const to = Number(n[k]) || 0;
        if (from !== to) out.push({ month: m, type: 'change', field: label, from, to });
      });
    }
  }
  return out;
}

export function describeDiff(diff, max = 8) {
  const lines = diff.map((d) => {
    if (d.type === 'add') return `${d.month}월 신규 입력`;
    if (d.type === 'remove') return `${d.month}월 삭제`;
    return `${d.month}월 ${d.field} ${d.from}→${d.to}`;
  });
  if (lines.length <= max) return lines.join('; ');
  return `${lines.slice(0, max).join('; ')} 외 ${lines.length - max}건`;
}

// ───────── 데이터 품질 ─────────
const CORE = [['diesel', '경유'], ['cityGas', '도시가스'], ['electricity', '전력']];

export function detectAnomalies(records, year, threshold = 0.3) {
  const yoy = [];
  const zeros = [];
  records
    .filter((r) => r.year === year && isEntered(r))
    .sort((x, y) => x.month - y.month)
    .forEach((rec) => {
      const prev = records.find((r) => r.year === year - 1 && r.month === rec.month && isEntered(r));
      CORE.forEach(([k, label]) => {
        const cur = Number(rec[k]) || 0;
        if (cur === 0) zeros.push({ month: rec.month, field: label });
        if (prev) {
          const pv = Number(prev[k]) || 0;
          if (pv > 0) {
            const change = (cur - pv) / pv;
            if (Math.abs(change) > threshold) yoy.push({ month: rec.month, field: label, prev: pv, cur, change });
          }
        }
      });
    });
  return { yoy, zeros };
}

// ───────── 보고서 데이터 ─────────
const FACTOR_META = [
  { key: 'diesel', label: '경유 (Scope 1)', unit: 'tCO₂e/L' },
  { key: 'cityGas', label: '도시가스 (Scope 1)', unit: 'tCO₂e/Nm³' },
  { key: 'electricity', label: '구매전력 (Scope 2, 위치기반)', unit: 'tCO₂e/kWh' },
  { key: 'water', label: '용수/수도 (참고·Scope 3 제외)', unit: 'tCO₂e/TON' },
];

export function buildAuditData({ year, records, targets, planMeta = {}, config, scenario = null, changeLog = [], now = new Date() }) {
  const cfg = normalizeAuditConfig(config);
  const yearRecs = records.filter((r) => r.year === year);
  const savedTargets = targets && targets[year];
  const yearTargets = savedTargets || TARGETS_2026;
  const factors = getFactors(year);

  // 월별 산정표
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const rec = yearRecs.find((r) => r.month === m && isEntered(r));
    const t = yearTargets[i] || TARGETS_2026[i];
    const tEm = calculateEmissions(t.diesel, t.cityGas, t.electricity, year);
    const em = rec ? calculateEmissions(rec.diesel, rec.cityGas, rec.electricity, year) : null;
    return {
      month: m,
      entered: !!rec,
      diesel: rec ? Number(rec.diesel) || 0 : null,
      cityGas: rec ? Number(rec.cityGas) || 0 : null,
      electricity: rec ? Number(rec.electricity) || 0 : null,
      water: rec ? Number(rec.water) || 0 : null,
      revenue: rec && rec.revenue !== null && rec.revenue !== undefined && rec.revenue !== '' ? Number(rec.revenue) : null,
      scope1: em ? em.scope1 : null,
      scope2: em ? em.scope2 : null,
      total: em ? em.total : null,
      target: { diesel: Number(t.diesel) || 0, cityGas: Number(t.cityGas) || 0, electricity: Number(t.electricity) || 0, total: tEm.total, scope1: tEm.scope1, scope2: tEm.scope2 },
      rate: em && tEm.total > 0 ? (em.total / tEm.total) * 100 : null,
    };
  });
  const enteredRows = monthly.filter((r) => r.entered);
  const missingMonths = monthly.filter((r) => !r.entered).map((r) => r.month);

  const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const totals = {
    diesel: sum(enteredRows, 'diesel'), cityGas: sum(enteredRows, 'cityGas'), electricity: sum(enteredRows, 'electricity'),
    water: sum(enteredRows, 'water'), revenue: sum(enteredRows, 'revenue'),
    scope1: sum(enteredRows, 'scope1'), scope2: sum(enteredRows, 'scope2'), total: sum(enteredRows, 'total'),
  };

  // 목표(동일 기간 누적 / 기간 전체)
  const sameTarget = enteredRows.reduce((a, r) => ({
    scope1: a.scope1 + r.target.scope1, scope2: a.scope2 + r.target.scope2, total: a.total + r.target.total,
  }), { scope1: 0, scope2: 0, total: 0 });
  const fullTarget = monthly.reduce((a, r) => ({
    scope1: a.scope1 + r.target.scope1, scope2: a.scope2 + r.target.scope2, total: a.total + r.target.total,
  }), { scope1: 0, scope2: 0, total: 0 });
  const pct = (a, t) => (t > 0 ? (a / t) * 100 : null);

  // 연말 예상 / 기준연도 대비
  const profile = buildSeasonalProfile(records, { beforeYear: year, maxYears: 2 });
  const forecast = enteredRows.length > 0 ? forecastAnnual(records, year, profile) : null;
  const annualEstimate = enteredRows.length === 12 ? totals.total : (forecast ? forecast.total : null);
  const base = ROADMAP_TARGETS[0];
  const vsBase = annualEstimate !== null && year > base.year ? ((annualEstimate - base.target) / base.target) * 100 : null;
  const official = resolveYearTarget(year);

  const summary = {
    enteredCount: enteredRows.length,
    missingMonths,
    actual: { scope1: totals.scope1, scope2: totals.scope2, total: totals.total },
    sameTarget,
    fullTarget,
    rate: { total: pct(totals.total, sameTarget.total), scope1: pct(totals.scope1, sameTarget.scope1), scope2: pct(totals.scope2, sameTarget.scope2) },
    forecast: forecast && enteredRows.length < 12 ? { total: forecast.total, label: forecast.basisLabel } : null,
    annualEstimate,
    baseYear: base.year,
    baseTotal: base.target,
    vsBase,
    official,
    intensity: totals.revenue > 0 ? totals.total / totals.revenue : null,
  };

  // 배출계수
  const factorRows = FACTOR_META.map((f) => ({
    ...f,
    value: factors[f.key],
    source: (cfg.factorSources[f.key] || '').trim(),
  }));

  // 목표 수립 기록
  const meta = (planMeta && planMeta[year]) || null;
  const planInfo = {
    saved: !!savedTargets,
    meta,
    policy: `${PLAN_METHOD_START_YEAR - 1}년까지는 기존 월별 목표를 유지하고, ${PLAN_METHOD_START_YEAR}년부터는 공식 로드맵 목표를 계절 패턴으로 배분해 수립합니다.`,
    methodApplies: year >= PLAN_METHOD_START_YEAR,
    gapToOfficial: official ? fullTarget.total - official.total : null,
  };

  // 데이터 품질
  const anomalies = detectAnomalies(records, year);
  const checks = [];
  checks.push({
    name: '월별 실적 입력 완료',
    status: missingMonths.length === 0 ? 'ok' : 'info',
    detail: missingMonths.length === 0 ? '12개월 모두 입력' : `${enteredRows.length}/12개월 입력 · 미입력 ${missingMonths.join(', ')}월`,
  });
  const recomputed = calculateEmissions(totals.diesel, totals.cityGas, totals.electricity, year).total;
  checks.push({
    name: '산정 재현성(검산)',
    status: Math.abs(recomputed - totals.total) < 1e-6 ? 'ok' : 'warn',
    detail: `월별 배출량 합계 ${totals.total.toFixed(3)} t ↔ 연간 활동량×배출계수 재계산 ${recomputed.toFixed(3)} t`,
  });
  const missingSources = factorRows.filter((f) => f.key !== 'water' && !f.source).map((f) => f.label);
  checks.push({
    name: '배출계수 출처 기재',
    status: missingSources.length === 0 ? 'ok' : 'warn',
    detail: missingSources.length === 0 ? '모든 계수에 출처 기재' : `출처 미기재: ${missingSources.join(', ')}`,
  });
  checks.push({
    name: '전년 동월 대비 급변(±30% 초과)',
    status: anomalies.yoy.length === 0 ? 'ok' : 'warn',
    detail: anomalies.yoy.length === 0 ? '해당 없음(또는 비교할 전년 데이터 없음)' : `${anomalies.yoy.length}건 — 증빙(고지서) 대조 필요`,
  });
  checks.push({
    name: '0 입력 항목',
    status: anomalies.zeros.length === 0 ? 'ok' : 'info',
    detail: anomalies.zeros.length === 0 ? '없음' : anomalies.zeros.map((z) => `${z.month}월 ${z.field}`).join(', '),
  });
  if (official) {
    const gap = planInfo.gapToOfficial;
    checks.push({
      name: '월별 목표 합계 ↔ 공식 로드맵 목표',
      status: Math.abs(gap) <= 0.05 ? 'ok' : (year >= PLAN_METHOD_START_YEAR ? 'warn' : 'info'),
      detail: `월별 목표 합계 ${fullTarget.total.toFixed(2)} t / 공식 ${official.total.toFixed(2)} t (차이 ${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(2)} t)${official.assumed ? ' · Scope별 목표는 가정 배분' : ''}`,
    });
  }
  const baseRecs = records.filter((r) => r.year === base.year && isEntered(r));
  if (year > base.year && baseRecs.length === 12) {
    const b = calculateEmissions(
      baseRecs.reduce((a, r) => a + (Number(r.diesel) || 0), 0),
      baseRecs.reduce((a, r) => a + (Number(r.cityGas) || 0), 0),
      baseRecs.reduce((a, r) => a + (Number(r.electricity) || 0), 0),
      base.year
    ).total;
    checks.push({
      name: `기준연도(${base.year}) 입력 실적 ↔ 공식 기준값`,
      status: Math.abs(b - base.target) / base.target > 0.01 ? 'warn' : 'ok',
      detail: `입력 실적 ${b.toFixed(3)} t / 공식 기준값 ${base.target.toFixed(3)} t (차이 ${(b - base.target).toFixed(3)} t) — 차이가 크면 기준연도 재산정 검토`,
    });
  }

  const logRows = (Array.isArray(changeLog) ? changeLog : [])
    .filter((e) => e.year === year || e.year === null || e.year === undefined)
    .slice()
    .sort((x, y) => (x.at < y.at ? 1 : -1))
    .slice(0, 100);

  return {
    year, generatedAt: now.toISOString(), config: cfg,
    monthly, totals, summary, factorRows, planInfo,
    quality: { checks, anomalies }, scenario, changeLog: logRows,
  };
}

// ───────── 엑셀 시트 구성 ─────────
const r3 = (v) => (v === null || v === undefined ? '' : Math.round(v * 1000) / 1000);

export function buildWorkbookSheets(d) {
  const s = d.summary;
  const sheets = [];

  sheets.push({
    name: '요약',
    widths: [34, 52],
    rows: [
      ['항목', '값'],
      ['조직', d.config.orgName],
      ['보고연도', d.year],
      ['생성 시각', d.generatedAt],
      ['산정 범위', 'Scope 1(경유·도시가스), Scope 2(구매전력, 위치기반) — Scope 3 제외'],
      ['실적 입력 개월', `${s.enteredCount}/12`],
      ['미입력 월', s.missingMonths.length ? s.missingMonths.join(', ') + '월' : '없음'],
      ['실적 Scope 1 (tCO2e)', r3(s.actual.scope1)],
      ['실적 Scope 2 (tCO2e)', r3(s.actual.scope2)],
      ['실적 합계 (tCO2e)', r3(s.actual.total)],
      ['동일 기간 누적 목표 (tCO2e)', r3(s.sameTarget.total)],
      ['달성률(동일 기간, %)', r3(s.rate.total)],
      ['Scope 1 달성률(%)', r3(s.rate.scope1)],
      ['Scope 2 달성률(%)', r3(s.rate.scope2)],
      ['기간 전체(12개월) 목표 (tCO2e)', r3(s.fullTarget.total)],
      ['연말 예상(계절 보정, 참고) (tCO2e)', s.forecast ? r3(s.forecast.total) : ''],
      [`기준연도(${s.baseYear}) 공식 기준값 (tCO2e)`, s.baseTotal],
      ['기준연도 대비 증감(%, 연간 환산)', r3(s.vsBase)],
      ['평균 탄소 집약도 (tCO2e/억원)', r3(s.intensity)],
      ['※ 비고', '시스템 입력 데이터를 기반으로 자동 생성한 내부 자료이며 외부 검증 결과가 아닙니다.'],
    ],
  });

  sheets.push({
    name: '월별 산정표',
    widths: [8, 14, 14, 16, 12, 12, 14, 14, 14, 10],
    rows: [
      ['월', '경유(L)', '도시가스(Nm3)', '구매전력(kWh)', '수도(TON,참고)', '매출(억원)', 'Scope1(tCO2e)', 'Scope2(tCO2e)', '합계(tCO2e)', '입력'],
      ...d.monthly.map((r) => [r.month, r.diesel ?? '', r.cityGas ?? '', r.electricity ?? '', r.water ?? '', r.revenue ?? '', r3(r.scope1), r3(r.scope2), r3(r.total), r.entered ? '입력' : '미입력']),
      ['합계', r3(d.totals.diesel), r3(d.totals.cityGas), r3(d.totals.electricity), r3(d.totals.water), r3(d.totals.revenue), r3(d.totals.scope1), r3(d.totals.scope2), r3(d.totals.total), `${s.enteredCount}개월`],
    ],
  });

  sheets.push({
    name: '배출계수·방법',
    widths: [34, 16, 14, 56],
    rows: [
      ['배출원', '배출계수', '단위', '출처(고시명·연도)'],
      ...d.factorRows.map((f) => [f.label, f.value, f.unit, f.source || '(미기재)']),
      [],
      ['산정식', 'Scope 1 = 경유(L)×계수 + 도시가스(Nm3)×계수 / Scope 2 = 구매전력(kWh)×계수 (위치기반)'],
      ['적용 연도 계수', `${d.year}년 표의 값을 사용(해당 연도 값이 없으면 직전 가장 가까운 연도 값)`],
      ['Scope 3', d.config.scope3Reason],
      ['조직경계', [d.config.boundaryApproach, d.config.boundaryNote, d.config.sites].filter(Boolean).join(' / ') || '(미기재)'],
      ['작성 기준', d.config.standardNote || '(미기재)'],
    ],
  });

  sheets.push({
    name: '목표 대비',
    widths: [8, 14, 14, 16, 14, 14, 12],
    rows: [
      ['월', '목표 경유(L)', '목표 도시가스(Nm3)', '목표 전력(kWh)', '목표 배출(tCO2e)', '실적 배출(tCO2e)', '달성률(%)'],
      ...d.monthly.map((r) => [r.month, r.target.diesel, r.target.cityGas, r.target.electricity, r3(r.target.total), r3(r.total), r3(r.rate)]),
      [],
      ['목표 수립 기록'],
      ['수립 방식 기준', d.planInfo.policy],
      ['저장된 목표', d.planInfo.saved ? '있음' : '없음(기본값 사용)'],
      ...(d.planInfo.meta ? [
        ['수립 방법', d.planInfo.meta.method || ''],
        ['계절 패턴 기준', d.planInfo.meta.seasonalBasis || ''],
        ['목표 출처', d.planInfo.meta.targetSource || ''],
        ['연간 목표 S1/S2 (tCO2e)', `${r3(d.planInfo.meta.scope1Target)} / ${r3(d.planInfo.meta.scope2Target)}`],
        ['유지한 월(기존 목표)', (d.planInfo.meta.lockedMonths || []).join(', ')],
        ['적용·변경 사유', d.planInfo.meta.reason || ''],
        ['저장 시각', d.planInfo.meta.savedAt || ''],
      ] : []),
    ],
  });

  sheets.push({
    name: '데이터 품질',
    widths: [40, 10, 90],
    rows: [
      ['점검 항목', '결과', '내용'],
      ...d.quality.checks.map((c) => [c.name, c.status === 'ok' ? '정상' : (c.status === 'warn' ? '확인 필요' : '참고'), c.detail]),
      [],
      ['전년 동월 대비 급변 상세'],
      ['월', '항목', '전년', '올해', '증감(%)'],
      ...d.quality.anomalies.yoy.map((a) => [a.month, a.field, a.prev, a.cur, r3(a.change * 100)]),
    ],
  });

  sheets.push({
    name: '변경 이력',
    widths: [24, 22, 12, 80, 20],
    rows: [
      ['일시(UTC)', '작업', '연도', '내용', '작업자'],
      ...d.changeLog.map((e) => [e.at, e.action, e.year ?? '', e.detail, e.actor || '']),
    ],
  });

  if (d.scenario) {
    const sc = d.scenario;
    sheets.push({
      name: '로드맵 시나리오',
      widths: [34, 18, 14, 14, 50],
      rows: [
        ['시나리오', sc.name, '저장', sc.savedAt],
        [],
        ['가정', '값', '시작연도', '완료연도', '근거·출처'],
        ...Object.entries(sc.levers).map(([id, l]) => [LEVER_NAMES[id] || id, l.amount, l.start, l.full, l.basis || '']),
        ['BAU 연간 활동량 증가율(%)', sc.params.bauGrowth, '', '', (sc.paramBasis && sc.paramBasis.bauGrowth) || ''],
        ['태양광 이용률(kWh/kWp·년)', sc.params.solarYield, '', '', (sc.paramBasis && sc.paramBasis.solarYield) || ''],
        ['경유 1L 전동화 시 전력 증가(kWh/L)', sc.params.evKwhPerL, '', '', (sc.paramBasis && sc.paramBasis.evKwhPerL) || ''],
        [],
        ['연도', '공식 목표', 'BAU', '시나리오', '시장기반 합계', '목표 대비'],
        ...sc.results.map((r) => [r.year, r3(r.target), r3(r.bau), r3(r.total), r3(r.totalMarket), r3(r.total - r.target)]),
      ],
    });
  }
  return sheets;
}

export const LEVER_NAMES = {
  eff: '전력 효율 개선(%)',
  gas: '도시가스 연소설비 효율화(%)',
  ev: '경유 설비 전동화(%)',
  solar: '자가 태양광(kWp)',
  rec: '재생에너지 구매(kWh/년)',
};
