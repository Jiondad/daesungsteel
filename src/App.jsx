import { useEffect, useRef, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { DataEntry } from './components/DataEntry';
import { Roadmap } from './components/Roadmap';
import { TargetSetting } from './components/TargetSetting';
import { PLAN_METHOD_START_YEAR, TARGETS_2026 } from './lib/constants';
import { buildYearPlanTargets } from './lib/planning';
import { describeDiff, diffRecords, normalizeAuditConfig } from './lib/audit';
import { AuditReport } from './components/AuditReport';
import { authenticate, loadDbResponse, logoutSession, saveDbState } from './services/db';

export function App() {
  const [records, setRecords] = useState([]);
  const [targets, setTargets] = useState({});
  const [activeTab, setActiveTab] = useState('dashboard');
  const [availableYears, setAvailableYears] = useState([2026, 2025, 2024]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [session, setSession] = useState(null);          // 서버가 발급한 관리자 세션 { token, user }
  const sessionRef = useRef(null);
  const dbVersionRef = useRef(null);                      // 서버 데이터 버전(동시 저장 감지용)
  const [closedMonths, setClosedMonths] = useState({});
  const [legacyMode, setLegacyMode] = useState(false);
  const isAdminAuthenticated = !!session;
  const setDbVersion = (v) => { dbVersionRef.current = v; };
  const startSession = (sess) => { sessionRef.current = sess; setSession(sess); };
  const [cachedDb, setCachedDb] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [planMeta, setPlanMeta] = useState({});
  const [auditConfig, setAuditConfig] = useState(normalizeAuditConfig(null));
  const [scenarios, setScenarios] = useState([]);
  const [changeLog, setChangeLog] = useState([]);

  // 관리자 인증: 비밀번호는 서버에서 확인하며, 로그인하면 서버가 세션을 발급한다(화면 코드에는 비밀번호가 없다).
  const ensureAdmin = async () => {
    if (sessionRef.current) return true;
    const pw = window.prompt("관리자 인증이 필요합니다. 관리자 비밀번호를 입력하세요:");
    if (!pw) return false;
    try {
      const r = await authenticate(pw);
      if (r && r.result === 'success') {
        startSession({ token: r.sessionToken, user: r.user });
        return true;
      }
      alert('❌ ' + ((r && r.message) || '인증에 실패했습니다.'));
    } catch (e) {
      console.error(e);
      alert('인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return false;
  };

  const handleLogout = async () => {
    const sess = sessionRef.current;
    startSession(null);
    if (activeTab === 'entry' || activeTab === 'targets_tab' || activeTab === 'audit_tab') setActiveTab('dashboard');
    try { if (sess) await logoutSession(sess.token); } catch (e) { /* 서버 세션은 시간이 지나면 자동 만료 */ }
  };

  const handleTabChange = async (tabId) => {
    if (tabId === 'entry' || tabId === 'targets_tab' || tabId === 'audit_tab') {
      if (await ensureAdmin()) setActiveTab(tabId);
    } else {
      setActiveTab(tabId);
    }
  };

  // 저장된 부가 정보(보고서 설정·시나리오·변경 이력) 반영
  const applyExtras = (st) => {
    setAuditConfig(normalizeAuditConfig(st && st.auditConfig));
    setScenarios(Array.isArray(st && st.scenarios) ? st.scenarios : []);
    setChangeLog(Array.isArray(st && st.changeLog) ? st.changeLog : []);
    setClosedMonths(st && st.closedMonths && typeof st.closedMonths === 'object' ? st.closedMonths : {});
  };

  const loadData = async (silent = false, force = false) => {
    // 인메모리 캐시가 존재하는 경우, 서버 fetch 없이 즉시 메모리 데이터 로드 (딜레이 완전 제거)
    if (cachedDb && !force) {
      const loadedYears = Array.isArray(cachedDb.availableYears) ? cachedDb.availableYears : [2026, 2025, 2024];
      const loadedRecords = Array.isArray(cachedDb.records) ? cachedDb.records : [];
      const loadedTargets = (cachedDb.targets && typeof cachedDb.targets === 'object') ? cachedDb.targets : {};
      
      setAvailableYears(loadedYears);
      setRecords(loadedRecords);
      setTargets(loadedTargets);
      setPlanMeta(cachedDb.planMeta && typeof cachedDb.planMeta === 'object' ? cachedDb.planMeta : {});
      applyExtras(cachedDb);
      return;
    }

    if (!silent) setIsLoading(true);
    try {
      const responseJson = await loadDbResponse();
      if (responseJson && responseJson.result === "success" && responseJson.data) {
        const parsedState = JSON.parse(responseJson.data);
        
        // 최초 로드 시 메모리에 통째로 캐싱
        setCachedDb(parsedState);

        const loadedYears = Array.isArray(parsedState.availableYears) ? parsedState.availableYears : [2026, 2025, 2024];
        const loadedRecords = Array.isArray(parsedState.records) ? parsedState.records : [];
        const loadedTargets = (parsedState.targets && typeof parsedState.targets === 'object') ? parsedState.targets : {};
        
        setAvailableYears(loadedYears);
        setRecords(loadedRecords);
        setTargets(loadedTargets);
        setPlanMeta(parsedState.planMeta && typeof parsedState.planMeta === 'object' ? parsedState.planMeta : {});
        applyExtras(parsedState);
        if (Array.isArray(responseJson.changeLog)) setChangeLog(responseJson.changeLog);
        setDbVersion(typeof responseJson.version === 'number' ? responseJson.version : null);
        setLegacyMode(!!responseJson.legacy);
        setLoadError('');
      } else if (responseJson && responseJson.result === "success") {
        // 서버 응답은 정상이나 저장된 데이터가 없는 경우(최초 사용): 빈 상태로 시작한다.
        // 가상 데이터를 만들지 않으며, 사용자가 저장하기 전에는 서버에 아무것도 쓰지 않는다.
        const defaultYears = [2026, 2025, 2024];
        const defaultTargets = {};
        defaultYears.forEach(yr => { defaultTargets[yr] = TARGETS_2026; });
        setCachedDb({ availableYears: defaultYears, records: [], targets: defaultTargets, planMeta: {} });
        setAvailableYears(defaultYears);
        setRecords([]);
        setTargets(defaultTargets);
        setPlanMeta({});
        applyExtras(null);
        setDbVersion(typeof responseJson.version === 'number' ? responseJson.version : 0);
        setLegacyMode(false);
        setLoadError('');
      } else {
        // 오류 응답: 기존 데이터를 덮어쓰지 않도록 저장을 막고 안내한다.
        setLoadError('데이터를 불러오지 못했습니다. 서버 응답이 올바르지 않아 저장을 잠시 막았습니다.');
      }
    } catch (e) {
      console.error("데이터 로드 중 오류 발생:", e);
      setLoadError('데이터를 불러오지 못했습니다(네트워크/서버 오류). 저장을 잠시 막았습니다.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // 서버의 기존 데이터를 확인할 수 없을 때에만 쓰는 수동 선택지(최초 구축 등). 저장 시 서버 데이터가 덮어써질 수 있다.
  const startEmpty = () => {
    if (!window.confirm('서버의 기존 데이터를 확인하지 못했습니다.\n빈 상태로 시작하면, 이후 저장할 때 서버에 있던 기존 데이터가 덮어써질 수 있습니다.\n정말 빈 상태로 시작하시겠습니까?')) return;
    const defaultYears = [2026, 2025, 2024];
    const defaultTargets = {};
    defaultYears.forEach(yr => { defaultTargets[yr] = TARGETS_2026; });
    setAvailableYears(defaultYears);
    setRecords([]);
    setTargets(defaultTargets);
    setPlanMeta({});
    applyExtras(null);
    setLoadError('');
  };

  const handleSaveAll = async (updatedYears = availableYears, updatedRecords = records, updatedTargets = targets, updatedPlanMeta = planMeta, extra = {}) => {
    if (loadError) {
      alert('데이터를 불러오지 못한 상태에서는 저장할 수 없습니다. 상단의 [다시 시도]로 먼저 불러와 주세요.');
      return false;
    }
    try {
      setIsSaving(true);
      const nextConfig = extra.auditConfig !== undefined ? extra.auditConfig : auditConfig;
      const nextScenarios = extra.scenarios !== undefined ? extra.scenarios : scenarios;
      const nextClosed = extra.closedMonths !== undefined ? extra.closedMonths : closedMonths;
      // 변경 이력은 서버가 로그인한 사용자 기준으로 기록한다(화면에서는 작업 내용만 전달).
      const stateToSave = {
        availableYears: updatedYears,
        records: updatedRecords,
        targets: updatedTargets,
        planMeta: updatedPlanMeta,
        auditConfig: nextConfig,
        scenarios: nextScenarios,
        closedMonths: nextClosed
      };
      const sess = sessionRef.current;
      const result = await saveDbState(stateToSave, {
        sessionToken: sess ? sess.token : undefined,
        baseVersion: dbVersionRef.current === null ? undefined : dbVersionRef.current,
        log: extra.log,
        unlockReason: extra.unlockReason
      });
      if (result && result.result === "success") {
        // 저장 성공 시 로컬 인메모리 캐시도 즉시 동기화
        setCachedDb(stateToSave);
        setAuditConfig(nextConfig);
        setScenarios(nextScenarios);
        setClosedMonths(nextClosed);
        if (typeof result.version === 'number') setDbVersion(result.version);
        if (Array.isArray(result.changeLog)) setChangeLog(result.changeLog);
        setLegacyMode(false);
        alert("대성스틸 공용 구글 DB에 안전하게 일괄 저장이 완료되었습니다!");
        return true;
      }
      const code = result && result.code;
      const msg = result && result.message ? result.message : 'DB 저장 중 오류가 발생했습니다.';
      if (code === 'VERSION_CONFLICT') {
        alert(msg + '\n화면을 최신 데이터로 다시 불러옵니다. 방금 입력한 내용은 최신 데이터를 확인한 뒤 다시 저장해 주세요.');
        await loadData(true, true);
      } else if (code === 'AUTH_REQUIRED') {
        startSession(null);
        alert('관리자 인증이 만료되었습니다. 다시 인증한 뒤 저장해 주세요.');
      } else {
        alert('저장하지 못했습니다: ' + msg);
      }
      return false;
    } catch (error) {
      console.error(error);
      alert("구글 서버 통신 실패: " + error.toString());
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveRecord = async (record) => {
    const nextRecords = [...records];
    const idx = nextRecords.findIndex(r => r.id === record.id);
    if (idx > -1) {
      nextRecords[idx] = record;
    } else {
      nextRecords.push(record);
    }

    const logDetail = describeDiff(diffRecords(records, nextRecords, record.year)) || '변경 없음';
    const success = await handleSaveAll(availableYears, nextRecords, targets, planMeta, { log: { action: '실적 저장', detail: `${record.year}년 ${record.month}월: ${logDetail}`, year: record.year } });
    if (success) {
      setRecords(nextRecords);
    }
    return success;
  };

  const handleSaveRecords = async (year, yearRecords) => {
    const filtered = records.filter(r => r.year !== year);
    const nextRecords = [...filtered, ...yearRecords];

    const logDetail = describeDiff(diffRecords(records, nextRecords, year)) || '변경 없음';
    const success = await handleSaveAll(availableYears, nextRecords, targets, planMeta, { log: { action: '실적 일괄 저장', detail: `${year}년: ${logDetail}`, year } });
    if (success) {
      setRecords(nextRecords);
    }
    return success;
  };

  const handleDeleteRecord = async (id) => {
    if (window.confirm('정말로 이 월별 실적 기록을 삭제하시겠습니까? 관련 탄소 배출 데이터가 영구 삭제됩니다.')) {
      const target = records.find(r => r.id === id);
      const nextRecords = records.filter(r => r.id !== id);
      const success = await handleSaveAll(availableYears, nextRecords, targets, planMeta, {
        log: { action: '실적 삭제', detail: target ? `${target.year}년 ${target.month}월 기록 삭제` : `기록 삭제(${id})`, year: target ? target.year : null }
      });
      if (success) {
        setRecords(nextRecords);
      }
    }
  };

  const handleSaveTargets = async (year, newTargets, meta) => {
    const nextTargets = { ...targets, [year]: newTargets };
    const now = new Date().toISOString();
    let nextMeta = planMeta;
    if (meta) {
      // 자동 수립 근거 기록(감사 대응): 방법, 기준 연도, 목표 출처, 저장 시각
      nextMeta = { ...planMeta, [year]: { ...meta, savedAt: now } };
    } else if (planMeta[year]) {
      // 자동 수립 이후 목표를 직접 변경한 경우 기록에 표시
      nextMeta = { ...planMeta, [year]: { ...planMeta[year], modifiedAfterPlan: true, modifiedAt: now } };
    }
    const logDetail = meta
      ? `${meta.method}${meta.reason ? ' / 사유: ' + meta.reason : ''}${meta.lockedMonths && meta.lockedMonths.length ? ' / 기존 목표 유지: ' + meta.lockedMonths.join(',') + '월' : ''}`
      : '월별 목표 수동 수정';
    const success = await handleSaveAll(availableYears, records, nextTargets, nextMeta, {
      log: { action: meta ? '목표 저장(자동 수립)' : '목표 저장(수동)', detail: `${year}년: ${logDetail}`, year }
    });
    if (success) {
      setTargets(nextTargets);
      setPlanMeta(nextMeta);
    }
    return success;
  };

  // 보고서 설정(조직경계·배출계수 출처·결재) 저장
  const handleSaveAuditConfig = async (cfg) => {
    if (!(await ensureAdmin())) return false;
    return handleSaveAll(availableYears, records, targets, planMeta, {
      auditConfig: cfg, log: { action: '보고서 설정 저장', detail: '조직경계·배출계수 출처·결재 정보', year: null }
    });
  };

  // 월 마감: 마감한 월의 실적은 서버가 수정·삭제를 막는다. 해제하려면 사유가 필요하며 이력에 남는다.
  const handleToggleClose = async (year, month, close) => {
    if (!(await ensureAdmin())) return false;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const next = { ...closedMonths };
    let extra;
    if (close) {
      if (!window.confirm(`${year}년 ${month}월 실적을 마감합니다.\n마감하면 이 달의 실적은 수정·삭제할 수 없습니다(해제하려면 사유가 필요합니다).\n저장된 실적 기준으로 마감할까요?`)) return false;
      next[key] = { reason: '' };
      extra = { closedMonths: next, log: { action: '월 마감', detail: `${year}년 ${month}월 실적 마감`, year } };
    } else {
      const reason = window.prompt(`${year}년 ${month}월 마감을 해제합니다.\n해제 사유를 입력하세요(필수, 이력에 기록됩니다):`);
      if (!reason || !reason.trim()) { alert('해제 사유가 없어 취소했습니다.'); return false; }
      delete next[key];
      extra = { closedMonths: next, unlockReason: reason.trim(), log: { action: '월 마감 해제', detail: `${year}년 ${month}월 · 사유: ${reason.trim()}`, year } };
    }
    return handleSaveAll(availableYears, records, targets, planMeta, extra);
  };

  // 기존(셀 하나) 방식 데이터를 표 구조로 이관
  const handleLegacyMigrate = async () => {
    if (!(await ensureAdmin())) return;
    await handleSaveAll(availableYears, records, targets, planMeta, { log: { action: '초기 이관', detail: '기존 A1 데이터를 표 구조로 이관', year: null } });
  };

  // 로드맵 시나리오 저장(가정·근거·결과를 스냅샷으로 보관)
  const handleSaveScenario = async (snapshot) => {
    if (!(await ensureAdmin())) return false;
    const next = [...scenarios.filter(sc => sc.id !== snapshot.id), snapshot].slice(-20);
    return handleSaveAll(availableYears, records, targets, planMeta, {
      scenarios: next, log: { action: '로드맵 시나리오 저장', detail: `“${snapshot.name}”`, year: null }
    });
  };

  const handleRegisterYear = async (newYear) => {
    const yr = parseInt(newYear, 10);
    if (isNaN(yr) || yr < 1000 || yr > 9999) {
      alert('올바른 4자리 연도를 입력해주세요 (예: 2027).');
      return false;
    }

    if (availableYears.includes(yr)) {
      alert('이미 등록된 연도입니다.');
      return false;
    }

    const nextYears = [...availableYears, yr].sort((a, b) => b - a);
    
    const nextRecords = [...records];
    let nextTargets;
    let nextMeta = planMeta;
    const now = new Date().toISOString();

    if (yr < PLAN_METHOD_START_YEAR) {
      // 기존 방식 유지(2026년 이하): 기본 월별 목표를 그대로 사용
      nextTargets = { ...targets, [yr]: TARGETS_2026 };
    } else {
      // 2027년부터: 공식 로드맵 목표 + 계절 보정 자동 수립, 수립 근거를 함께 기록
      const gen = buildYearPlanTargets(records, yr, { method: '연도 등록 시 계절 보정 자동 수립' });
      if (gen) {
        nextTargets = { ...targets, [yr]: gen.targets };
        nextMeta = { ...planMeta, [yr]: { ...gen.meta, trigger: '연도 등록', savedAt: now } };
      } else {
        // 공식 로드맵 목표가 없는 연도: 직전 연도 목표를 복사하고 검토 필요 표시
        const prevYears = Object.keys(targets).map(Number).filter((y) => y < yr).sort((a, b) => b - a);
        const base = prevYears.length ? targets[prevYears[0]] : TARGETS_2026;
        nextTargets = { ...targets, [yr]: base };
        nextMeta = { ...planMeta, [yr]: { method: '직전 연도 목표 복사 (공식 로드맵 목표 없음)', needsReview: true, trigger: '연도 등록', savedAt: now } };
      }
    }

    const success = await handleSaveAll(nextYears, nextRecords, nextTargets, nextMeta, {
      log: { action: '연도 등록', detail: `${yr}년 등록${yr >= PLAN_METHOD_START_YEAR ? ' (목표 자동 수립)' : ''}`, year: yr }
    });
    if (success) {
      setAvailableYears(nextYears);
      setRecords(nextRecords);
      setTargets(nextTargets);
      setPlanMeta(nextMeta);
      return yr;
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1A17] flex flex-col font-sans relative">
      {isLoading && (
        <div className="fixed inset-0 z-[9999] bg-[#FAF9F6]/85 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#1C1A17] border-t-transparent shadow-sm"></div>
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-[#1C1A17] font-sans">중앙 공유 데이터베이스 연결 중...</p>
            <p className="text-[10px] text-[#57534E] font-mono uppercase tracking-wider">Loading real-time data from Google Sheets</p>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-[#1C1A17] border-b border-[#2C2A27] px-4 py-2.5 text-center text-xs text-[#E5E2D9] font-mono flex items-center justify-center gap-2 print:hidden">
        <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse inline-block" />
        <span className="tracking-wide">ANNUAL REPORT: {new Date().getFullYear()}년 대성스틸 온실가스 배출량(Scope 1·2) 및 감축 목표 관리</span>
      </div>

      {legacyMode && (
        <div className="bg-[#EFF6FF] border-b border-[#93C5FD] px-4 py-3 text-xs text-[#1E3A8A] flex flex-wrap items-center justify-center gap-3 print:hidden" data-testid="legacy-banner">
          <span>ℹ 기존(셀 하나에 통째로 저장하던) 방식의 데이터를 불러왔습니다. 관리자가 한 번 이관하면 시트가 표 구조(실적·목표·변경 이력 등)로 정리되며, 기존 데이터는 그대로 보존됩니다.</span>
          <button onClick={handleLegacyMigrate} className="px-3 py-1 bg-[#1E3A8A] text-white font-bold cursor-pointer">표 구조로 이관</button>
        </div>
      )}
      {loadError && (
        <div className="bg-[#FEF2F2] border-b border-[#FCA5A5] px-4 py-3 text-xs text-[#991B1B] font-mono flex flex-wrap items-center justify-center gap-3 print:hidden">
          <span>⚠ {loadError}</span>
          <button onClick={() => loadData()} className="px-3 py-1 bg-[#991B1B] text-white font-bold cursor-pointer">다시 시도</button>
          <button onClick={startEmpty} className="px-3 py-1 border border-[#991B1B] text-[#991B1B] font-bold cursor-pointer">빈 상태로 시작</button>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-[#E5E2D9] px-4 sm:px-6 lg:px-8 py-5 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-[#1C1A17] text-[#FAF9F6] flex items-center justify-center font-bold text-lg">DS</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[#1C1A17] font-display">(주)대성스틸 온실가스 인벤토리 시스템</h1>
                <span className="text-[10px] bg-[#15803D]/10 text-[#15803D] border border-[#15803D]/20 px-2 py-0.5 font-semibold tracking-wider uppercase font-mono">CARBON INVENTORY</span>
              </div>
              <p className="text-[11px] text-[#57534E] font-mono uppercase tracking-wider mt-0.5">Greenhouse Gas Management Portal — {new Date().getFullYear()}</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex bg-[#F2EFE9] p-1 border border-[#E5E2D9] gap-1 text-xs sm:text-sm font-medium">
            <button onClick={() => handleTabChange('dashboard')} className={`flex items-center gap-2 px-3 sm:px-4 py-2 transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-[#1C1A17] text-[#FAF9F6]' : 'text-[#57534E] hover:text-[#1C1A17]'}`}>대시보드</button>
            <button onClick={() => handleTabChange('entry')} className={`flex items-center gap-2 px-3 sm:px-4 py-2 transition-all cursor-pointer ${activeTab === 'entry' ? 'bg-[#1C1A17] text-[#FAF9F6]' : 'text-[#57534E] hover:text-[#1C1A17]'}`}>실적 입력</button>
            <button onClick={() => handleTabChange('targets_tab')} className={`flex items-center gap-2 px-3 sm:px-4 py-2 transition-all cursor-pointer ${activeTab === 'targets_tab' ? 'bg-[#1C1A17] text-[#FAF9F6]' : 'text-[#57534E] hover:text-[#1C1A17]'}`}>목표 설정</button>
            <button onClick={() => handleTabChange('roadmap')} className={`flex items-center gap-2 px-3 sm:px-4 py-2 transition-all cursor-pointer ${activeTab === 'roadmap' ? 'bg-[#1C1A17] text-[#FAF9F6]' : 'text-[#57534E] hover:text-[#1C1A17]'}`}>로드맵 시뮬레이터</button>
            <button onClick={() => handleTabChange('audit_tab')} className={`flex items-center gap-2 px-3 sm:px-4 py-2 transition-all cursor-pointer ${activeTab === 'audit_tab' ? 'bg-[#1C1A17] text-[#FAF9F6]' : 'text-[#57534E] hover:text-[#1C1A17]'}`}>감사 보고서</button>
          </nav>
          {session && (
            <button onClick={handleLogout} data-testid="logout" title="관리자 세션 종료" className="px-3 py-2 border border-[#1C1A17]/25 hover:bg-[#F2EFE9] text-xs font-bold cursor-pointer whitespace-nowrap">
              {session.user} · 로그아웃
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <Dashboard records={records} targets={targets} onSaveRecord={handleSaveRecord} onDeleteRecord={handleDeleteRecord} onSaveTargets={handleSaveTargets} onNavigateToEntry={() => handleTabChange('entry')} onRefresh={loadData} availableYears={availableYears} />}
        {activeTab === 'entry' && <DataEntry closedMonths={closedMonths} onToggleClose={handleToggleClose} records={records} onSaveRecords={handleSaveRecords} onDeleteRecord={handleDeleteRecord} targets={targets} onSaveTargets={handleSaveTargets} onRefresh={loadData} availableYears={availableYears} onRegisterYear={handleRegisterYear} isSaving={isSaving} />}
        {activeTab === 'targets_tab' && <TargetSetting planMeta={planMeta} targets={targets} onSaveTargets={handleSaveTargets} records={records} onRefresh={loadData} availableYears={availableYears} onRegisterYear={handleRegisterYear} isSaving={isSaving} />}
        {activeTab === 'roadmap' && <Roadmap records={records} scenarios={scenarios} onSaveScenario={handleSaveScenario} />}
        {activeTab === 'audit_tab' && (
          <AuditReport
            records={records} targets={targets} planMeta={planMeta} auditConfig={auditConfig} closedMonths={closedMonths}
            scenarios={scenarios} changeLog={changeLog} availableYears={availableYears}
            backupData={{ availableYears, records, targets, planMeta, auditConfig, scenarios, closedMonths, changeLog }}
            onSaveConfig={handleSaveAuditConfig} isSaving={isSaving}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#F5F2EB] border-t border-[#E5E2D9] py-8 px-4 text-center text-xs text-[#57534E] font-mono mt-12 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>본 시스템은 입력된 활동자료와 설정된 배출계수로 Scope 1·2 배출량을 산정하는 내부 관리 도구이며, 외부 검증 결과가 아닙니다.</p>
          <p>© {new Date().getFullYear()} (주)대성스틸 안전환경본부. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

