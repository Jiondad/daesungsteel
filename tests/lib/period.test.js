import { describe, it, expect } from 'vitest';
import { computePeriodStats, computeAnnualTarget, pctDiff } from '../../src/lib/period';

// 실제 화면(2026년)의 월별 목표와 1~9월 실적
const targets = [
  [100, 7565, 95205], [531, 9173, 96819], [441, 9065, 90843], [692, 5982, 85551], [452, 1860, 69982], [488, 941, 72405],
  [685, 537, 86438], [638, 425, 81073], [533, 369, 89420], [582, 739, 71477], [533, 1517, 84681], [1094, 3387, 103107],
].map(([diesel, cityGas, electricity]) => ({ diesel, cityGas, electricity, water: 0 }));
const actual = [
  [505.2, 7063, 107091], [561.84, 5638, 112209], [289.21, 4309, 93120], [640.06, 1378, 104674], [746.87, 746, 90912],
  [754.45, 481, 82608], [476.51, 453, 92368], [442.31, 406, 96264], [0, 507, 82172],
].map(([diesel, cityGas, electricity], i) => ({ month: i + 1, diesel, cityGas, electricity, water: 0, revenue: 0 }));

describe('기간 집계: 입력된 달까지만 목표를 누적해 같은 기간끼리 비교', () => {
  const s = computePeriodStats(actual, targets, 1, 12, 2026);

  it('12개월 범위에서 9개월만 입력됐으면 입력월 9, 미입력 월은 10~12월', () => {
    expect(s.activeMonthsCount).toBe(9);
    expect(s.missingMonths).toEqual([10, 11, 12]);
  });
  it('동일 기간(1~9월) 누적 목표는 441.13 t, 기간 전체(12개월) 목표는 578.05 t', () => {
    expect(s.targetTotal).toBeCloseTo(441.13, 1);
    expect(s.targetFullTotal).toBeCloseTo(578.05, 1);
  });
  it('실적 451.99 t는 같은 기간 목표보다 약 2.5% 많다(12개월 목표 대비 78.2%로 보이던 착시 제거)', () => {
    expect(s.actualTotal).toBeCloseTo(451.99, 1);
    expect(pctDiff(s.actualTotal, s.targetTotal)).toBeCloseTo(2.5, 1);
    expect(s.actualTotal / s.targetFullTotal).toBeLessThan(0.8);
  });
  it('Scope별 방향이 다르다: Scope 1은 −36%, Scope 2는 +12%', () => {
    expect(pctDiff(s.actualScope1, s.targetScope1)).toBeCloseTo(-36.4, 1);
    expect(pctDiff(s.actualScope2, s.targetScope2)).toBeCloseTo(12.2, 1);
  });
  it('연간 목표 합계는 기간 전체 목표와 같다', () => {
    expect(computeAnnualTarget(targets, 2026).total).toBeCloseTo(s.targetFullTotal, 9);
  });
  it('입력이 없으면 실적 0, 목표 누적 0이다', () => {
    const e = computePeriodStats([], targets, 1, 12, 2026);
    expect(e.activeMonthsCount).toBe(0);
    expect(e.targetTotal).toBe(0);
    expect(e.targetFullTotal).toBeGreaterThan(0);
  });
});
