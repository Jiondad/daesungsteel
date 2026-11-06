import { describe, it, expect } from 'vitest';
import { getFactors, calculateEmissions, isEntered } from '../../src/lib/emissions';
import { TARGETS_2026 } from '../../src/lib/constants';

describe('배출량 계산', () => {
  it('2025 기준 활동량이 공식 기준값 579.116 tCO2e(S1 92.720 / S2 486.396)를 재현한다', () => {
    const e = calculateEmissions(4847.561, 37576.327, 1058763.605, 2025);
    expect(e.scope1).toBeCloseTo(92.72, 3);
    expect(e.scope2).toBeCloseTo(486.396, 3);
    expect(e.total).toBeCloseTo(579.116, 3);
  });

  it('연도별 계수: 표에 없는 연도는 이전 가장 가까운 연도, 더 이른 연도는 가장 이른 연도 값을 쓴다', () => {
    expect(getFactors(2030).electricity).toBe(getFactors(2026).electricity);
    expect(getFactors(2020).electricity).toBe(getFactors(2024).electricity);
  });

  it('항목별 반올림 없이 계산한다(월별 합산 오차 누적 방지)', () => {
    const monthly = TARGETS_2026.map((t) => calculateEmissions(t.diesel, t.cityGas, t.electricity, 2026).total);
    const sumMonthly = monthly.reduce((a, b) => a + b, 0);
    const annual = calculateEmissions(
      TARGETS_2026.reduce((s, t) => s + t.diesel, 0),
      TARGETS_2026.reduce((s, t) => s + t.cityGas, 0),
      TARGETS_2026.reduce((s, t) => s + t.electricity, 0),
      2026
    ).total;
    expect(sumMonthly).toBeCloseTo(annual, 9);
  });

  it('빈 값/문자열은 0으로 취급한다', () => {
    const e = calculateEmissions('', undefined, '100', 2026);
    expect(e.scope1).toBe(0);
    expect(e.scope2).toBeGreaterThan(0);
  });

  it('isEntered: 전부 0이거나 빈 값이면 미입력, 하나라도 0 초과면 입력', () => {
    expect(isEntered({ diesel: 0, cityGas: 0, electricity: 0 })).toBe(false);
    expect(isEntered({ diesel: '', cityGas: '', electricity: '' })).toBe(false);
    expect(isEntered({ diesel: 0, cityGas: 0, electricity: 5 })).toBe(true);
    expect(isEntered(null)).toBe(false);
  });
});
