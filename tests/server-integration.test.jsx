import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../src/App.jsx';
import { ADMIN_PASSWORD, startServer } from './helpers/server';

const rec = (m, over = {}) => ({ id: `2026-${String(m).padStart(2, '0')}`, year: 2026, month: m, diesel: 100 + m, cityGas: 1000 + m, electricity: 90000 + m, water: 300, revenue: 300, ...over });
const baseDb = () => ({
  availableYears: [2026, 2025],
  records: [rec(1), rec(2), rec(3)],
  targets: { 2026: Array.from({ length: 12 }, () => ({ diesel: 100, cityGas: 1000, electricity: 90000, water: 250 })) },
  planMeta: {}, auditConfig: null, scenarios: [], closedMonths: {},
});

const loaded = () => waitFor(() => expect(screen.getAllByRole('button').some((b) => b.textContent.includes('실적 입력'))).toBe(true));
const clickBtn = (text) => fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent.includes(text)));
const numberInputs = () => [...document.querySelectorAll('input[type=number]')];
const closeButtons = () => screen.getAllByRole('button').filter((b) => b.textContent.trim() === '마감');
const authBodies = (srv) => srv.bodies.filter((b) => b.action === 'auth');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockImplementation(() => ADMIN_PASSWORD);
});

describe('관리자 로그인(서버 인증)', () => {
  it('화면 소스에 비밀번호·PIN이 들어 있지 않다', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(src).not.toMatch(/fromCharCode/);
    expect(src).not.toContain(ADMIN_PASSWORD);
  });

  it('틀린 비밀번호로는 관리자 탭이 열리지 않고, 서버가 거부 사유를 알려준다', async () => {
    const srv = startServer(baseDb());
    window.prompt.mockImplementation(() => 'wrong-password');
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls.at(-1)[0]).toMatch(/비밀번호가 올바르지 않습니다/);
    expect(numberInputs().length).toBe(0);
    expect(authBodies(srv).length).toBe(1);
  });

  it('로그인하면 세션 토큰·데이터 버전을 붙여 저장하고, 서버 이력에는 로그인한 사용자가 남는다', async () => {
    const srv = startServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    fireEvent.change(numberInputs()[0], { target: { value: '555' } });
    clickBtn('저장');
    await waitFor(() => expect(srv.saves.length).toBe(1));
    const body = srv.bodies.find((b) => b.action === 'save');
    expect(body.sessionToken).toBeTruthy();
    expect(body.baseVersion).toBe(1);
    expect(body.log.action).toBe('실적 일괄 저장');
    expect(srv.env.sheet('Records').rows.find((r) => r[0] === '2026-01')[9]).toBe('관리자');
    expect(srv.env.sheet('Meta').rows.find((r) => r[0] === 'version')[1]).toBe('2');
  });

  it('로그아웃하면 세션이 종료되어 다시 들어갈 때 비밀번호를 요구한다', async () => {
    const srv = startServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    expect(authBodies(srv).length).toBe(1);
    fireEvent.click(screen.getByTestId('logout'));
    await waitFor(() => expect(srv.bodies.some((b) => b.action === 'logout')).toBe(true));
    expect(screen.queryByTestId('logout')).toBeNull();
    clickBtn('실적 입력');
    await waitFor(() => expect(authBodies(srv).length).toBe(2));
  });
});

describe('동시 저장 충돌', () => {
  it('다른 사용자가 먼저 저장했으면 덮어쓰지 않고 최신 데이터를 다시 불러온다', async () => {
    const srv = startServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    // 다른 사용자가 같은 데이터를 먼저 수정·저장(버전 1 → 2)
    const other = srv.env.call({ action: 'auth', password: ADMIN_PASSWORD });
    const db = baseDb();
    db.records[0].diesel = 777;
    expect(srv.env.call({ action: 'save', data: JSON.stringify(db), sessionToken: other.sessionToken, baseVersion: 1 }).result).toBe('success');
    // 이쪽 화면에서는 (예전 버전 기준으로) 다른 값을 입력해 저장
    fireEvent.change(numberInputs()[10], { target: { value: '12345' } }); // 2월 경유
    clickBtn('저장');
    await waitFor(() => expect(window.alert.mock.calls.some((c) => /다른 사용자가 먼저 저장/.test(c[0]))).toBe(true));
    expect(srv.saves.length).toBe(0);                                      // 화면의 저장은 반영되지 않음
    const back = JSON.parse(srv.env.call({ action: 'load' }).data);
    expect(back.records.find((r) => r.id === '2026-01').diesel).toBe(777);   // 다른 사용자의 변경 보존
    expect(back.records.find((r) => r.id === '2026-02').diesel).toBe(102);   // 이쪽 입력은 덮어쓰지 않음
    await waitFor(() => expect(numberInputs()[0].value).toBe('777'));        // 화면은 최신 데이터로 갱신
  });
});

describe('월 마감', () => {
  it('마감하면 서버에 기록되고 입력칸이 잠기며, 해제하려면 사유가 필요하다', async () => {
    const srv = startServer(baseDb());
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    expect(closeButtons().filter((b) => !b.disabled).length).toBe(3);        // 저장된 실적이 있는 1~3월만 마감 가능
    fireEvent.click(closeButtons()[0]);
    await waitFor(() => expect(srv.env.sheet('ClosedMonths').getLastRow()).toBe(2));
    expect(srv.env.sheet('ClosedMonths').rows[1][0]).toBe('2026-01');
    expect(srv.env.sheet('ClosedMonths').rows[1][4]).toBe('관리자');
    await waitFor(() => expect(numberInputs()[0].disabled).toBe(true));      // 1월 입력칸 잠김
    expect(numberInputs()[5].disabled).toBe(false);                          // 2월은 그대로 수정 가능
    expect(document.body.textContent).toContain('1월 🔒');

    // 마감된 달을 건드리지 않고 다른 달을 저장하면 정상 저장된다
    fireEvent.change(numberInputs()[5], { target: { value: '321' } });
    clickBtn('저장');
    await waitFor(() => expect(srv.saves.length).toBe(2));
    expect(srv.env.sheet('Records').rows.find((r) => r[0] === '2026-01')[3]).toBe(101);

    // 해제: 사유 없이는 취소
    window.prompt.mockImplementation((msg) => (String(msg).includes('해제 사유') ? '' : ADMIN_PASSWORD));
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent.trim() === '해제'));
    await waitFor(() => expect(window.alert.mock.calls.some((c) => /해제 사유가 없어/.test(c[0]))).toBe(true));
    expect(srv.env.sheet('ClosedMonths').getLastRow()).toBe(2);
    // 사유를 입력하면 해제되고 이력에 사유가 남는다
    window.prompt.mockImplementation((msg) => (String(msg).includes('해제 사유') ? '검침 오류 정정' : ADMIN_PASSWORD));
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent.trim() === '해제'));
    await waitFor(() => expect(srv.env.sheet('ClosedMonths').getLastRow()).toBe(1));
    const last = srv.env.sheet('AuditLog').rows.at(-1);
    expect(last[3]).toBe('월 마감 해제');
    expect(last[6]).toContain('사유: 검침 오류 정정');
    await waitFor(() => expect(numberInputs()[0].disabled).toBe(false));
  });

  it('감사 보고서의 데이터 품질 점검에 마감 현황이 표시된다', async () => {
    const srv = startServer({ ...baseDb(), closedMonths: {} });
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(numberInputs().length).toBe(60));
    fireEvent.click(closeButtons()[0]);
    await waitFor(() => expect(srv.env.sheet('ClosedMonths').getLastRow()).toBe(2));
    clickBtn('감사 보고서');
    const report = await screen.findByTestId('audit-report');
    expect(report.textContent).toMatch(/월 마감\(실적 수정 잠금\)/);
    expect(report.textContent).toMatch(/1개월 마감: 1월 · 입력됐으나 미마감 2개월/);
    expect(report.textContent).toContain('1월 🔒');
  });
});

describe('기존(셀 하나) 방식 데이터 이관', () => {
  it('기존 데이터를 읽어 안내 배너를 보여주고, 관리자가 이관하면 표 구조로 저장된다', async () => {
    const legacy = JSON.stringify(JSON.stringify(baseDb()));
    const srv = startServer(null, { legacy });
    render(<App />);
    await loaded();
    const banner = await screen.findByTestId('legacy-banner');
    expect(banner.textContent).toMatch(/기존.*방식의 데이터/);
    // 기존 데이터가 화면에 보인다
    await waitFor(() => expect(document.body.textContent).toContain('2026'));
    clickBtn('표 구조로 이관');
    await waitFor(() => expect(srv.saves.length).toBe(1));
    expect(srv.env.sheet('Records').getLastRow()).toBe(4);                   // 헤더 + 3개월
    expect(srv.env.sheet('Backup').getLastRow()).toBe(2);                    // 이관 전 원본 백업
    expect(srv.env.sheet('시트1').rows[0][0]).toBe(legacy);                  // 원본 셀은 그대로 보존
    expect(srv.env.sheet('AuditLog').rows.at(-1)[3]).toBe('초기 이관');
    await waitFor(() => expect(screen.queryByTestId('legacy-banner')).toBeNull());
  });
});

describe('로그인 실패 안내(원인별)', () => {
  const alertText = () => window.alert.mock.calls.at(-1)[0];

  it('서버에 관리자 계정이 설정되지 않았으면 그 사실을 알려준다', async () => {
    startServer(baseDb(), { noAdmin: true });
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(alertText()).toMatch(/관리자 계정이 아직 설정되지 않았습니다/);
    expect(alertText()).toMatch(/ADMIN_PASSWORD/);
  });

  it('서버가 새 버전으로 배포되지 않았으면(구버전 응답) 새 버전 배포 방법을 안내한다', async () => {
    startServer(baseDb(), { override: { auth: () => ({ __throw: true }), status: () => ({ __throw: true }) } });
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(alertText()).toMatch(/새 버전\(v2\)으로 배포되지 않은 것/);
    expect(alertText()).toMatch(/배포 관리/);
  });

  it('비밀번호가 틀리면 한/영·Caps Lock 확인을 안내한다', async () => {
    startServer(baseDb());
    window.prompt.mockImplementation(() => 'wrong-password');
    render(<App />);
    await loaded();
    clickBtn('실적 입력');
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(alertText()).toMatch(/비밀번호가 올바르지 않습니다/);
    expect(alertText()).toMatch(/한\/영/);
  });
});
