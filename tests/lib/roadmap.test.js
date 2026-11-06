import { describe, it, expect } from 'vitest';
import { computeRoadmapScenario, rampShare } from '../../src/lib/roadmap';

const zero = { amount: 0, start: 2027, full: 2030 };
const noLevers = () => ({ eff: { ...zero }, gas: { ...zero }, ev: { ...zero }, solar: { ...zero }, rec: { ...zero } });
const params = { bauGrowth: 0, solarYield: 1200, evKwhPerL: 3.5 };

describe('로드맵 시나리오', () => {
  it('기준연도(2025)는 공식 기준값 579.116을 재현한다', () => {
    expect(computeRoadmapScenario(2025, params, noLevers()).total).toBeCloseTo(579.116, 3);
  });
  it('감축 수단이 모두 0이면 시나리오는 무조치(BAU)와 같다', () => {
    const s = computeRoadmapScenario(2030, params, noLevers());
    expect(s.total).toBeCloseTo(s.bau.total, 9);
  });
  it('도입 일정: 시작연도 이전에는 효과가 없고 이후 점진적으로 늘어난다', () => {
    const lv = noLevers(); lv.solar.amount = 200;
    const base = (y) => computeRoadmapScenario(y, params, noLevers()).total;
    expect(computeRoadmapScenario(2026, params, lv).total).toBeCloseTo(base(2026), 9);
    const d27 = base(2027) - computeRoadmapScenario(2027, params, lv).total;
    const d30 = base(2030) - computeRoadmapScenario(2030, params, lv).total;
    expect(d27).toBeGreaterThan(0);
    expect(d30).toBeGreaterThan(d27);
    expect(rampShare(2030, 2027, 2030)).toBe(1);
  });
  it('태양광은 구매전력 한도까지만 감축한다(과대 입력해도 Scope 2가 음수가 되지 않음)', () => {
    const lv = noLevers(); lv.solar.amount = 5_000_000;
    const s = computeRoadmapScenario(2030, params, lv);
    expect(s.scope2).toBeGreaterThanOrEqual(0);
    expect(s.remainingElec).toBe(0);
    expect(s.solarCurtailed).toBeGreaterThan(0);
  });
  it('경유 전동화는 Scope 1을 줄이고 늘어난 전력(Scope 2)을 반영한다', () => {
    const lv = noLevers(); lv.ev.amount = 100;
    const s = computeRoadmapScenario(2030, params, lv);
    const b = computeRoadmapScenario(2030, params, noLevers());
    expect(s.scope1).toBeLessThan(b.scope1);
    expect(s.scope2).toBeGreaterThan(b.scope2);
  });
  it('재생에너지 구매는 시장기반만 줄이고 위치기반 총량은 바꾸지 않는다', () => {
    const lv = noLevers(); lv.rec.amount = 300_000;
    const s = computeRoadmapScenario(2030, params, lv);
    expect(s.total).toBeCloseTo(s.bau.total, 9);
    expect(s.totalMarket).toBeLessThan(s.total);
  });
});
