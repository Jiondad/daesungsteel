// Apps Script 실행 환경(스프레드시트·캐시·잠금 등)을 흉내 내는 테스트용 가짜 객체
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

class FakeSheet {
  constructor(name) { this.name = name; this.rows = []; this.textCols = new Set(); this.frozen = 0; }
  getName() { return this.name; }
  getMaxRows() { return 1000; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
    return 0;
  }
  setFrozenRows(n) { this.frozen = n; }
  appendRow(arr) { this.rows.push(arr.map((v) => this._coerce(v, 0))); }
  deleteRows(start, count) { this.rows.splice(start - 1, count); }
  // 텍스트 서식이 아닌 열에 날짜처럼 보이는 문자열을 쓰면 시트가 날짜로 바꿔 버리는 동작을 흉내 낸다
  _coerce(v, col) {
    if (typeof v === 'string' && !this.textCols.has(col + 1) && /^\d{4}-\d{2}(-\d{2})?/.test(v)) return new Date(v.length === 7 ? v + '-01' : v);
    return v;
  }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.rows[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
        return out;
      },
      getValue() { const v = (sh.rows[r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
      setValues(vals) {
        vals.forEach((row, i) => { sh.rows[r - 1 + i] = sh.rows[r - 1 + i] || []; row.forEach((v, j) => { sh.rows[r - 1 + i][c - 1 + j] = sh._coerce(v, c - 1 + j); }); });
      },
      setValue(v) { sh.rows[r - 1] = sh.rows[r - 1] || []; sh.rows[r - 1][c - 1] = v; },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.rows[r - 1 + i]) sh.rows[r - 1 + i][c - 1 + j] = ''; },
      setNumberFormat(f) { if (f === '@') for (let j = 0; j < nc; j++) sh.textCols.add(c + j); },
      setFontWeight() {},
    };
  }
}

export function createEnv({ legacy = null } = {}) {
  const sheets = [];
  if (legacy !== null) { const s = new FakeSheet('시트1'); s.rows = [[legacy]]; sheets.push(s); }
  else sheets.push(new FakeSheet('시트1'));
  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
  };
  const propStore = {};
  const cacheStore = {};
  const env = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in propStore ? propStore[k] : null), setProperty: (k, v) => { propStore[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => { cacheStore[k] = v; }, remove: (k) => { delete cacheStore[k]; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, str) => Array.from(new Int8Array(createHash('sha256').update(str, 'utf8').digest())),
      getUuid: () => randomUUID(),
    },
  };
  const src = readFileSync(resolve(process.cwd(), 'apps-script/Code.gs'), 'utf8');
  const api = new Function('SpreadsheetApp', 'ContentService', 'LockService', 'PropertiesService', 'CacheService', 'Utilities',
    src + '\nreturn { doPost, doGet, setAdminUser, restoreBackup };')(
    env.SpreadsheetApp, env.ContentService, env.LockService, env.PropertiesService, env.CacheService, env.Utilities);
  const call = (payload) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
  return { ...env, api, call, sheets, sheet: (n) => sheets.find((s) => s.name === n), props: propStore, cache: cacheStore };
}

export const rec = (y, m, over = {}) => ({ id: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m, diesel: 100 + m, cityGas: 1000 + m, electricity: 90000 + m, water: 300, revenue: 300, ...over });
export const tgt = (k = 1) => Array.from({ length: 12 }, (_, i) => ({ diesel: 100 * k, cityGas: 1000 * k, electricity: 90000 * k, water: 250 }));
export const baseState = () => ({
  availableYears: [2026, 2025],
  records: [rec(2026, 1), rec(2026, 2), rec(2026, 3), rec(2025, 1)],
  targets: { 2026: tgt() },
  planMeta: { 2026: { method: '테스트', reason: '사유' } },
  auditConfig: { orgName: '(주)대성스틸' },
  scenarios: [],
  closedMonths: {},
});
