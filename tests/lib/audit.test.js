import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { TARGETS_2026 } from '../../src/lib/constants';
import {
  appendLog, buildAuditData, buildWorkbookSheets, DEFAULT_AUDIT_CONFIG, describeDiff, detectAnomalies, diffRecords,
  LOG_LIMIT, makeLogEntry, normalizeAuditConfig,
} from '../../src/lib/audit';
import { buildWorkbookBuffer } from '../../src/lib/exportWorkbook';

const rec = (y, m, k = 1, extra = {}) => ({
  id: `${y}-${m}`, year: y, month: m,
  diesel: Math.round(TARGETS_2026[m - 1].diesel * k), cityGas: Math.round(TARGETS_2026[m - 1].cityGas * k),
  electricity: Math.round(TARGETS_2026[m - 1].electricity * k), water: 100, revenue: 300, ...extra,
});
const full2025 = Array.from({ length: 12 }, (_, i) => rec(2025, i + 1, 0.95));
const h1 = Array.from({ length: 9 }, (_, i) => rec(2026, i + 1, 1.05));
const zeroRecs = [10, 11, 12].map((m) => rec(2026, m, 0, { water: 0, revenue: 0 }));
const records = [...full2025, ...h1, ...zeroRecs];
const targets = { 2026: TARGETS_2026 };

describe('보고서 설정', () => {
  it('저장된 설정이 일부만 있어도 기본값과 병합한다', () => {
    const c = normalizeAuditConfig({ orgName: 'A', factorSources: { diesel: '고시 X' } });
    expect(c.orgName).toBe('A');
    expect(c.factorSources.diesel).toBe('고시 X');
    expect(c.factorSources.cityGas).toBe('');
    expect(c.scope3Reason).toBe(DEFAULT_AUDIT_CONFIG.scope3Reason);
    expect(normalizeAuditConfig(null).orgName).toBe(DEFAULT_AUDIT_CONFIG.orgName);
  });
});

describe('변경 이력', () => {
  it('이력은 최근 LOG_LIMIT건만 유지한다', () => {
    let log = [];
    for (let i = 0; i < LOG_LIMIT + 20; i++) log = appendLog(log, makeLogEntry('테스트', String(i)));
    expect(log.length).toBe(LOG_LIMIT);
    expect(log[log.length - 1].detail).toBe(String(LOG_LIMIT + 19));
  });
  it('실적 변경 내역: 신규·삭제·값 변경을 구분하고 0 레코드 추가/삭제는 무시한다', () => {
    const before = [rec(2026, 1), rec(2026, 2), rec(2026, 10, 0)];
    const after = [rec(2026, 1, 1, { diesel: 999 }), rec(2026, 3), rec(2026, 11, 0)];
    const diff = diffRecords(before, after, 2026);
    const text = describeDiff(diff, 10);
    expect(text).toMatch(/1월 경유 \d+→999/);
    expect(text).toMatch(/2월 삭제/);
    expect(text).toMatch(/3월 신규 입력/);
    expect(text).not.toMatch(/10월|11월/);
  });
  it('변경이 많으면 요약해서 "외 N건"으로 표시한다', () => {
    const before = Array.from({ length: 12 }, (_, i) => rec(2026, i + 1, 1));
    const after = Array.from({ length: 12 }, (_, i) => rec(2026, i + 1, 1.5));
    expect(describeDiff(diffRecords(before, after, 2026), 5)).toMatch(/외 \d+건$/);
  });
});

describe('데이터 품질', () => {
  it('전년 동월 대비 ±30% 초과와 0 입력을 찾는다', () => {
    const recs = [rec(2025, 1, 1), rec(2026, 1, 1.5), rec(2026, 2, 1, { diesel: 0 }), rec(2025, 2, 1)];
    const a = detectAnomalies(recs, 2026);
    expect(a.yoy.some((x) => x.month === 1 && x.field === '경유')).toBe(true);
    expect(a.zeros).toContainEqual({ month: 2, field: '경유' });
  });
});

describe('감사 보고서 데이터', () => {
  const d = buildAuditData({ year: 2026, records, targets, planMeta: {}, config: {}, changeLog: [], now: new Date('2026-11-07T00:00:00Z') });

  it('입력된 달만 집계하고 미입력(0 레코드 포함) 월은 미입력으로 표시한다', () => {
    expect(d.summary.enteredCount).toBe(9);
    expect(d.summary.missingMonths).toEqual([10, 11, 12]);
    expect(d.monthly[9].entered).toBe(false);
    expect(d.monthly[9].total).toBeNull();
  });
  it('합계는 월별 합과 일치하고, 동일 기간 목표와 비교한다', () => {
    const sum = d.monthly.filter((r) => r.entered).reduce((a, r) => a + r.total, 0);
    expect(d.summary.actual.total).toBeCloseTo(sum, 9);
    expect(d.summary.rate.total).toBeCloseTo((d.summary.actual.total / d.summary.sameTarget.total) * 100, 9);
    expect(d.summary.sameTarget.total).toBeLessThan(d.summary.fullTarget.total);
  });
  it('연말 예상과 기준연도(2025, 579.116 t) 대비 증감을 계산한다', () => {
    expect(d.summary.forecast.total).toBeGreaterThan(d.summary.actual.total);
    expect(d.summary.baseTotal).toBeCloseTo(579.116, 3);
    expect(typeof d.summary.vsBase).toBe('number');
  });
  it('배출계수 출처가 비어 있으면 점검 결과에 경고가 나온다', () => {
    const chk = d.quality.checks.find((c) => c.name === '배출계수 출처 기재');
    expect(chk.status).toBe('warn');
    const filled = buildAuditData({
      year: 2026, records, targets, config: { factorSources: { diesel: 'a', cityGas: 'b', electricity: 'c' } },
    });
    expect(filled.quality.checks.find((c) => c.name === '배출계수 출처 기재').status).toBe('ok');
  });
  it('검산(재현성) 항목이 정상이고, 목표 합계와 공식 목표 차이를 기록한다', () => {
    expect(d.quality.checks.find((c) => c.name === '산정 재현성(검산)').status).toBe('ok');
    const gap = d.quality.checks.find((c) => c.name.startsWith('월별 목표 합계'));
    expect(gap.detail).toMatch(/공식 568\.70 t/);
  });
  it('변경 이력은 해당 연도(또는 연도 없는 항목)만, 최신순으로 담는다', () => {
    const log = [
      { at: '2026-01-01T00:00:00Z', action: 'a', detail: '1', year: 2026 },
      { at: '2026-03-01T00:00:00Z', action: 'b', detail: '2', year: 2025 },
      { at: '2026-02-01T00:00:00Z', action: 'c', detail: '3', year: null },
    ];
    const r = buildAuditData({ year: 2026, records, targets, changeLog: log });
    expect(r.changeLog.map((e) => e.action)).toEqual(['c', 'a']);
  });
});

describe('엑셀 내보내기', () => {
  it('시트 구성: 요약·월별 산정표·배출계수·목표 대비·데이터 품질·변경 이력(+시나리오)', () => {
    const d = buildAuditData({ year: 2026, records, targets, config: {} });
    expect(buildWorkbookSheets(d).map((s) => s.name)).toEqual(['요약', '월별 산정표', '배출계수·방법', '목표 대비', '데이터 품질', '변경 이력']);
    const sc = {
      name: '기본', savedAt: '2026-11-07',
      params: { bauGrowth: 0, solarYield: 1200, evKwhPerL: 3.5 }, paramBasis: {},
      levers: { eff: { amount: 5, start: 2027, full: 2030, basis: 'x' } },
      results: [{ year: 2030, target: 470.756, bau: 579.116, total: 550, totalMarket: 550 }],
    };
    const withSc = buildAuditData({ year: 2026, records, targets, config: {}, scenario: sc });
    expect(buildWorkbookSheets(withSc).map((s) => s.name)).toContain('로드맵 시나리오');
  });
  it('생성한 .xlsx 를 다시 읽으면 월별 산정표 합계가 보고서 데이터와 같다', async () => {
    const d = buildAuditData({ year: 2026, records, targets, config: {} });
    const buf = await buildWorkbookBuffer(buildWorkbookSheets(d));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('월별 산정표');
    const last = ws.getRow(ws.rowCount);
    expect(last.getCell(1).value).toBe('합계');
    expect(last.getCell(9).value).toBeCloseTo(d.totals.total, 3);
    expect(ws.getRow(11).getCell(10).value).toBe('미입력'); // 10월
    expect(wb.getWorksheet('요약').getRow(2).getCell(2).value).toBe('(주)대성스틸');
  });
});
