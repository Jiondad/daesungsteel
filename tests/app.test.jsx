import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App } from '../src/App.jsx';
import { TARGETS_2026 } from '../src/lib/constants';

// 관리자 PIN은 소스에서 읽어 사용(테스트 코드에 직접 적지 않음)
const pinFromSource = () => {
  const src = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
  const m = src.match(/\[([\d,\s]+)\]\.map\(c => String\.fromCharCode\(c\)\)/);
  return m[1].split(',').map((n) => String.fromCharCode(Number(n.trim()))).join('');
};

const rec = (y, m, k = 1) => ({
  id: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m,
  diesel: Math.round(TARGETS_2026[m - 1].diesel * k), cityGas: Math.round(TARGETS_2026[m - 1].cityGas * k),
  electricity: Math.round(TARGETS_2026[m - 1].electricity * k), water: 100, revenue: null,
});
const baseDb = () => ({
  availableYears: [2026, 2025, 2024],
  records: [...Array.from({ length: 12 }, (_, i) => rec(2025, i + 1, 0.95)), ...Array.from({ length: 4 }, (_, i) => rec(2026, i + 1, 0.9))],
  targets: {}, planMeta: {},
});

let saves;
const mockServer = (loadResponse) => {
  saves = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.action === 'save') { saves.push(JSON.parse(body.data)); return { json: async () => ({ result: 'success' }) }; }
    return { json: async () => loadResponse };
  }));
};
const okLoad = (db = baseDb()) => ({ result: 'success', data: JSON.stringify(db) });

const loaded = () => waitFor(() => expect(screen.getAllByRole('button').some((b) => b.textContent.includes('실적 입력'))).toBe(true));
const clickBtn = (text) => fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent.includes(text)));
const numberInputs = () => [...document.querySelectorAll('input[type=number]')];
const yearBtn = () => document.querySelector('button[aria-haspopup="dialog"]');

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockImplementation(() => pinFromSource());
});

describe('데이터 로드/저장 안전장치', () => {
  it('서버 오류 응답이면 오류 배너를 띄우고 저장을 차단한다(기존 DB 덮어쓰기 방지)', async () => {
    mockServer({ result: 'error' });
    render(<App />);
    await screen.findByText(/불러오지 못했습니다/);
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    ['10', '10', '10'].forEach((v, i) => fireEvent.change(numberInputs()[i], { target: { value: v } }));
    clickBtn('저장');
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls.at(-1)[0]).toMatch(/불러오지 못한 상태/);
    expect(saves.length).toBe(0);
  });

  it('최초 사용(빈 DB)에서는 가상 데이터를 만들거나 자동 저장하지 않는다', async () => {
    mockServer({ result: 'success', data: null });
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toContain('온실가스'));
    await new Promise((r) => setTimeout(r, 200));
    expect(saves.length).toBe(0);
    expect(document.body.textContent).not.toMatch(/불러오지 못했습니다/);
  });
});

describe('실적 입력', () => {
  it('값을 입력한 달은 경유·도시가스·전력을 모두 적어야 하고, 빈 달은 레코드로 저장되지 않는다', async () => {
    mockServer(okLoad({ ...baseDb(), records: [rec(2026, 1), rec(2026, 2)] }));
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    fireEvent.change(numberInputs()[5 * 5 + 2], { target: { value: '70000' } });
    clickBtn('저장');
    await screen.findByText(/6월 경유, 도시가스 값이 비어/);
    expect(saves.length).toBe(0);
    fireEvent.change(numberInputs()[5 * 5], { target: { value: '0' } });
    fireEvent.change(numberInputs()[5 * 5 + 1], { target: { value: '0' } });
    clickBtn('저장');
    await waitFor(() => expect(saves.length).toBe(1));
    const months = saves[0].records.filter((r) => r.year === 2026).map((r) => r.month);
    expect(months).toEqual([1, 2, 6]);
  });
});

describe('달력형 연도 선택기', () => {
  it('등록된 연도만 선택 가능하고, 선택하면 반영되며 Esc/바깥 클릭으로 닫힌다', async () => {
    mockServer(okLoad());
    render(<App />);
    await loaded();
    expect(yearBtn().textContent).toContain('2026년');
    fireEvent.click(yearBtn());
    const dlg = screen.getByRole('dialog');
    const cells = within(dlg).getAllByRole('button').filter((b) => /^\d{4}$/.test(b.textContent));
    expect(cells.length).toBe(12);
    const cell = (y) => cells.find((c) => c.textContent === String(y));
    expect(cell(2025).disabled).toBe(false);
    expect(cell(2027).disabled).toBe(true);
    fireEvent.click(cell(2025));
    expect(yearBtn().textContent).toContain('2025년');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(yearBtn());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(yearBtn());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('로드맵 시뮬레이터', () => {
  it('공식 목표를 고정 표시하고 감축 수단 입력이 결과에 반영된다', async () => {
    mockServer(okLoad());
    render(<App />);
    await loaded();
    clickBtn('로드맵');
    await screen.findByText(/감축 로드맵 시뮬레이터/);
    expect(document.body.textContent).toContain('470.756');
    expect(document.body.textContent).toContain('579.116');
    expect(document.body.textContent).toMatch(/목표 미달/);
    fireEvent.change(numberInputs()[3], { target: { value: '2000' } });
    await waitFor(() => expect(document.body.textContent).toMatch(/목표 달성/));
    expect(document.body.textContent).toMatch(/4개월 입력, 예상/);
  });
});

describe('목표 설정: 계절 보정 자동 수립', () => {
  it('초안을 만들고 저장하면 수립 근거(planMeta)가 함께 저장된다', async () => {
    mockServer(okLoad());
    render(<App />);
    await loaded();
    clickBtn('목표 설정');
    await screen.findByText(/계절 보정 연간 계획 자동 수립/);
    expect(numberInputs()[0].value).toBe('106.622');
    clickBtn('자동 수립');
    await screen.findByText(/초안 합계/);
    fireEvent.submit([...document.querySelectorAll('form')].pop());
    await waitFor(() => expect(saves.length).toBe(1));
    const meta = saves[0].planMeta[2026];
    expect(meta.scope1Target).toBeCloseTo(106.622, 3);
    expect(meta.scope2Target).toBeCloseTo(462.076, 3);
    expect(meta.seasonalBasis).toMatch(/2025/);
    expect(meta.targetSource).toBe('공식 로드맵 목표');
    expect(meta.manuallyEdited).toBe(false);
    expect(Boolean(meta.savedAt)).toBe(true);
    const monthly = saves[0].targets[2026];
    expect(monthly.reduce((a, t) => a + t.electricity, 0)).toBe(Math.round(462.076 / 0.0004594));
  });
});

// ===== 실제 화면(2026년 1~9월 입력, 10~12월은 예전 방식으로 저장된 0 레코드) 재현 =====
const T26 = [
  [100, 7565, 95205], [531, 9173, 96819], [441, 9065, 90843], [692, 5982, 85551], [452, 1860, 69982], [488, 941, 72405],
  [685, 537, 86438], [638, 425, 81073], [533, 369, 89420], [582, 739, 71477], [533, 1517, 84681], [1094, 3387, 103107],
].map(([diesel, cityGas, electricity]) => ({ diesel, cityGas, electricity, water: 0 }));
const A26 = [
  [505.2, 7063, 107091], [561.84, 5638, 112209], [289.21, 4309, 93120], [640.06, 1378, 104674], [746.87, 746, 90912],
  [754.45, 481, 82608], [476.51, 453, 92368], [442.31, 406, 96264], [0, 507, 82172],
];
const realisticDb = () => ({
  availableYears: [2026, 2025, 2024],
  records: [
    ...A26.map(([diesel, cityGas, electricity], i) => ({ id: `2026-${i + 1}`, year: 2026, month: i + 1, diesel, cityGas, electricity, water: 300, revenue: 300 })),
    ...[10, 11, 12].map((m) => ({ id: `2026-${m}`, year: 2026, month: m, diesel: 0, cityGas: 0, electricity: 0, water: 0, revenue: 0 })),
  ],
  targets: { 2026: T26 }, planMeta: {},
});

describe('대시보드 판단(같은 기간 비교)', () => {
  it('9개월 입력 시 12개월 목표가 아니라 같은 기간 누적 목표와 비교하고, Scope별 증감을 보여준다', async () => {
    mockServer(okLoad(realisticDb()));
    render(<App />);
    await loaded();
    await waitFor(() => expect(document.body.textContent).toMatch(/입력된 9개월/));
    const text = document.body.textContent;
    expect(text).toMatch(/9 \/ 12 개월/);
    expect(text).toMatch(/보다 .*많습니다/);
    expect(text).toContain('+2.5%');
    expect(text).toContain('Scope 1: 실적');
    expect(text).toMatch(/\(−36\.4%\)/);
    expect(text).toMatch(/\(\+12\.2%\)/);
    expect(text).toMatch(/미입력 10월~12월/);
    expect(text).not.toMatch(/안정적으로 유지/);
    expect(text).not.toMatch(/의무 감축 로드맵 준수/);
  });
});

describe('실적 입력: 예전 방식으로 저장된 0 레코드 정리', () => {
  it('미입력 월은 0이 아닌 빈 칸으로 보이고, 저장하면 0 레코드는 남지 않는다', async () => {
    mockServer(okLoad(realisticDb()));
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    expect(numberInputs()[9 * 5].value).toBe('');       // 10월 경유
    expect(numberInputs()[11 * 5 + 2].value).toBe('');  // 12월 전력
    expect(numberInputs()[8 * 5].value).toBe('0');      // 9월 경유(실제 입력된 0)
    clickBtn('저장');
    await waitFor(() => expect(saves.length).toBe(1));
    const months = saves[0].records.filter((r) => r.year === 2026).map((r) => r.month);
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
