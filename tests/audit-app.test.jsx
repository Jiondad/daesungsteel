import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../src/lib/exportWorkbook', () => ({
  downloadWorkbook: vi.fn(async () => {}),
  downloadJson: vi.fn(),
  buildWorkbookBuffer: vi.fn(),
}));

import { App } from '../src/App.jsx';
import { downloadJson, downloadWorkbook } from '../src/lib/exportWorkbook';
import { ADMIN_PASSWORD, startServer } from './helpers/server';

const T26 = [
  [100, 7565, 95205], [531, 9173, 96819], [441, 9065, 90843], [692, 5982, 85551], [452, 1860, 69982], [488, 941, 72405],
  [685, 537, 86438], [638, 425, 81073], [533, 369, 89420], [582, 739, 71477], [533, 1517, 84681], [1094, 3387, 103107],
].map(([diesel, cityGas, electricity]) => ({ diesel, cityGas, electricity, water: 0 }));
const A26 = [
  [505.2, 7063, 107091], [561.84, 5638, 112209], [289.21, 4309, 93120], [640.06, 1378, 104674], [746.87, 746, 90912],
  [754.45, 481, 82608], [476.51, 453, 92368], [442.31, 406, 96264], [0, 507, 82172],
];
const baseDb = () => ({
  availableYears: [2026, 2025, 2024],
  records: [
    ...A26.map(([diesel, cityGas, electricity], i) => ({ id: `2026-${i + 1}`, year: 2026, month: i + 1, diesel, cityGas, electricity, water: 300, revenue: 300 })),
    ...[10, 11, 12].map((m) => ({ id: `2026-${m}`, year: 2026, month: m, diesel: 0, cityGas: 0, electricity: 0, water: 0, revenue: 0 })),
  ],
  targets: { 2026: T26 }, planMeta: {}, changeLog: [], scenarios: [],
});

let saves;
let server;
const mockServer = (db) => {
  server = startServer(db);
  saves = server.saves;
};
const lastLog = () => server.env.sheet('AuditLog').rows.filter((r) => r[3] !== '로그인').at(-1);
const loaded = () => waitFor(() => expect(screen.getAllByRole('button').some((b) => b.textContent.includes('실적 입력'))).toBe(true));
const clickBtn = (text) => fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent.includes(text)));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockImplementation(() => ADMIN_PASSWORD);
});

describe('감사 보고서 탭', () => {
  it('관리자 인증 후 열리고, 실제 입력 현황·동일 기간 비교·미기재 항목을 표시한다', async () => {
    mockServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('감사 보고서');
    const report = await screen.findByTestId('audit-report');
    const t = report.textContent;
    expect(t).toContain('2026년 온실가스 인벤토리 보고서');
    expect(t).toMatch(/9 \/ 12개월 입력 · 미입력 10, 11, 12월/);
    expect(t).toMatch(/달성률 = 실적 ÷ 동일 기간 누적 목표/);
    expect(t).toContain('출처 미기재');
    expect(t).toContain('미기재'); // 조직경계·사업장
    expect(t).toContain('Scope 3 제외 사유');
    expect(t).toMatch(/외부 검증기관의 검증 결과가 아닙니다/);
    const summary = within(report).getAllByRole('table').find((tb) => tb.textContent.includes('동일 기간 누적 목표'));
    expect(summary.textContent).toContain('451.99');
    expect(summary.textContent).toContain('441.13');
    expect(summary.textContent).toContain('102.5');
  });

  it('보고서 설정을 저장하면 설정과 변경 이력이 DB에 함께 저장된다', async () => {
    mockServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('감사 보고서');
    await screen.findByTestId('audit-report');
    fireEvent.change(screen.getByPlaceholderText(/예: 본사 및/), { target: { value: '본사 및 공장 (경북)' } });
    fireEvent.change(screen.getAllByPlaceholderText('출처 입력')[0], { target: { value: '○○ 고시 2026' } });
    expect(screen.getByTestId('audit-report').textContent).toContain('본사 및 공장 (경북)');
    expect(screen.getByTestId('audit-report').textContent).toContain('○○ 고시 2026');
    clickBtn('설정 저장');
    await waitFor(() => expect(saves.length).toBe(1));
    expect(saves[0].auditConfig.sites).toBe('본사 및 공장 (경북)');
    expect(saves[0].auditConfig.factorSources.diesel).toBe('○○ 고시 2026');
    const last = lastLog();
    expect(last[3]).toBe('보고서 설정 저장');
    expect(last[2]).toBe('관리자');        // 서버가 로그인 사용자를 기록
    expect(Boolean(last[0])).toBe(true);   // 서버 시각
  });

  it('엑셀 내보내기·전체 백업 버튼이 보고서 데이터로 내보내기를 호출한다', async () => {
    mockServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('감사 보고서');
    await screen.findByTestId('audit-report');
    clickBtn('엑셀 내보내기');
    await waitFor(() => expect(downloadWorkbook).toHaveBeenCalled());
    const [sheets, filename] = downloadWorkbook.mock.calls[0];
    expect(filename).toBe('대성스틸_온실가스_인벤토리_2026.xlsx');
    expect(sheets.map((s) => s.name)).toContain('월별 산정표');
    clickBtn('전체 데이터 백업');
    expect(downloadJson).toHaveBeenCalled();
    const [obj] = downloadJson.mock.calls[0];
    expect(obj.records.length).toBe(12);
    expect(obj).toHaveProperty('changeLog');
    expect(obj).toHaveProperty('auditConfig');
  });
});

describe('변경 이력 기록', () => {
  it('실적을 저장하면 어떤 값이 어떻게 바뀌었는지가 이력에 남는다', async () => {
    mockServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(document.querySelectorAll('input[type=number]').length).toBe(60));
    const inputs = () => [...document.querySelectorAll('input[type=number]')];
    fireEvent.change(inputs()[0], { target: { value: '510' } }); // 1월 경유 505.2 → 510
    clickBtn('저장');
    await waitFor(() => expect(saves.length).toBe(1));
    const e = lastLog();
    expect(e[3]).toBe('실적 일괄 저장');
    expect(e[4]).toBe('2026');
    expect(e[5]).toMatch(/1월 경유 505\.2→510/);          // 화면이 보낸 작업 내용
    expect(e[6]).toContain('실적 2026-01 경유 505.2→510'); // 서버가 직접 비교한 변경 내용
    // 예전 방식의 빈(전부 0) 레코드 정리는 '삭제'가 아니라 '빈 레코드 정리'로 구분해 투명하게 기록
    expect(e[6]).toContain('실적 2026-10 빈 레코드 정리(전부 0)');
    expect(e[6]).not.toContain('2026-10 삭제');
    expect(e[6]).not.toContain('2026-09');                // 값이 바뀌지 않은 달은 기록하지 않음
  });
});

describe('로드맵 시나리오 저장 → 보고서 포함', () => {
  it('시나리오를 저장하면 가정·근거·연도별 결과가 DB에 저장되고 보고서에 표시된다', async () => {
    mockServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('로드맵');
    await screen.findByText(/감축 로드맵 시뮬레이터/);
    const nums = () => [...document.querySelectorAll('input[type=number]')];
    fireEvent.change(nums()[3], { target: { value: '300' } }); // 자가 태양광 kWp
    fireEvent.change(screen.getAllByPlaceholderText(/설비 도입 계획서/)[3], { target: { value: '시공사 견적서 2026-10' } });
    fireEvent.change(screen.getByPlaceholderText(/시나리오 이름/), { target: { value: '태양광 300kWp안' } });
    clickBtn('현재 가정 저장');
    await waitFor(() => expect(saves.length).toBe(1));
    const sc = saves[0].scenarios[0];
    expect(sc.name).toBe('태양광 300kWp안');
    expect(sc.levers.solar.amount).toBe('300');
    expect(sc.levers.solar.basis).toBe('시공사 견적서 2026-10');
    expect(sc.results.length).toBe(6);
    expect(lastLog()[3]).toBe('로드맵 시나리오 저장');

    clickBtn('감사 보고서');
    const report = await screen.findByTestId('audit-report');
    await waitFor(() => expect(report.textContent).toMatch(/시나리오 “태양광 300kWp안”/));
    expect(report.textContent).toContain('시공사 견적서 2026-10');
    expect(report.textContent).toContain('자가 태양광');
  });
});
