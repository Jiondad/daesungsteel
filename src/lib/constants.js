// --- EMISSION FACTORS (연도별 관리) ---
// 배출계수는 매년 고시가 갱신되므로 연도별로 보관하고, 계산은 해당 연도의 값을 사용한다.
// ※ 현재 2024~2026 값이 동일하다. 연도별 공식 고시값/출처를 확인해 이 표만 교체하면 된다.
//   해당 연도가 표에 없으면 그 이전 가장 가까운 연도 값을 사용한다.
export const EMISSION_FACTORS_BY_YEAR = {
  2024: { diesel: 0.002624, cityGas: 0.002129, electricity: 0.0004594, water: 0.000237 },
  2025: { diesel: 0.002624, cityGas: 0.002129, electricity: 0.0004594, water: 0.000237 },
  2026: { diesel: 0.002624, cityGas: 0.002129, electricity: 0.0004594, water: 0.000237 },
};

export const TARGETS_2026 = [
  { diesel: 99, cityGas: 7565, electricity: 93242, water: 277 },
  { diesel: 530, cityGas: 9173, electricity: 94822, water: 419 },
  { diesel: 441, cityGas: 9065, electricity: 88970, water: 397 },
  { diesel: 691, cityGas: 5982, electricity: 83787, water: 366 },
  { diesel: 452, cityGas: 1860, electricity: 68539, water: 238 },
  { diesel: 487, cityGas: 941, electricity: 70912, water: 226 },
  { diesel: 684, cityGas: 537, electricity: 84655, water: 260 },
  { diesel: 638, cityGas: 425, electricity: 79401, water: 234 },
  { diesel: 582, cityGas: 369, electricity: 87577, water: 254 },
  { diesel: 582, cityGas: 739, electricity: 70004, water: 247 },
  { diesel: 532, cityGas: 1517, electricity: 82935, water: 238 },
  { diesel: 1094, cityGas: 3387, electricity: 100981, water: 240 },
];

export const DAESUNG_SEASONAL_TARGETS = [
  { diesel: 36, cityGas: 2764, electricity: 34583, water: 89 },
  { diesel: 191, cityGas: 3302, electricity: 34136, water: 135 },
  { diesel: 159, cityGas: 3263, electricity: 32029, water: 128 },
  { diesel: 249, cityGas: 2154, electricity: 30163, water: 118 },
  { diesel: 163, cityGas: 670, electricity: 24674, water: 77 },
  { diesel: 175, cityGas: 339, electricity: 25528, water: 73 },
  { diesel: 246, cityGas: 193, electricity: 30476, water: 84 },
  { diesel: 230, cityGas: 153, electricity: 28584, water: 75 },
  { diesel: 210, cityGas: 133, electricity: 31528, water: 82 },
  { diesel: 210, cityGas: 266, electricity: 25201, water: 80 },
  { diesel: 192, cityGas: 546, electricity: 29857, water: 77 },
  { diesel: 394, cityGas: 1219, electricity: 36353, water: 77 }
];

export const ROADMAP_TARGETS = [
  { year: 2025, target: 579.116, scope1: 92.720, scope2: 486.396, label: "기준(2025)" },
  { year: 2026, target: 568.698, scope1: 106.622, scope2: 462.076, label: "2026목표" },
  { year: 2027, target: 542.395, label: "2027목표" },
  { year: 2028, target: 517.345, label: "2028목표" },
  { year: 2029, target: 493.483, label: "2029목표" },
  { year: 2030, target: 470.756, label: "2030목표" },
];

// =====================================================================
// [2단계] 로드맵 · 계절 보정 · 연간 계획 자동 수립 (공용 로직)
// =====================================================================
export const PLAN_KEYS = ['diesel', 'cityGas', 'electricity', 'water'];

export const ROADMAP_BASE_YEAR = 2025;

export const ROADMAP_YEARS = ROADMAP_TARGETS.map(r => r.year);

// 공식 기준값(2025, 579.116 tCO2e)을 재현하는 활동량 (S1 92.720 / S2 486.396)
export const ROADMAP_BASELINE_ACTIVITY = { diesel: 4847.561, cityGas: 37576.327, electricity: 1058763.605 };

// --- APP CONTAINER COMPONENT ---

export const GOOGLE_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwjl3TGSLMD7e3R7MwO14rYuX_7JKZaSXX_Rd5Jf25hGrovGNX4YD4mUroBiE9UbRcJ/exec";


// 목표 수립 방식 적용 시작 연도.
// 이 연도부터는 '공식 로드맵 목표 + 계절 보정 자동 수립'을 적용할 수 있고(연도 등록 시 자동 생성),
// 그 이전 연도는 기존 방식(저장된 월별 목표를 그대로 유지)을 따른다.
// ※ 값만 바꾸면 적용 시점이 바뀐다. 이미 저장된 목표는 관리자가 [자동 수립]→[저장]하기 전까지 바뀌지 않는다.
export const PLAN_METHOD_START_YEAR = 2026;
