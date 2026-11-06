import { describe, it, expect } from 'vitest';
import { TARGETS_2026 } from '../../src/lib/constants';
import { calculateEmissions } from '../../src/lib/emissions';
import {
  getCompleteYears, buildSeasonalProfile, allocateMonthly, resolveYearTarget, generateMonthlyPlan, forecastAnnual,
} from '../../src/lib/planning';

const rec = (y, m, k) => ({
  id: `${y}-${m}`, year: y, month: m,
  diesel: TARGETS_2026[m - 1].diesel * k, cityGas: TARGETS_2026[m - 1].cityGas * k,
  electricity: TARGETS_2026[m - 1].electricity * k, water: 100, revenue: null,
});
const full2025 = Array.from({ length: 12 }, (_, i) => rec(2025, i + 1, 0.95));
const h1_2026 = Array.from({ length: 6 }, (_, i) => rec(2026, i + 1, 0.9));
const records = [...full2025, ...h1_2026];

describe('계절 프로파일', () => {
  it('12개월 완비 연도만 사용하고, 월 비중 합은 1이다', () => {
    expect(getCompleteYears(records)).toEqual([2025]);
    const p = buildSeasonalProfile(records, { beforeYear: 2026, maxYears: 2 });
    expect(p.basis).toBe('actual');
    ['diesel', 'cityGas', 'electricity'].forEach((k) => {
      expect(p.shares[k].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    });
  });
  it('완비 연도가 없으면 KPI 마스터 패턴으로 대체한다', () => {
    const p = buildSeasonalProfile(h1_2026, { beforeYear: 2027 });
    expect(p.basis).toBe('kpi_master');
  });
});

describe('연간 계획 자동 수립', () => {
  it('정수 배분의 합계는 반올림한 연간 총량과 일치한다', () => {
    const arr = allocateMonthly(41555.6, buildSeasonalProfile(records, { beforeYear: 2026 }).shares.cityGas);
    expect(arr.reduce((a, b) => a + b, 0)).toBe(41556);
    expect(arr.every(Number.isInteger)).toBe(true);
  });
  it('월별 계획의 배출량 합이 연간 목표와 정수 반올림 오차 내에서 일치한다', () => {
    const t = resolveYearTarget(2026);
    const p = buildSeasonalProfile(records, { beforeYear: 2026 });
    const plan = generateMonthlyPlan(p, 2026, t.scope1, t.scope2);
    const sum = (k) => plan.months.reduce((a, m) => a + m[k], 0);
    const em = calculateEmissions(sum('diesel'), sum('cityGas'), sum('electricity'), 2026);
    expect(Math.abs(em.total - t.total)).toBeLessThan(0.05);
    expect(Math.abs(em.scope2 - t.scope2)).toBeLessThan(0.05);
  });
  it('Scope별 목표가 없는 연도는 가정 비율로 배분하며 합계는 공식 목표와 같다', () => {
    const t = resolveYearTarget(2028);
    expect(t.assumed).toBe(true);
    expect(t.scope1 + t.scope2).toBeCloseTo(t.total, 9);
    expect(resolveYearTarget(2026).assumed).toBe(false);
    expect(resolveYearTarget(2040)).toBeNull();
  });
});

describe('연말 예상(계절 보정 연환산)', () => {
  it('상반기만 입력해도 계절 비중으로 역산해 연간 사용량을 맞춘다(단순 ×2 연환산의 과대 계상 방지)', () => {
    const p = buildSeasonalProfile(records, { beforeYear: 2026 });
    const fc = forecastAnnual(records, 2026, p);
    const expectedGas = TARGETS_2026.reduce((s, t) => s + t.cityGas, 0) * 0.9;
    expect(fc.est.cityGas).toBeCloseTo(expectedGas, 3);
    expect(fc.months).toBe(6);
    expect(fc.complete).toBe(false);
    const naive = h1_2026.reduce((s, r) => s + r.cityGas, 0) * 2;
    expect(naive / expectedGas).toBeGreaterThan(1.5);
  });
  it('12개월이 모두 입력되면 실적 그대로이다', () => {
    const p = buildSeasonalProfile(records, { beforeYear: 2026 });
    const fc = forecastAnnual(full2025, 2025, p);
    expect(fc.complete).toBe(true);
    const actualGas = full2025.reduce((s, r) => s + r.cityGas, 0);
    expect(fc.est.cityGas).toBeCloseTo(actualGas, 6);
  });
  it('입력이 없으면 null', () => {
    expect(forecastAnnual([], 2026, buildSeasonalProfile([], {}))).toBeNull();
  });
});
