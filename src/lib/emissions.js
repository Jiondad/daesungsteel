import { EMISSION_FACTORS_BY_YEAR } from './constants';

// diesel: tCO2e/L, cityGas: tCO2e/Nm³, electricity: tCO2e/kWh, water: tCO2e/TON (Scope 3, 총량 제외)
export function getFactors(year) {
  const years = Object.keys(EMISSION_FACTORS_BY_YEAR).map(Number).sort((a, b) => a - b);
  const y = Number(year);
  let pick = years[0];
  for (const k of years) { if (k <= y) pick = k; }
  return EMISSION_FACTORS_BY_YEAR[pick];
}

// 계산은 원값으로 수행하고 반올림은 화면 표시 단계에서만 한다(월별 합산 시 오차 누적 방지).
export function calculateEmissions(diesel, cityGas, electricity, year = 2026) {
  const f = getFactors(year);
  const s1Diesel = (Number(diesel) || 0) * f.diesel;
  const s1Gas = (Number(cityGas) || 0) * f.cityGas;
  const s2Elec = (Number(electricity) || 0) * f.electricity;
  return {
    scope1: s1Diesel + s1Gas,
    scope2: s2Elec,
    total: s1Diesel + s1Gas + s2Elec,
  };
}

// 실적이 실제로 입력된 달인지 판단(핵심 3개 에너지 중 하나라도 0 초과). 빈 레코드/전부 0인 레코드는 미입력으로 본다.
export const isEntered = (r) => !!r && ((Number(r.diesel) || 0) > 0 || (Number(r.cityGas) || 0) > 0 || (Number(r.electricity) || 0) > 0);

// --- HELPER FOR NUMBER FORMATTING ---
export const formatVal = (val, decimals = 2) => {
  if (val === undefined || val === null || isNaN(val)) {
    return (0).toFixed(decimals);
  }
  return Number(Number(val).toFixed(decimals)).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

