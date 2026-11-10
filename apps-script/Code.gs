/**
 * 대성스틸 온실가스 인벤토리 — Google Apps Script 서버 v2
 *
 * 저장 방식: 기존의 "A1 셀 하나에 전체 JSON" 방식을 버리고, 시트를 표로 나누어 저장한다.
 *   Records(실적) · Targets(월별 목표) · PlanMeta(목표 수립 기록) · Config(설정) · Scenarios(로드맵 시나리오)
 *   ClosedMonths(월 마감) · AuditLog(변경 이력, 추가만 가능) · Backup(저장 직전 스냅샷) · Meta(버전)
 * 보안: 관리자 로그인(세션) 없이는 저장할 수 없고(ENFORCE_AUTH=true), 저장 시 버전을 확인해 덮어쓰기를 막는다.
 * 설정 방법은 apps-script/README.md 참고.
 */

var VERSION_ = 'v2.0';
var SESSION_TTL_SEC_ = 21600;      // 로그인 유지 시간(6시간)
var BACKUP_KEEP_ = 30;             // 보관할 백업 개수
var CELL_LIMIT_ = 45000;           // 셀 하나에 넣을 수 있는 글자 수(시트 한도 50,000자 미만으로 제한)
var MAX_BODY_ = 900000;
var MAX_RECORDS_ = 2000;
var LOG_RETURN_ = 200;             // 화면에 돌려줄 최근 이력 수
var AUTH_FAIL_LIMIT_ = 10;         // 10분 내 로그인 실패 한도

var HEADERS_ = {
  Meta: ['key', 'value'],
  Records: ['id', 'year', 'month', 'diesel', 'cityGas', 'electricity', 'water', 'revenue', 'updatedAt', 'updatedBy'],
  Targets: ['id', 'year', 'month', 'diesel', 'cityGas', 'electricity', 'water', 'revenue', 'updatedAt', 'updatedBy'],
  PlanMeta: ['year', 'json', 'updatedAt', 'updatedBy'],
  Config: ['key', 'json', 'updatedAt', 'updatedBy'],
  Scenarios: ['id', 'name', 'savedAt', 'json'],
  ClosedMonths: ['id', 'year', 'month', 'closedAt', 'closedBy', 'reason'],
  AuditLog: ['at', 'version', 'user', 'action', 'year', 'detail', 'changes'],
  Backup: ['at', 'version', 'user', 'length', 'chunks...']
};
// 날짜로 자동 변환되면 안 되는 열(시각·ID·JSON)은 텍스트 서식으로 고정
var TEXT_COLS_ = {
  Meta: [1, 2], Records: [1, 9, 10], Targets: [1, 9, 10], PlanMeta: [2, 3, 4], Config: [1, 2, 3, 4],
  Scenarios: [1, 2, 3, 4], ClosedMonths: [1, 4, 5, 6], AuditLog: [1, 3, 4, 6, 7], Backup: [1, 3]
};
var ENERGY_ = ['diesel', 'cityGas', 'electricity', 'water'];
var FIELD_LABEL_ = { diesel: '경유', cityGas: '도시가스', electricity: '전력', water: '수도', revenue: '매출' };

/* ───────────────────────── 공통 ───────────────────────── */
function fail_(code, message) { var e = new Error(message); e.code = code; throw e; }
function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function nowIso_() { return new Date().toISOString(); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function ymKey_(y, m) { return y + '-' + pad2_(m); }
function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}
function n0_(v) { var n = num_(v); return n === null ? 0 : n; }
function txt_(v) { if (v instanceof Date) return v.toISOString(); return v === null || v === undefined ? '' : String(v); }
function json_(v) { return JSON.stringify(v === undefined ? null : v); }
function clip_(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function sheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var h = HEADERS_[name];
    (TEXT_COLS_[name] || []).forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
    sh.getRange(1, 1, 1, h.length).setValues([h]);
    sh.getRange(1, 1, 1, h.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function readRaw_(name) {
  var sh = sheet_(name), h = HEADERS_[name].length, last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, h).getValues();
}
function writeTable_(name, rows) {
  var sh = sheet_(name), h = HEADERS_[name].length, last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, h).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, h).setValues(rows);
}

/* ───────────────────────── 인증 ───────────────────────── */
function enforceAuth_() { return props_().getProperty('ENFORCE_AUTH') === 'true'; }

function hashPw_(salt, pw) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}
function adminUsers_() {
  var raw = props_().getProperty('ADMIN_USERS');
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}
// 편집기에서 실행하는 도우미: 이름별 관리자 계정을 해시로 저장한다(비밀번호 원문은 저장하지 않음)
function setAdminUser(name, password) {
  if (!name || !password || String(password).length < 8) throw new Error('이름과 8자 이상의 비밀번호가 필요합니다.');
  var users = adminUsers_();
  var salt = Utilities.getUuid();
  users[name] = { salt: salt, hash: hashPw_(salt, password) };
  props_().setProperty('ADMIN_USERS', JSON.stringify(users));
}
function authenticate_(password) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('authfail') || 0);
  if (fails >= AUTH_FAIL_LIMIT_) fail_('AUTH_LOCKED', '로그인 시도가 너무 많습니다. 10분 뒤에 다시 시도하세요.');
  var pw = String(password || '');
  var user = null;
  var users = adminUsers_();
  Object.keys(users).forEach(function (name) {
    if (!user && users[name] && hashPw_(users[name].salt, pw) === users[name].hash) user = name;
  });
  var shared = props_().getProperty('ADMIN_PASSWORD');
  if (!user && shared && pw === shared) user = '관리자';
  if (!user) {
    cache.put('authfail', String(fails + 1), 600);
    appendLog_({ at: nowIso_(), version: readMeta_().version, user: '(미인증)', action: '로그인 실패', year: '', detail: '관리자 인증 실패', changes: '' });
    fail_('AUTH_FAILED', '비밀번호가 올바르지 않습니다.');
  }
  cache.remove('authfail');
  return user;
}
function authorize_(token) {
  var user = null;
  if (token) {
    var raw = CacheService.getScriptCache().get('sess_' + token);
    if (raw) { try { user = JSON.parse(raw).user; } catch (e) { user = null; } }
  }
  if (!user && enforceAuth_()) fail_('AUTH_REQUIRED', '관리자 인증이 필요하거나 인증이 만료되었습니다.');
  return user || '(인증 없음-호환 모드)';
}

/* ───────────────────────── 버전·이력·백업 ───────────────────────── */
function readMeta_() {
  var meta = { version: 0, savedAt: '', savedBy: '' };
  readRaw_('Meta').forEach(function (r) {
    var k = txt_(r[0]);
    if (k === 'version') meta.version = Number(r[1]) || 0;
    if (k === 'savedAt') meta.savedAt = txt_(r[1]);
    if (k === 'savedBy') meta.savedBy = txt_(r[1]);
  });
  return meta;
}
function writeMeta_(version, savedAt, savedBy) {
  writeTable_('Meta', [['version', String(version)], ['savedAt', savedAt], ['savedBy', savedBy], ['schema', VERSION_]]);
}
function appendLog_(e) {
  sheet_('AuditLog').appendRow([txt_(e.at), String(e.version), e.user, e.action, e.year === null || e.year === undefined ? '' : String(e.year), clip_(e.detail || '', 2000), clip_(e.changes || '', 6000)]);
}
function recentLog_(n) {
  var rows = readRaw_('AuditLog');
  return rows.slice(-n).map(function (r) {
    var changes = txt_(r[6]);
    var detail = txt_(r[5]);
    return {
      at: txt_(r[0]), version: Number(r[1]) || 0, actor: txt_(r[2]), action: txt_(r[3]),
      year: txt_(r[4]) === '' ? null : Number(r[4]), detail: changes ? detail + ' ▸ ' + changes : detail
    };
  });
}
function writeBackup_(stateStr, version, user, note) {
  var sh = sheet_('Backup');
  var chunks = [];
  for (var i = 0; i < stateStr.length; i += CELL_LIMIT_) chunks.push(stateStr.slice(i, i + CELL_LIMIT_));
  sh.appendRow([nowIso_(), String(version), user + (note ? ' (' + note + ')' : ''), stateStr.length].concat(chunks));
  var last = sh.getLastRow();
  if (last - 1 > BACKUP_KEEP_) sh.deleteRows(2, last - 1 - BACKUP_KEEP_);
}
function readLegacy_() {
  // 기존(v1) 방식: 첫 번째 사용자 시트의 A1 셀에 들어 있던 JSON(문자열이 한 번 더 JSON 인코딩되어 있음)
  var sheets = ss_().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var nm = sheets[i].getName();
    if (HEADERS_[nm]) continue;
    var v = sheets[i].getRange(1, 1).getValue();
    if (v === '' || v === null) continue;
    var s = String(v);
    try {
      var once = JSON.parse(s);
      return typeof once === 'string' ? once : JSON.stringify(once);
    } catch (e) { /* 다음 시트 */ }
  }
  return null;
}

/* ───────────────────────── 상태 읽기 ───────────────────────── */
function getState_() {
  var records = readRaw_('Records').map(function (r) {
    var y = Number(r[1]), m = Number(r[2]);
    return { id: ymKey_(y, m), year: y, month: m, diesel: n0_(r[3]), cityGas: n0_(r[4]), electricity: n0_(r[5]), water: n0_(r[6]), revenue: num_(r[7]) };
  });
  var targets = {};
  readRaw_('Targets').forEach(function (r) {
    var y = Number(r[1]), m = Number(r[2]);
    if (!targets[y]) targets[y] = [];
    targets[y][m - 1] = { diesel: n0_(r[3]), cityGas: n0_(r[4]), electricity: n0_(r[5]), water: n0_(r[6]), revenue: num_(r[7]) };
  });
  Object.keys(targets).forEach(function (y) {
    for (var i = 0; i < 12; i++) if (!targets[y][i]) targets[y][i] = { diesel: 0, cityGas: 0, electricity: 0, water: 0, revenue: null };
  });
  var planMeta = {};
  readRaw_('PlanMeta').forEach(function (r) { try { planMeta[Number(r[0])] = JSON.parse(txt_(r[1])); } catch (e) { /* 무시 */ } });
  var cfg = {};
  readRaw_('Config').forEach(function (r) { try { cfg[txt_(r[0])] = JSON.parse(txt_(r[1])); } catch (e) { /* 무시 */ } });
  var scenarios = readRaw_('Scenarios').map(function (r) { try { return JSON.parse(txt_(r[3])); } catch (e) { return null; } }).filter(Boolean);
  var closedMonths = {};
  readRaw_('ClosedMonths').forEach(function (r) {
    closedMonths[ymKey_(Number(r[1]), Number(r[2]))] = { closedAt: txt_(r[3]), closedBy: txt_(r[4]), reason: txt_(r[5]) };
  });
  var years = Array.isArray(cfg.availableYears) ? cfg.availableYears : null;
  if (!years) {
    var set = {};
    records.forEach(function (r) { set[r.year] = 1; });
    Object.keys(targets).forEach(function (y) { set[y] = 1; });
    years = Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }
  return { availableYears: years, records: records, targets: targets, planMeta: planMeta, auditConfig: cfg.auditConfig || null, scenarios: scenarios, closedMonths: closedMonths };
}

/* ───────────────────────── 검증 ───────────────────────── */
function validateState_(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) fail_('INVALID_STATE', '저장할 데이터 형식이 올바르지 않습니다.');
  if (!Array.isArray(s.availableYears) || s.availableYears.some(function (y) { return !(Number(y) >= 2000 && Number(y) <= 2100); })) fail_('INVALID_STATE', '연도 목록이 올바르지 않습니다.');
  if (!Array.isArray(s.records) || s.records.length > MAX_RECORDS_) fail_('INVALID_STATE', '실적 목록이 올바르지 않거나 너무 많습니다.');
  var seen = {};
  s.records.forEach(function (r) {
    var y = Number(r && r.year), m = Number(r && r.month);
    if (!(y >= 2000 && y <= 2100) || !(m >= 1 && m <= 12) || y !== Math.floor(y) || m !== Math.floor(m)) fail_('INVALID_RECORD', '실적의 연도/월이 올바르지 않습니다: ' + json_(r && r.id));
    var key = ymKey_(y, m);
    if (seen[key]) fail_('INVALID_RECORD', '같은 월의 실적이 중복되었습니다: ' + key);
    seen[key] = 1;
    ENERGY_.forEach(function (f) {
      var v = num_(r[f]);
      if (r[f] !== '' && r[f] !== null && r[f] !== undefined && (v === null || v < 0)) fail_('INVALID_RECORD', key + ' ' + FIELD_LABEL_[f] + ' 값이 올바르지 않습니다(0 이상의 숫자).');
    });
    var rev = num_(r.revenue);
    if (r.revenue !== '' && r.revenue !== null && r.revenue !== undefined && (rev === null || rev < 0)) fail_('INVALID_RECORD', key + ' 매출 값이 올바르지 않습니다.');
  });
  if (s.targets !== undefined && (typeof s.targets !== 'object' || s.targets === null || Array.isArray(s.targets))) fail_('INVALID_STATE', '목표 형식이 올바르지 않습니다.');
  Object.keys(s.targets || {}).forEach(function (y) {
    var arr = s.targets[y];
    if (!(Number(y) >= 2000 && Number(y) <= 2100) || !Array.isArray(arr) || arr.length > 12) fail_('INVALID_TARGET', y + '년 목표 형식이 올바르지 않습니다.');
    arr.forEach(function (t, i) {
      ENERGY_.forEach(function (f) {
        var v = num_(t && t[f]);
        if (t && t[f] !== '' && t[f] !== null && t[f] !== undefined && (v === null || v < 0)) fail_('INVALID_TARGET', y + '년 ' + (i + 1) + '월 목표(' + FIELD_LABEL_[f] + ') 값이 올바르지 않습니다.');
      });
    });
  });
  if (s.planMeta !== undefined && (typeof s.planMeta !== 'object' || s.planMeta === null)) fail_('INVALID_STATE', '목표 수립 기록 형식이 올바르지 않습니다.');
  Object.keys(s.planMeta || {}).forEach(function (y) { if (json_(s.planMeta[y]).length > CELL_LIMIT_) fail_('TOO_LARGE', y + '년 목표 수립 기록이 너무 큽니다.'); });
  if (s.auditConfig && json_(s.auditConfig).length > CELL_LIMIT_) fail_('TOO_LARGE', '보고서 설정이 너무 큽니다.');
  if (s.scenarios !== undefined) {
    if (!Array.isArray(s.scenarios) || s.scenarios.length > 50) fail_('INVALID_STATE', '시나리오 목록이 올바르지 않습니다.');
    s.scenarios.forEach(function (sc) {
      if (!sc || !sc.id || json_(sc).length > CELL_LIMIT_) fail_('INVALID_STATE', '시나리오 형식이 올바르지 않거나 너무 큽니다.');
    });
  }
  Object.keys(s.closedMonths || {}).forEach(function (k) { if (!/^\d{4}-\d{2}$/.test(k)) fail_('INVALID_STATE', '마감 월 형식이 올바르지 않습니다: ' + k); });
}

/* ───────────────────────── 저장(변경 비교·기록) ───────────────────────── */
function fmtNum_(v) { return v === null || v === undefined ? '-' : String(Math.round(Number(v) * 1000) / 1000); }
function sameRec_(a, b) {
  if (!a || !b) return !a && !b;
  var same = true;
  ENERGY_.concat(['revenue']).forEach(function (f) { if (num_(a[f]) !== num_(b[f])) same = false; });
  return same;
}
// 모든 항목이 0(또는 비어 있음)인 레코드 — 예전 방식이 12개월을 전부 저장하던 시절의 빈 칸 흔적
function isEmptyRec_(r) {
  var empty = true;
  ENERGY_.forEach(function (f) { if (n0_(r[f]) !== 0) empty = false; });
  var rev = num_(r.revenue);
  return empty && (rev === null || rev === 0);
}
function byKey_(records) { var m = {}; records.forEach(function (r) { m[ymKey_(Number(r.year), Number(r.month))] = r; }); return m; }

function applyState_(state, ctx) {
  var cur = getState_();
  var changes = [];
  var now = ctx.now, user = ctx.user;

  // 월 마감: 마감된 월의 실적은 수정·삭제할 수 없다. 마감 해제는 사유가 필요하다.
  var oldClosed = cur.closedMonths, newClosed = state.closedMonths || {};
  var curRecs = byKey_(cur.records), newRecs = byKey_(state.records);
  var violations = [];
  Object.keys(oldClosed).forEach(function (k) { if (newClosed[k] && !sameRec_(curRecs[k], newRecs[k])) violations.push(k); });
  if (violations.length && !ctx.force) fail_('LOCKED_MONTH', '마감된 월의 실적은 수정할 수 없습니다: ' + violations.join(', ') + ' (마감 해제 후 수정하세요)');
  var reopened = Object.keys(oldClosed).filter(function (k) { return !newClosed[k]; });
  if (reopened.length && !ctx.force && !String(ctx.unlockReason || '').trim()) fail_('UNLOCK_REASON_REQUIRED', '마감 해제 사유를 입력해야 합니다.');
  reopened.forEach(function (k) { changes.push('마감 해제 ' + k + ' (사유: ' + String(ctx.unlockReason || '복원').trim() + ')'); });

  // 실적
  var oldRawRec = {};
  readRaw_('Records').forEach(function (r) { oldRawRec[ymKey_(Number(r[1]), Number(r[2]))] = r; });
  var recRows = [];
  Object.keys(newRecs).sort().forEach(function (k) {
    var r = newRecs[k], o = curRecs[k], raw = oldRawRec[k];
    var y = Number(r.year), m = Number(r.month);
    var changed = !o || !sameRec_(o, r);
    if (!o) changes.push('실적 ' + k + (isEmptyRec_(r) ? ' 빈 레코드 추가' : ' 신규'));
    else if (changed) ENERGY_.concat(['revenue']).forEach(function (f) { if (num_(o[f]) !== num_(r[f])) changes.push('실적 ' + k + ' ' + FIELD_LABEL_[f] + ' ' + fmtNum_(o[f]) + '→' + fmtNum_(r[f])); });
    recRows.push([k, y, m, n0_(r.diesel), n0_(r.cityGas), n0_(r.electricity), n0_(r.water), num_(r.revenue) === null ? '' : num_(r.revenue),
      changed ? now : txt_(raw && raw[8]), changed ? user : txt_(raw && raw[9])]);
  });
  Object.keys(curRecs).forEach(function (k) { if (!newRecs[k]) changes.push('실적 ' + k + (isEmptyRec_(curRecs[k]) ? ' 빈 레코드 정리(전부 0)' : ' 삭제')); });
  writeTable_('Records', recRows);

  // 월별 목표
  var oldRawTgt = {};
  readRaw_('Targets').forEach(function (r) { oldRawTgt[ymKey_(Number(r[1]), Number(r[2]))] = r; });
  var tgtRows = [];
  Object.keys(state.targets || {}).sort().forEach(function (y) {
    for (var i = 0; i < 12; i++) {
      var t = (state.targets[y] || [])[i] || {};
      var k = ymKey_(Number(y), i + 1);
      var o = cur.targets[y] ? cur.targets[y][i] : null, raw = oldRawTgt[k];
      var changed = !o || !sameRec_(o, t);
      if (o && changed) ENERGY_.concat(['revenue']).forEach(function (f) { if (num_(o[f]) !== num_(t[f])) changes.push('목표 ' + k + ' ' + FIELD_LABEL_[f] + ' ' + fmtNum_(o[f]) + '→' + fmtNum_(t[f])); });
      tgtRows.push([k, Number(y), i + 1, n0_(t.diesel), n0_(t.cityGas), n0_(t.electricity), n0_(t.water), num_(t.revenue) === null ? '' : num_(t.revenue),
        changed ? now : txt_(raw && raw[8]), changed ? user : txt_(raw && raw[9])]);
    }
    if (!cur.targets[y]) changes.push('목표 ' + y + '년 신규 등록');
  });
  Object.keys(cur.targets).forEach(function (y) { if (!(state.targets || {})[y]) changes.push('목표 ' + y + '년 삭제'); });
  writeTable_('Targets', tgtRows);

  // 목표 수립 기록
  var oldPlanRaw = {};
  readRaw_('PlanMeta').forEach(function (r) { oldPlanRaw[Number(r[0])] = r; });
  var planRows = [];
  Object.keys(state.planMeta || {}).sort().forEach(function (y) {
    var js = json_(state.planMeta[y]);
    var same = json_(cur.planMeta[y]) === js;
    if (!same) changes.push('목표 수립 기록 ' + y + '년 ' + (cur.planMeta[y] ? '변경' : '신규'));
    planRows.push([Number(y), js, same ? txt_(oldPlanRaw[y] && oldPlanRaw[y][2]) : now, same ? txt_(oldPlanRaw[y] && oldPlanRaw[y][3]) : user]);
  });
  writeTable_('PlanMeta', planRows);

  // 설정(연도 목록·보고서 설정)
  var oldCfgRaw = {};
  readRaw_('Config').forEach(function (r) { oldCfgRaw[txt_(r[0])] = r; });
  var cfgRows = [];
  [['availableYears', state.availableYears.map(Number)], ['auditConfig', state.auditConfig || null]].forEach(function (p) {
    var same = json_(p[1]) === json_(p[0] === 'availableYears' ? cur.availableYears : cur.auditConfig);
    if (!same) changes.push(p[0] === 'availableYears' ? '연도 목록 변경' : '보고서 설정 변경');
    cfgRows.push([p[0], json_(p[1]), same ? txt_(oldCfgRaw[p[0]] && oldCfgRaw[p[0]][2]) : now, same ? txt_(oldCfgRaw[p[0]] && oldCfgRaw[p[0]][3]) : user]);
  });
  writeTable_('Config', cfgRows);

  // 시나리오
  var curScen = {}; cur.scenarios.forEach(function (s) { curScen[s.id] = s; });
  var scenRows = [];
  (state.scenarios || []).forEach(function (sc) {
    if (!curScen[sc.id]) changes.push('시나리오 저장 “' + sc.name + '”');
    scenRows.push([sc.id, sc.name || '', sc.savedAt || now, json_(sc)]);
  });
  cur.scenarios.forEach(function (s) { if (!(state.scenarios || []).some(function (x) { return x.id === s.id; })) changes.push('시나리오 삭제 “' + s.name + '”'); });
  writeTable_('Scenarios', scenRows);

  // 마감 월(마감 시각·마감자는 서버 기준으로 기록)
  var closedRows = [];
  Object.keys(newClosed).sort().forEach(function (k) {
    var o = oldClosed[k];
    var y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7));
    if (!o) changes.push('월 마감 ' + k);
    closedRows.push([k, y, m, o ? o.closedAt : now, o ? o.closedBy : user, o ? o.reason : txt_(newClosed[k] && newClosed[k].reason)]);
  });
  writeTable_('ClosedMonths', closedRows);
  return changes;
}

/* ───────────────────────── API ───────────────────────── */
function handleLoad_() {
  var meta = readMeta_();
  if (meta.version < 1) {
    var legacy = readLegacy_();
    return { result: 'success', data: legacy, version: 0, legacy: !!legacy, changeLog: [] };
  }
  var state = getState_();
  return { result: 'success', data: JSON.stringify(state), version: meta.version, savedAt: meta.savedAt, savedBy: meta.savedBy, changeLog: recentLog_(LOG_RETURN_) };
}

function handleSave_(p) {
  var user = authorize_(p.sessionToken);
  var raw = typeof p.data === 'string' ? p.data : json_(p.data);
  if (raw.length > MAX_BODY_) fail_('TOO_LARGE', '저장할 데이터가 너무 큽니다.');
  var state;
  try { state = JSON.parse(raw); } catch (e) { fail_('INVALID_STATE', '저장할 데이터를 읽을 수 없습니다.'); }
  validateState_(state);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var meta = readMeta_();
    var hasBase = p.baseVersion !== undefined && p.baseVersion !== null;
    if (enforceAuth_() && !hasBase) fail_('VERSION_REQUIRED', '데이터 버전 정보가 없습니다. 화면을 새로고침한 뒤 다시 시도하세요.');
    if (hasBase && Number(p.baseVersion) !== meta.version) {
      fail_('VERSION_CONFLICT', '다른 사용자가 먼저 저장했습니다. 최신 데이터를 다시 불러온 뒤 수정하세요.');
    }
    if (meta.version < 1) {
      var legacy = readLegacy_();
      if (legacy) writeBackup_(legacy, 0, user, '기존 A1 데이터 이관 전 백업');
    } else {
      writeBackup_(json_(getState_()), meta.version, user, '저장 직전');
    }
    var now = nowIso_();
    var changes = applyState_(state, { user: user, now: now, unlockReason: p.unlockReason });
    var version = meta.version + 1;
    writeMeta_(version, now, user);
    var lg = p.log || {};
    appendLog_({
      at: now, version: version, user: user,
      action: lg.action || (meta.version < 1 ? '초기 이관' : '저장'),
      year: lg.year === undefined ? '' : lg.year,
      detail: lg.detail || '', changes: changes.join('; ')
    });
    return { result: 'success', version: version, savedAt: now, changeLog: recentLog_(LOG_RETURN_) };
  } finally {
    lock.releaseLock();
  }
}

function handleAuth_(p) {
  var user = authenticate_(p.password);
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({ user: user }), SESSION_TTL_SEC_);
  appendLog_({ at: nowIso_(), version: readMeta_().version, user: user, action: '로그인', year: '', detail: '관리자 인증 성공', changes: '' });
  return { result: 'success', user: user, sessionToken: token, ttlSec: SESSION_TTL_SEC_, enforce: enforceAuth_() };
}

function doPost(e) {
  var out;
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.action === 'load') out = handleLoad_(p);
    else if (p.action === 'save') out = handleSave_(p);
    else if (p.action === 'auth') out = handleAuth_(p);
    else if (p.action === 'logout') { if (p.sessionToken) CacheService.getScriptCache().remove('sess_' + p.sessionToken); out = { result: 'success' }; }
    else fail_('UNKNOWN_ACTION', '지원하지 않는 요청입니다.');
  } catch (err) {
    out = { result: 'error', code: err.code || 'SERVER_ERROR', message: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return ContentService.createTextOutput('대성스틸 온실가스 인벤토리 API ' + VERSION_ + ' 가동 중'); }

/* ───────────────────────── 편집기에서 실행하는 관리 도구 ───────────────────────── */
// 백업(버전 번호)으로 되돌린다: restoreBackup(12)
function restoreBackup(version) {
  var rows = readRaw_('Backup');
  var found = null;
  rows.forEach(function (r) { if (Number(r[1]) === Number(version)) found = r; });
  if (!found) throw new Error('해당 버전의 백업이 없습니다: ' + version);
  var str = '';
  for (var i = 4; i < found.length; i++) str += txt_(found[i]);
  var state = JSON.parse(str);
  validateState_(state);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var meta = readMeta_();
    writeBackup_(json_(getState_()), meta.version, '시스템', '복원 직전');
    state.closedMonths = state.closedMonths || {};
    var now = nowIso_();
    var changes = applyState_(state, { user: '시스템(복원)', now: now, unlockReason: '백업 복원', force: true });
    var v = meta.version + 1;
    writeMeta_(v, now, '시스템(복원)');
    appendLog_({ at: now, version: v, user: '시스템(복원)', action: '백업 복원', year: '', detail: '버전 ' + version + ' 백업으로 복원', changes: changes.join('; ') });
  } finally { lock.releaseLock(); }
}
