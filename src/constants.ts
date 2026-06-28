/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EmissionFactor, MonthlyTarget, RoadmapTarget } from './types';

// 대한민국 온실가스 배출권거래제 및 환경부 가이드라인 기준 대성스틸 적용 배출계수
export const EMISSION_FACTORS: EmissionFactor = {
  diesel: 0.0025822,      // tCO2e / L (경유: 2.5822 kg CO2e / L)
  cityGas: 0.0021952,     // tCO2e / Nm³ (도시가스/LNG: 2.1952 kg CO2e / Nm³)
  electricity: 0.0004687, // tCO2e / kWh (구매전력 Scope 2: 0.4687 kg CO2e / kWh)
  water: 0.000237,        // tCO2e / TON (수도: 0.237 kg CO2e / TON - 전사 Scope 1+2 총합에서는 제외)
};

// 2026년 월별 KPI Run-rate 목표 데이터 (대성스틸 제공 마스터 데이터)
export const TARGETS_2026: MonthlyTarget[] = [
  { diesel: 99, cityGas: 7565, electricity: 93242, water: 277 },     // 1월 (index 0)
  { diesel: 530, cityGas: 9173, electricity: 94822, water: 419 },    // 2월 (index 1)
  { diesel: 441, cityGas: 9065, electricity: 88970, water: 397 },    // 3월 (index 2)
  { diesel: 691, cityGas: 5982, electricity: 83787, water: 366 },    // 4월 (index 3)
  { diesel: 452, cityGas: 1860, electricity: 68539, water: 238 },    // 5월 (index 4)
  { diesel: 487, cityGas: 941, electricity: 70912, water: 226 },     // 6월 (index 5)
  { diesel: 684, cityGas: 537, electricity: 84655, water: 260 },     // 7월 (index 6)
  { diesel: 638, cityGas: 425, electricity: 79401, water: 234 },     // 8월 (index 7)
  { diesel: 582, cityGas: 369, electricity: 87577, water: 254 },     // 9월 (index 8)
  { diesel: 582, cityGas: 739, electricity: 70004, water: 247 },     // 10월 (index 9)
  { diesel: 532, cityGas: 1517, electricity: 82935, water: 238 },    // 11월 (index 10)
  { diesel: 1094, cityGas: 3387, electricity: 100981, water: 240 },  // 12월 (index 11)
];

// 2030 중기 저감 로드맵 타겟 (tCO2e)
export const ROADMAP_TARGETS: RoadmapTarget[] = [
  { year: 2025, target: 579.116, scope1: 92.720, scope2: 486.396, label: "기준(2025)" },
  { year: 2026, target: 568.698, scope1: 106.622, scope2: 462.076, label: "2026목표" },
  { year: 2027, target: 542.395, label: "2027목표" },
  { year: 2028, target: 517.345, label: "2028목표" },
  { year: 2029, target: 493.483, label: "2029목표" },
  { year: 2030, target: 470.756, label: "2030목표" },
];

/**
 * 계산 함수: 개별 사용량을 온실가스 배출량(tCO2e)으로 변환
 * @param diesel 경유 사용량 (L)
 * @param cityGas 도시가스 사용량 (Nm³)
 * @param electricity 전력 사용량 (kWh)
 */
export function calculateEmissions(diesel: number, cityGas: number, electricity: number) {
  const s1Diesel = diesel * EMISSION_FACTORS.diesel;
  const s1Gas = cityGas * EMISSION_FACTORS.cityGas;
  const s2Elec = electricity * EMISSION_FACTORS.electricity;
  
  const scope1 = s1Diesel + s1Gas;
  const scope2 = s2Elec;
  const total = scope1 + scope2;
  
  return {
    scope1,
    scope2,
    total,
  };
}

/**
 * 계산 함수: 수도 사용량에 따른 별도 온실가스 계산 (TON)
 * (전사 총합 Scope1+2 에는 제외)
 */
export function calculateWaterEmissions(water: number) {
  return water * EMISSION_FACTORS.water;
}
