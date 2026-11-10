import { describe, it, expect } from 'vitest';
import { baseState, createEnv, rec } from './fakes';

const save = (env, state, extra = {}) => env.call({ action: 'save', data: JSON.stringify(state), ...extra });
const load = (env) => env.call({ action: 'load' });
const login = (env, pw) => env.call({ action: 'auth', password: pw });

describe('기존(A1 한 칸) 데이터 이관', () => {
  it('v1이 저장한 이중 인코딩 JSON을 그대로 읽어 돌려준다', () => {
    const state = baseState();
    const env = createEnv({ legacy: JSON.stringify(JSON.stringify(state)) });
    const r = load(env);
    expect(r.result).toBe('success');
    expect(r.version).toBe(0);
    expect(r.legacy).toBe(true);
    expect(JSON.parse(r.data).records.length).toBe(4);
  });
  it('첫 저장 시 기존 A1 데이터를 Backup에 보관하고 표로 나누어 저장한다', () => {
    const legacy = JSON.stringify(JSON.stringify(baseState()));
    const env = createEnv({ legacy });
    const r = save(env, baseState(), { log: { action: '초기 이관', detail: 'A1 데이터를 표로 이관', year: null } });
    expect(r.result).toBe('success');
    expect(r.version).toBe(1);
    const backup = env.sheet('Backup').rows;
    expect(backup.length).toBe(2);               // 헤더 + 이관 전 백업
    expect(String(backup[1][4])).toContain('"records"');
    expect(env.sheet('시트1').rows[0][0]).toBe(legacy); // 원본 A1은 그대로 보존
    const back = JSON.parse(load(env).data);
    expect(back.records.length).toBe(4);
    expect(back.targets[2026].length).toBe(12);
  });
});

describe('표 구조 저장', () => {
  it('실적·목표가 행으로 저장되고, 연월 ID가 날짜로 바뀌지 않는다', () => {
    const env = createEnv();
    save(env, baseState());
    const rows = env.sheet('Records').rows;
    expect(rows[0][0]).toBe('id');
    expect(rows.length).toBe(5);
    expect(typeof rows[1][0]).toBe('string');
    expect(rows[1][0]).toBe('2025-01');
    expect(rows[1].every((v) => !(v instanceof Date))).toBe(true);
    expect(env.sheet('Targets').rows.length).toBe(13);
    expect(env.sheet('Meta').rows.find((r) => r[0] === 'version')[1]).toBe('1');
  });
  it('저장했다가 읽으면 같은 데이터가 돌아온다', () => {
    const env = createEnv();
    const s = baseState();
    s.scenarios = [{ id: 'sc-1', name: '태양광안', savedAt: '2026-11-08T00:00:00Z', levers: { solar: { amount: 100 } } }];
    s.closedMonths = {};
    save(env, s);
    const back = JSON.parse(load(env).data);
    expect(back.records.map((r) => r.id)).toEqual(['2025-01', '2026-01', '2026-02', '2026-03']);
    expect(back.records.find((r) => r.id === '2026-02').electricity).toBe(90002);
    expect(back.planMeta[2026].reason).toBe('사유');
    expect(back.auditConfig.orgName).toBe('(주)대성스틸');
    expect(back.scenarios[0].name).toBe('태양광안');
    expect(back.availableYears).toEqual([2026, 2025]);
  });
  it('셀 글자 수 한도(5만 자)에 걸리지 않는다: 실적 600건·큰 목표 수립 기록도 저장된다', () => {
    const env = createEnv();
    const s = baseState();
    for (let y = 2030; y < 2080; y++) for (let m = 1; m <= 12; m++) s.records.push(rec(y, m));
    s.planMeta[2026] = { method: '긴 기록', note: 'x'.repeat(30000) };
    s.availableYears = [2026, 2025];
    const r = save(env, s);
    expect(r.result).toBe('success');
    const all = env.sheets.flatMap((sh) => sh.rows.flat()).filter((v) => typeof v === 'string');
    expect(Math.max(...all.map((v) => v.length))).toBeLessThanOrEqual(45000);
    expect(JSON.parse(load(env).data).records.length).toBe(604);
  });
  it('셀 한도를 넘는 설정·시나리오는 저장을 거부한다', () => {
    const env = createEnv();
    const s = baseState();
    s.auditConfig = { orgName: 'x'.repeat(46000) };
    expect(save(env, s)).toMatchObject({ result: 'error', code: 'TOO_LARGE' });
  });
});

describe('입력 검증', () => {
  it.each([
    ['음수', (s) => { s.records[0].diesel = -1; }, 'INVALID_RECORD'],
    ['숫자가 아닌 값', (s) => { s.records[0].electricity = 'abc'; }, 'INVALID_RECORD'],
    ['13월', (s) => { s.records[0].month = 13; }, 'INVALID_RECORD'],
    ['같은 월 중복', (s) => { s.records.push(rec(2026, 1)); }, 'INVALID_RECORD'],
    ['잘못된 연도 목록', (s) => { s.availableYears = ['abc']; }, 'INVALID_STATE'],
    ['목표 음수', (s) => { s.targets[2026][3].cityGas = -5; }, 'INVALID_TARGET'],
    ['마감 월 형식', (s) => { s.closedMonths = { '2026/09': {} }; }, 'INVALID_STATE'],
  ])('%s → 거부하고 버전·데이터를 바꾸지 않는다', (_, mutate, code) => {
    const env = createEnv();
    save(env, baseState());
    const bad = baseState();
    mutate(bad);
    const r = save(env, bad, { baseVersion: 1 });
    expect(r).toMatchObject({ result: 'error', code });
    expect(load(env).version).toBe(1);
  });
});

describe('관리자 인증', () => {
  it('호환 모드(ENFORCE_AUTH 미설정)에서는 예전 화면도 저장되지만 작업자가 "인증 없음"으로 남는다', () => {
    const env = createEnv();
    save(env, baseState());
    expect(env.sheet('Records').rows[1][9]).toBe('(인증 없음-호환 모드)');
  });
  it('ENFORCE_AUTH=true 이면 로그인 없이는 저장할 수 없다', () => {
    const env = createEnv();
    env.props.ENFORCE_AUTH = 'true';
    expect(save(env, baseState(), { baseVersion: 0 })).toMatchObject({ result: 'error', code: 'AUTH_REQUIRED' });
    expect(load(env).data).toBeNull();
  });
  it('이름별 관리자 계정은 해시로 저장되고(비밀번호 원문 없음), 로그인한 사람이 작업자로 기록된다', () => {
    const env = createEnv();
    env.props.ENFORCE_AUTH = 'true';
    env.api.setAdminUser('홍길동', 'correct-horse-9');
    expect(env.props.ADMIN_USERS).not.toContain('correct-horse-9');
    const a = login(env, 'correct-horse-9');
    expect(a).toMatchObject({ result: 'success', user: '홍길동' });
    const r = save(env, baseState(), { sessionToken: a.sessionToken, baseVersion: 0, log: { action: '실적 저장', detail: '테스트', year: 2026 } });
    expect(r.result).toBe('success');
    expect(env.sheet('Records').rows[1][9]).toBe('홍길동');
    const log = env.sheet('AuditLog').rows;
    expect(log.at(-1)[2]).toBe('홍길동');
    expect(log.at(-1)[3]).toBe('실적 저장');
    expect(log.some((row) => row[3] === '로그인' && row[2] === '홍길동')).toBe(true);
  });
  it('공용 비밀번호(ADMIN_PASSWORD)도 지원한다', () => {
    const env = createEnv();
    env.props.ADMIN_PASSWORD = 'shared-pass-1';
    expect(login(env, 'shared-pass-1')).toMatchObject({ result: 'success', user: '관리자' });
  });
  it('틀린 비밀번호는 거부·기록하고, 10회 실패하면 잠시 잠근다', () => {
    const env = createEnv();
    env.props.ADMIN_PASSWORD = 'shared-pass-1';
    for (let i = 0; i < 10; i++) expect(login(env, 'wrong')).toMatchObject({ result: 'error', code: 'AUTH_FAILED' });
    expect(login(env, 'shared-pass-1')).toMatchObject({ result: 'error', code: 'AUTH_LOCKED' });
    expect(env.sheet('AuditLog').rows.filter((r) => r[3] === '로그인 실패').length).toBe(10);
  });
  it('로그아웃하면 세션이 사라져 저장할 수 없다', () => {
    const env = createEnv();
    env.props.ADMIN_PASSWORD = 'shared-pass-1';
    env.props.ENFORCE_AUTH = 'true';
    const a = login(env, 'shared-pass-1');
    env.call({ action: 'logout', sessionToken: a.sessionToken });
    expect(save(env, baseState(), { sessionToken: a.sessionToken, baseVersion: 0 })).toMatchObject({ code: 'AUTH_REQUIRED' });
  });
  it('8자 미만 비밀번호는 계정으로 등록할 수 없다', () => {
    const env = createEnv();
    expect(() => env.api.setAdminUser('김', 'short')).toThrow();
  });
});

describe('동시 저장(덮어쓰기) 방지와 변경 기록', () => {
  it('먼저 저장된 버전이 바뀌었으면 VERSION_CONFLICT 로 거부한다', () => {
    const env = createEnv();
    save(env, baseState());                       // v1
    const a = baseState(); a.records.find((x) => x.id === '2025-01').diesel = 111;
    const b = baseState(); b.records[1].diesel = 222;
    expect(save(env, a, { baseVersion: 1 }).result).toBe('success'); // v2
    const r = save(env, b, { baseVersion: 1 });
    expect(r).toMatchObject({ result: 'error', code: 'VERSION_CONFLICT' });
    const back = JSON.parse(load(env).data);
    expect(back.records.find((x) => x.id === '2025-01').diesel).toBe(111);
    expect(back.records.find((x) => x.id === '2026-02').diesel).toBe(102);
  });
  it('바뀐 값만 "이전→이후"로 기록하고, 바뀌지 않은 행의 수정자·수정시각은 유지한다', async () => {
    const env = createEnv();
    env.props.ADMIN_PASSWORD = 'pw-for-admin-1';
    env.api.setAdminUser('김담당', 'second-user-pw');
    const u1 = login(env, 'pw-for-admin-1');
    save(env, baseState(), { sessionToken: u1.sessionToken });                      // 관리자가 최초 저장
    const firstRowAt = env.sheet('Records').rows[1][8];
    await new Promise((r) => setTimeout(r, 5));
    const u2 = login(env, 'second-user-pw');
    const s = baseState(); s.records.find((x) => x.id === '2026-01').diesel = 999;   // 2026-01 경유만 변경
    save(env, s, { sessionToken: u2.sessionToken, baseVersion: 1, log: { action: '실적 저장', detail: '1월 수정', year: 2026 } });
    const rows = env.sheet('Records').rows;
    const changed = rows.find((r) => r[0] === '2026-01');
    const untouched = rows.find((r) => r[0] === '2025-01');
    expect(changed[9]).toBe('김담당');
    expect(untouched[9]).toBe('관리자');
    expect(untouched[8]).toBe(firstRowAt);
    const last = env.sheet('AuditLog').rows.at(-1);
    expect(last[6]).toContain('실적 2026-01 경유 101→999');
    expect(last[6]).not.toContain('2025-01');
    const log = load(env).changeLog.at(-1);
    expect(log.actor).toBe('김담당');
    expect(log.detail).toContain('경유 101→999');
  });
  it('백업은 최근 30개만 보관한다', () => {
    const env = createEnv();
    save(env, baseState());
    for (let i = 0; i < 35; i++) { const s = baseState(); s.records[0].diesel = 500 + i; save(env, s); }
    expect(env.sheet('Backup').rows.length - 1).toBe(30);
  });
  it('백업 버전으로 복원할 수 있다', () => {
    const env = createEnv();
    save(env, baseState());                                                   // v1
    const s = baseState(); s.records[0].diesel = 7777; save(env, s);          // v2 (v1 백업 생성)
    env.api.restoreBackup(1);
    const back = JSON.parse(load(env).data);
    expect(back.records.find((r) => r.id === '2025-01').diesel).toBe(101);
    expect(load(env).version).toBe(3);
    expect(env.sheet('AuditLog').rows.at(-1)[3]).toBe('백업 복원');
  });
  it('예전 방식의 빈(전부 0) 레코드를 정리하면 "삭제"가 아니라 "빈 레코드 정리"로 구분해 기록한다', () => {
    const env = createEnv();
    const s = baseState(); s.records.push(rec(2026, 10, { diesel: 0, cityGas: 0, electricity: 0, water: 0, revenue: 0 }));
    save(env, s);
    save(env, baseState(), { baseVersion: 1 });
    const changes = env.sheet('AuditLog').rows.at(-1)[6];
    expect(changes).toContain('실적 2026-10 빈 레코드 정리(전부 0)');
    expect(changes).not.toContain('삭제');
  });
  it('알 수 없는 요청은 오류를 돌려준다', () => {
    expect(createEnv().call({ action: 'nope' })).toMatchObject({ result: 'error', code: 'UNKNOWN_ACTION' });
  });
});

describe('월 마감 잠금', () => {
  const closed = () => { const s = baseState(); s.closedMonths = { '2026-01': { reason: '1월 마감' } }; return s; };
  it('마감한 월은 서버가 마감 시각·마감자를 기록하고, 그 월의 실적 수정은 거부한다', () => {
    const env = createEnv();
    env.props.ADMIN_PASSWORD = 'pw-for-admin-1';
    const u = login(env, 'pw-for-admin-1');
    save(env, baseState(), { sessionToken: u.sessionToken });
    expect(save(env, closed(), { sessionToken: u.sessionToken, baseVersion: 1 }).result).toBe('success');
    const row = env.sheet('ClosedMonths').rows[1];
    expect(row[0]).toBe('2026-01');
    expect(row[4]).toBe('관리자');
    const edit = closed(); edit.records.find((r) => r.id === '2026-01').diesel = 5;
    expect(save(env, edit, { sessionToken: u.sessionToken, baseVersion: 2 })).toMatchObject({ result: 'error', code: 'LOCKED_MONTH' });
    const del = closed(); del.records = del.records.filter((r) => r.id !== '2026-01');
    expect(save(env, del, { sessionToken: u.sessionToken, baseVersion: 2 })).toMatchObject({ code: 'LOCKED_MONTH' });
  });
  it('마감되지 않은 월은 계속 수정할 수 있다', () => {
    const env = createEnv();
    save(env, closed());
    const edit = closed(); edit.records.find((r) => r.id === '2026-02').diesel = 5;
    expect(save(env, edit, { baseVersion: 1 }).result).toBe('success');
  });
  it('마감 해제는 사유가 있어야 하고, 사유는 이력에 남는다', () => {
    const env = createEnv();
    save(env, closed());
    const reopen = baseState();
    expect(save(env, reopen, { baseVersion: 1 })).toMatchObject({ code: 'UNLOCK_REASON_REQUIRED' });
    expect(save(env, reopen, { baseVersion: 1, unlockReason: '검침 오류 정정' }).result).toBe('success');
    expect(env.sheet('AuditLog').rows.at(-1)[6]).toContain('마감 해제 2026-01 (사유: 검침 오류 정정)');
    expect(env.sheet('ClosedMonths').getLastRow()).toBe(1);
  });
});
