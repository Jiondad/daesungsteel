import { TARGETS_2026 } from './constants';
import { calculateEmissions } from './emissions';

// 월별 실적·목표 데이터. 미입력 월은 entered=false, 실적 값은 null(0으로 그리지 않음).
export function buildMonthlyChartData(yearRecords, yearTargets, fromMonth, toMonth, year) {
  const rows = [];
  for (let m = fromMonth; m <= toMonth; m++) {
    const target = yearTargets[m - 1] || yearTargets[0] || TARGETS_2026[0];
    const record = yearRecords.find((r) => r.month === m);
    const targetEm = calculateEmissions(target.diesel, target.cityGas, target.electricity, year);
    const actualEm = record ? calculateEmissions(record.diesel, record.cityGas, record.electricity, year) : null;
    rows.push({
      month: m,
      entered: !!record,
      scope1: actualEm ? actualEm.scope1 : null,
      scope2: actualEm ? actualEm.scope2 : null,
      actual: actualEm ? actualEm.total : null,
      target: targetEm.total,
      rate: actualEm && targetEm.total > 0 ? (actualEm.total / targetEm.total) * 100 : null,
    });
  }
  return rows;
}

// 누적 곡선: 누적 목표는 선택 기간 전체, 누적 실적은 입력된 달에서만 이어서 그린다.
export function buildCumulativeSeries(monthly) {
  let tCum = 0;
  let aCum = 0;
  return monthly.map((d) => {
    tCum += d.target;
    if (d.entered) aCum += d.actual;
    return { month: d.month, entered: d.entered, targetCum: tCum, actualCum: d.entered ? aCum : null };
  });
}

// 평균 원단위(입력·매출이 있는 달만)
export function averageIntensity(rows) {
  const vals = rows.filter((r) => r.intensity !== null && r.intensity !== undefined).map((r) => r.intensity);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
