import { ROADMAP_BASELINE_ACTIVITY, ROADMAP_BASE_YEAR } from './constants';
import { getFactors } from './emissions';

// 도입 일정: 시작연도에 첫 비율, 완료연도에 100%
export function rampShare(year, start, full) {
  const s = Number(start);
  const f = Math.max(Number(full), s);
  if (year < s) return 0;
  return Math.min(1, (year - s + 1) / (f - s + 1));
}

// 로드맵 시나리오 계산(연도별). 적용 순서: BAU → 효율 개선 → 전동화 → 자가태양광 → (시장기반)재생에너지 구매
export function computeRoadmapScenario(year, params, levers) {
  const base = ROADMAP_BASELINE_ACTIVITY;
  const f = getFactors(year);
  const g = (Number(params.bauGrowth) || 0) / 100;
  const k = Math.pow(1 + g, year - ROADMAP_BASE_YEAR);
  const act = { diesel: base.diesel * k, cityGas: base.cityGas * k, electricity: base.electricity * k };
  const bauS1 = act.diesel * f.diesel + act.cityGas * f.cityGas;
  const bauS2 = act.electricity * f.electricity;
  const bau = { scope1: bauS1, scope2: bauS2, total: bauS1 + bauS2 };

  const L = (id) => ({
    amt: Math.max(0, Number(levers[id].amount) || 0),
    r: year <= ROADMAP_BASE_YEAR ? 0 : rampShare(year, levers[id].start, levers[id].full),
  });
  const eff = L('eff'), gas = L('gas'), ev = L('ev'), solar = L('solar'), rec = L('rec');

  const elecEff = act.electricity * (1 - Math.min(eff.amt, 100) / 100 * eff.r);
  const gasEff = act.cityGas * (1 - Math.min(gas.amt, 100) / 100 * gas.r);
  const dieselConv = act.diesel * Math.min(ev.amt, 100) / 100 * ev.r;
  const diesel1 = act.diesel - dieselConv;
  const elec2 = elecEff + dieselConv * (Number(params.evKwhPerL) || 0);
  const solarGen = solar.amt * (Number(params.solarYield) || 0) * solar.r;
  const solarUsed = Math.min(solarGen, elec2);
  const elec3 = elec2 - solarUsed;
  const recKwh = Math.min(rec.amt * rec.r, elec3);

  const scope1 = diesel1 * f.diesel + gasEff * f.cityGas;
  const scope2 = elec3 * f.electricity;
  const scope2Market = (elec3 - recKwh) * f.electricity;
  return {
    year, bau, scope1, scope2, total: scope1 + scope2,
    scope2Market, totalMarket: scope1 + scope2Market,
    solarCurtailed: solarGen - solarUsed, remainingElec: elec3, factorElec: f.electricity,
  };
}

