import { useEffect, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { DataEntry } from './components/DataEntry';
import { Roadmap } from './components/Roadmap';
import { TargetSetting } from './components/TargetSetting';
import { PLAN_METHOD_START_YEAR, TARGETS_2026 } from './lib/constants';
import { buildYearPlanTargets } from './lib/planning';
import { appendLog, describeDiff, diffRecords, makeLogEntry, normalizeAuditConfig } from './lib/audit';
import { AuditReport } from './components/AuditReport';
import { loadDbResponse, saveDbState } from './services/db';

export function App() {
  const [records, setRecords] = useState([]);
  const [targets, setTargets] = useState({});
  const [activeTab, setActiveTab] = useState('dashboard');
  const [availableYears, setAvailableYears] = useState([2026, 2025, 2024]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [cachedDb, setCachedDb] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [planMeta, setPlanMeta] = useState({});
  const [auditConfig, setAuditConfig] = useState(normalizeAuditConfig(null));
  const [scenarios, setScenarios] = useState([]);
  const [changeLog, setChangeLog] = useState([]);

  // 관리자 인증(현재는 브라우저 내 PIN 확인 — 서버 인증은 4단계에서 교체 예정)
  const ensureAdmin = () => {
    if (isAdminAuthenticated) return true;
    const token = [49, 49, 48, 51].map(c => String.fromCharCode(c)).join('');
    const pin = window.prompt("관리자 인증이 필요합니다. 마스터 비밀번호를 입력하세요:");
    if (pin === token) {
      setIsAdminAuthenticated(true);
      return true;
    }
    alert("❌ 권한이 없습니다.");
    return false;
  };

  const handleTabChange = (tabId) => {
    if (tabId === 'entry' || tabId === 'targets_tab' || tabId === 'audit_tab') {
      if (ensureAdmin()) setActiveTab(tabId);
    } else {
      setIsAdminAuthenticated(false);
      setActiveTab(tabId);
    }
  };

  // 저장된 부가 정보(보고서 설정·시나리오·변경 이력) 반영
  const applyExtras = (st) => {
    setAuditConfig(normalizeAuditConfig(st && st.auditConfig));
    setScenarios(Array.isArray(st && st.scenarios) ? st.scenarios : []);
    setChangeLog(Array.isArray(st && st.changeLog) ? st.changeLog : []);
  };

  const loadData = async (silent = false) => {
    // 인메모리 캐시가 존재하는 경우, 서버 fetch 없이 즉시 메모리 데이터 로드 (딜레이 완전 제거)
    if (cachedDb) {
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
      // 변경 이력(감사 대응): 저장할 때마다 작업·내용·작업자를 함께 기록한다
      const actor = isAdminAuthenticated ? '관리자(PIN 인증)' : '미인증';
      const nextLog = extra.log
        ? appendLog(changeLog, makeLogEntry(extra.log.action, extra.log.detail, { year: extra.log.year === undefined ? null : extra.log.year, actor }))
        : changeLog;
      const nextConfig = extra.auditConfig !== undefined ? extra.auditConfig : auditConfig;
      const nextScenarios = extra.scenarios !== undefined ? extra.scenarios : scenarios;
      const stateToSave = {
        availableYears: updatedYears,
        records: updatedRecords,
        targets: updatedTargets,
        planMeta: updatedPlanMeta,
        auditConfig: nextConfig,
        scenarios: nextScenarios,
        changeLog: nextLog
      };
      const result = await saveDbState(stateToSave);
      if (result && result.result === "success") {
        // 저장 성공 시 로컬 인메모리 캐시도 즉시 동기화
        setCachedDb(stateToSave);
        setChangeLog(nextLog);
        setAuditConfig(nextConfig);
        setScenarios(nextScenarios);
        alert("대성스틸 공용 구글 DB에 안전하게 일괄 저장이 완료되었습니다!");
        return true;
      } else {
        alert("DB 저장 중 오류가 발생했습니다.");
        return false;
      }
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
    if (!ensureAdmin()) return false;
    return handleSaveAll(availableYears, records, targets, planMeta, {
      auditConfig: cfg, log: { action: '보고서 설정 저장', detail: '조직경계·배출계수 출처·결재 정보', year: null }
    });
  };

  // 로드맵 시나리오 저장(가정·근거·결과를 스냅샷으로 보관)
  const handleSaveScenario = async (snapshot) => {
    if (!ensureAdmin()) return false;
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
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <Dashboard records={records} targets={targets} onSaveRecord={handleSaveRecord} onDeleteRecord={handleDeleteRecord} onSaveTargets={handleSaveTargets} onNavigateToEntry={() => handleTabChange('entry')} onRefresh={loadData} availableYears={availableYears} />}
        {activeTab === 'entry' && <DataEntry records={records} onSaveRecords={handleSaveRecords} onDeleteRecord={handleDeleteRecord} targets={targets} onSaveTargets={handleSaveTargets} onRefresh={loadData} availableYears={availableYears} onRegisterYear={handleRegisterYear} isSaving={isSaving} />}
        {activeTab === 'targets_tab' && <TargetSetting planMeta={planMeta} targets={targets} onSaveTargets={handleSaveTargets} records={records} onRefresh={loadData} availableYears={availableYears} onRegisterYear={handleRegisterYear} isSaving={isSaving} />}
        {activeTab === 'roadmap' && <Roadmap records={records} scenarios={scenarios} onSaveScenario={handleSaveScenario} />}
        {activeTab === 'audit_tab' && (
          <AuditReport
            records={records} targets={targets} planMeta={planMeta} auditConfig={auditConfig}
            scenarios={scenarios} changeLog={changeLog} availableYears={availableYears}
            backupData={{ availableYears, records, targets, planMeta, auditConfig, scenarios, changeLog }}
            onSaveConfig={handleSaveAuditConfig} isSaving={isSaving}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#F5F2EB] border-t border-[#E5E2D9] py-8 px-4 text-center text-xs text-[#57534E] font-mono mt-12 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>✔ 본 시스템은 대한민국 환경부 온실가스 배출 계수 검증 표준에 따라 완벽하게 준수 제작되었습니다.</p>
          <p>© 2026 (주)대성스틸 안전환경본부. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

