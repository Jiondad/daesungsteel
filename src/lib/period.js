import { TARGETS_2026 } from './constants';
import { calculateEmissions } from './emissions';

// 선택 기간(fromMonth~toMonth)의 실적과 목표를 집계한다.
// 핵심 원칙: 목표는 '실적이 입력된 달까지만' 누적해 같은 기간끼리 비교한다.
// (기간 전체 목표는 targetFull* 로 따로 제공 — 미입력 월이 있을 때 실적이 목표보다 적어 보이는 착시 방지)
export function computePeriodStats(yearRecords, yearTargets, fromMonth, toMonth, year) {
  const a = { diesel: 0, cityGas: 0, electricity: 0, water: 0, revenue: 0 };
  const t = { diesel: 0, cityGas: 0, electricity: 0, water: 0 };
  const f = { diesel: 0, cityGas: 0, electricity: 0, water: 0 };
  const activeMonthsList = [];
  const missingMonths = [];

  for (let m = fromMonth; m <= toMonth; m++) {
    const target = yearTargets[m - 1] || yearTargets[0] || TARGETS_2026[0];
    const record = yearRecords.find((r) => r.month === m);

    ['diesel', 'cityGas', 'electricity', 'water'].forEach((k) => { f[k] += target[k] || 0; });

    if (record) {
      ['diesel', 'cityGas', 'electricity', 'water'].forEach((k) => {
        a[k] += record[k] || 0;
        t[k] += target[k] || 0;
      });
      a.revenue += record.revenue || 0;
      activeMonthsList.push(m);
    } else {
      missingMonths.push(m);
    }
  }

  const actualEm = calculateEmissions(a.diesel, a.cityGas, a.electricity, year);
  const targetEm = calculateEmissions(t.diesel, t.cityGas, t.electricity, year);
  const fullEm = calculateEmissions(f.diesel, f.cityGas, f.electricity, year);

  return {
    actualDiesel: a.diesel,
    actualCityGas: a.cityGas,
    actualElectricity: a.electricity,
    actualWater: a.water,
    actualRevenue: a.revenue,
    targetDiesel: t.diesel,
    targetCityGas: t.cityGas,
    targetElectricity: t.electricity,
    targetWater: t.water,
    actualScope1: actualEm.scope1,
    actualScope2: actualEm.scope2,
    actualTotal: actualEm.total,
    targetScope1: targetEm.scope1,
    targetScope2: targetEm.scope2,
    targetTotal: targetEm.total,
    targetFullScope1: fullEm.scope1,
    targetFullScope2: fullEm.scope2,
    targetFullTotal: fullEm.total,
    activeMonthsCount: activeMonthsList.length,
    activeMonthsList,
    missingMonths,
    intensity: a.revenue > 0 ? actualEm.total / a.revenue : 0,
  };
}

// 연간 목표 합계(12개월 전체)
export function computeAnnualTarget(yearTargets, year) {
  let d = 0, g = 0, e = 0;
  for (let m = 0; m < 12; m++) {
    const t = yearTargets[m] || TARGETS_2026[m];
    d += t.diesel || 0;
    g += t.cityGas || 0;
    e += t.electricity || 0;
  }
  return calculateEmissions(d, g, e, year);
}

// 증감률(%) — 목표 대비
export function pctDiff(actual, target) {
  return target > 0 ? ((actual - target) / target) * 100 : 0;
}
