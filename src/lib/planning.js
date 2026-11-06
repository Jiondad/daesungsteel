import { PLAN_KEYS, ROADMAP_TARGETS, TARGETS_2026 } from './constants';
import { calculateEmissions, getFactors, isEntered } from './emissions';

// 12개월이 모두 입력된 연도 목록
export function getCompleteYears(records) {
  const cnt = {};
  records.forEach(r => { if (isEntered(r)) cnt[r.year] = (cnt[r.year] || 0) + 1; });
  return Object.keys(cnt).map(Number).filter(y => cnt[y] === 12).sort((a, b) => a - b);
}

// 에너지원별 월 비중(계절 프로파일). 12개월 완비 연도의 평균, 없으면 KPI 마스터 패턴 사용.
export function buildSeasonalProfile(records, opts = {}) {
  const beforeYear = opts.beforeYear === undefined ? Infinity : opts.beforeYear;
  const maxYears = opts.maxYears || 2;
  const used = getCompleteYears(records).filter(y => y < beforeYear).slice(-maxYears);
  const shares = {};
  const annual = {};
  if (used.length > 0) {
    PLAN_KEYS.forEach(k => {
      const acc = Array(12).fill(0);
      let annSum = 0;
      used.forEach(y => {
        const vals = Array.from({ length: 12 }, (_, i) => {
          const r = records.find(x => x.year === y && x.month === i + 1);
          return Number(r && r[k]) || 0;
        });
        const tot = vals.reduce((a, b) => a + b, 0);
        annSum += tot;
        vals.forEach((v, i) => { acc[i] += tot > 0 ? v / tot : 1 / 12; });
      });
      shares[k] = acc.map(v => v / used.length);
      annual[k] = annSum / used.length;
    });
    return { basis: 'actual', usedYears: used, shares, annual, label: `실적 기반 (${used.join('·')}년 월별 패턴 평균)` };
  }
  PLAN_KEYS.forEach(k => {
    const vals = TARGETS_2026.map(t => Number(t[k]) || 0);
    const tot = vals.reduce((a, b) => a + b, 0);
    shares[k] = vals.map(v => (tot > 0 ? v / tot : 1 / 12));
    annual[k] = tot;
  });
  return { basis: 'kpi_master', usedYears: [], shares, annual, label: 'KPI 마스터(2026) 월별 패턴 — 12개월 완비된 실적 연도 없음' };
}

// 연간 총량을 월 비중대로 정수 배분(합계 = 반올림한 연간 총량, 최대잔여법)
export function allocateMonthly(annual, shares) {
  const total = Math.max(0, Math.round(annual));
  const raw = shares.map(s => s * total);
  const base = raw.map(Math.floor);
  const rem = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f);
  for (let j = 0; j < rem; j++) base[order[j].i] += 1;
  return base;
}

// 연도별 공식 목표. Scope별 목표가 없는 연도는 가장 최근에 확정된 Scope 비율로 배분(가정)
export function resolveYearTarget(year) {
  const t = ROADMAP_TARGETS.find(r => r.year === Number(year));
  if (!t) return null;
  if (t.scope1 != null && t.scope2 != null) return { total: t.target, scope1: t.scope1, scope2: t.scope2, assumed: false };
  const ref = [...ROADMAP_TARGETS].reverse().find(r => r.scope1 != null && r.scope2 != null);
  const r1 = ref.scope1 / ref.target;
  return { total: t.target, scope1: t.target * r1, scope2: t.target * (1 - r1), assumed: true };
}

// 연간 Scope 1·2 목표(tCO2e) → 에너지원별 월별 사용량 계획
export function generateMonthlyPlan(profile, year, scope1Target, scope2Target) {
  const f = getFactors(year);
  const dE = (profile.annual.diesel || 0) * f.diesel;
  const gE = (profile.annual.cityGas || 0) * f.cityGas;
  const dieselShare = (dE + gE) > 0 ? dE / (dE + gE) : 0.5;
  const annual = {
    diesel: scope1Target * dieselShare / f.diesel,
    cityGas: scope1Target * (1 - dieselShare) / f.cityGas,
    electricity: scope2Target / f.electricity,
    water: profile.annual.water || 0,
  };
  const months = Array.from({ length: 12 }, () => ({}));
  PLAN_KEYS.forEach(k => {
    allocateMonthly(annual[k], profile.shares[k]).forEach((v, i) => { months[i][k] = v; });
  });
  return { months, annual, dieselShare };
}

// 연말 예상 배출량: 입력된 달의 실적을 계절 비중으로 역산(연환산). 12개월 완비 시 실적 그대로.
export function forecastAnnual(records, year, profile) {
  const entered = records.filter(r => r.year === year && isEntered(r));
  if (entered.length === 0) return null;
  const est = {};
  const lowCoverage = [];
  ['diesel', 'cityGas', 'electricity'].forEach(k => {
    const done = entered.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const sh = entered.reduce((s, r) => s + profile.shares[k][r.month - 1], 0);
    if (sh >= 0.1) {
      est[k] = done / sh;
    } else {
      est[k] = profile.annual[k] || 0; // 입력된 달의 비중이 너무 작아 역산 불가 → 직전 연간 사용량 참조
      lowCoverage.push(k);
    }
  });
  const em = calculateEmissions(est.diesel, est.cityGas, est.electricity, year);
  return { months: entered.length, complete: entered.length === 12, est, lowCoverage, ...em, basisLabel: profile.label };
}

