import { describe, it, expect } from 'vitest';
import { averageIntensity, buildCumulativeSeries, buildMonthlyChartData } from '../../src/lib/chartData';

const targets = Array.from({ length: 12 }, () => ({ diesel: 100, cityGas: 1000, electricity: 100000, water: 0 }));
const rec = (m, k) => ({ month: m, diesel: 100 * k, cityGas: 1000 * k, electricity: 100000 * k, water: 0, revenue: 100 });
const records = [rec(1, 1.2), rec(2, 1.0), rec(3, 0.8)];

describe('월별 그래프 데이터', () => {
  const rows = buildMonthlyChartData(records, targets, 1, 12, 2026);
  it('12개월 행을 만들고, 미입력 월은 실적이 null이다(0으로 그리지 않음)', () => {
    expect(rows.length).toBe(12);
    expect(rows[2].entered).toBe(true);
    expect(rows[3].entered).toBe(false);
    expect(rows[3].actual).toBeNull();
    expect(rows[3].scope1).toBeNull();
    expect(rows[3].rate).toBeNull();
  });
  it('달성률 = 실적 ÷ 월 목표 × 100', () => {
    expect(rows[0].rate).toBeCloseTo(120, 6);
    expect(rows[1].rate).toBeCloseTo(100, 6);
    expect(rows[2].rate).toBeCloseTo(80, 6);
  });
  it('조회 범위(fromMonth~toMonth)만 만든다', () => {
    const part = buildMonthlyChartData(records, targets, 2, 4, 2026);
    expect(part.map((r) => r.month)).toEqual([2, 3, 4]);
  });
});

describe('누적 곡선', () => {
  const rows = buildMonthlyChartData(records, targets, 1, 12, 2026);
  const cum = buildCumulativeSeries(rows);
  it('누적 목표는 12개월 전체 합계까지 이어진다', () => {
    expect(cum[11].targetCum).toBeCloseTo(rows.reduce((s, r) => s + r.target, 0), 9);
    expect(cum[0].targetCum).toBeCloseTo(rows[0].target, 9);
  });
  it('누적 실적은 입력된 달까지만 이어지고 이후는 null이다', () => {
    expect(cum[2].actualCum).toBeCloseTo(rows[0].actual + rows[1].actual + rows[2].actual, 9);
    expect(cum[3].actualCum).toBeNull();
    expect(cum[11].actualCum).toBeNull();
  });
});

describe('평균 원단위', () => {
  it('값이 있는 달만 평균한다', () => {
    expect(averageIntensity([{ intensity: 0.2 }, { intensity: null }, { intensity: 0.4 }])).toBeCloseTo(0.3, 9);
    expect(averageIntensity([{ intensity: null }])).toBeNull();
  });
});
