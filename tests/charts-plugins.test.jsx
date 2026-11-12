import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App.jsx';
import { ADMIN_PASSWORD, startServer } from './helpers/server';
import { hasValue, waitForChart } from './helpers/charts';

// Chart.js 는 테스트에서 가짜로 대체되므로, 그래프에 그려 넣는 사용자 플러그인(막대 위 %·미입력 표시·값 라벨)이
// 실제로 오류 없이 실행되는지 가짜 캔버스로 직접 호출해 확인한다.
const recorder = () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([String(k), ...args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, calls };
};
const fakeChart = (rec) => ({
  ctx: rec.ctx,
  chartArea: { top: 20, left: 40, width: 480, height: 220 },
  scales: { x: { getPixelForValue: (i) => 60 + i * 40 } },
  getDatasetMeta: () => ({ data: Array.from({ length: 12 }, (_, i) => ({ x: 60 + i * 40, y: 100 })) }),
});

const rec = (m) => ({ id: `2026-${m}`, year: 2026, month: m, diesel: 100, cityGas: 1000, electricity: 90000, water: 300, revenue: 300 });
const db = () => ({
  availableYears: [2026], records: [rec(1), rec(2), rec(3)],
  targets: { 2026: Array.from({ length: 12 }, () => ({ diesel: 100, cityGas: 1000, electricity: 90000, water: 250 })) },
  planMeta: {}, scenarios: [], closedMonths: {},
});

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'prompt').mockImplementation(() => ADMIN_PASSWORD);
});

describe('그래프 사용자 플러그인', () => {
  it('월별·누적·원단위 그래프 플러그인이 오류 없이 실행되고 라벨을 그린다', async () => {
    globalThis.__chartConfigs = [];
    startServer(db());
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toMatch(/입력된 3개월/)); // 데이터 불러오기가 끝난 뒤의 그래프 설정을 검사
    const withData = (c) => hasValue(c.data.datasets[1].data);
    const monthly = await waitForChart((c) => c.data.datasets[0].label === '월 목표', withData);
    const cumulative = await waitForChart((c) => c.data.datasets[0].label === '누적 목표', withData);
    const intensity = await waitForChart((c) => String(c.data.datasets[0].label || '').startsWith('월별 매출액'), withData);

    // 월별: 미입력 월(4~12월) 음영 + '미입력' 글자(흰 테두리 포함) + 입력된 달의 달성률(%)
    const m = recorder();
    monthly.plugins.forEach((p) => {
      if (p.beforeDatasetsDraw) p.beforeDatasetsDraw(fakeChart(m));
      if (p.afterDatasetsDraw) p.afterDatasetsDraw(fakeChart(m));
    });
    const fillTexts = m.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(fillTexts.filter((t) => t === '미입력').length).toBe(9);
    expect(fillTexts.filter((t) => /%$/.test(t)).length).toBe(3);
    expect(m.calls.filter((c) => c[0] === 'strokeText').length).toBe(12); // 모든 글자에 흰 테두리
    expect(m.calls.filter((c) => c[0] === 'fillRect').length).toBe(9);

    // 누적: 마지막 실적/목표 값 라벨
    const c = recorder();
    cumulative.plugins.forEach((p) => p.afterDatasetsDraw && p.afterDatasetsDraw(fakeChart(c)));
    expect(c.calls.filter((x) => x[0] === 'fillText').length).toBe(2);
    expect(c.calls.filter((x) => x[0] === 'strokeText').length).toBe(2);

    // 원단위: 점 위 값 라벨
    const r = recorder();
    intensity.plugins.forEach((p) => p.afterDatasetsDraw && p.afterDatasetsDraw(fakeChart(r)));
    expect(r.calls.filter((x) => x[0] === 'fillText').length).toBe(3);
    expect(r.calls.filter((x) => x[0] === 'strokeText').length).toBe(3);
  });
});
