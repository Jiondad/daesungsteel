import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { YearPicker } from './YearPicker';
import { calculateEmissions, isEntered } from '../lib/emissions';

// --- DATA ENTRY COMPONENT ---
export const DataEntry = ({ closedMonths = {}, onToggleClose, records, onSaveRecords, onDeleteRecord, targets, onSaveTargets, onRefresh, availableYears = [2026, 2025, 2024], onRegisterYear, isSaving }) => {
  const [years, setYears] = useState(availableYears);
  const [year, setYear] = useState(2026);
  const [monthlyInputs, setMonthlyInputs] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const currentYear = year;
  const setCurrentYear = (val) => {
    setYear(Number(val));
  };

  useEffect(() => {
    if (availableYears) {
      setYears(availableYears);
    }
  }, [availableYears]);

  const handleAddYear = () => {
    const newYearStr = window.prompt("등록하실 새로운 연도를 입력하세요 (예: 2027):");
    if (!newYearStr) return;
    const newYear = parseInt(newYearStr, 10);
    if (isNaN(newYear) || newYear < 2000 || newYear > 2100) {
      alert("올바른 연도 4자리를 입력해주세요.");
      return;
    }
    // 연도 선택 드롭다운 배열에 즉시 추가하여 리렌더링 유발
    if (!years.includes(newYear)) {
      const updatedYears = [...years, newYear].sort((a, b) => b - a);
      setYears(updatedYears); // 연도 상태 업데이트 함수를 반드시 실행해줘
      setCurrentYear(newYear); // 새로 등록한 연도로 자동 전환

      if (onRegisterYear) {
        onRegisterYear(newYear);
      }
      alert(newYear + "년이 성공적으로 등록되었습니다. 실적과 목표를 입력해주세요.");
    } else {
      alert("이미 등록된 연도입니다.");
    }
  };

  useEffect(() => {
    if (onRefresh) onRefresh();
  }, [year]);

  useEffect(() => {
    const loadedInputs = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const found = records.find(r => r.year === year && r.month === monthNum);
      // 실적이 입력되지 않은 달(전부 0/빈 값)은 0이 아니라 빈 칸으로 보여준다
      const existing = found && isEntered(found) ? found : null;
      return {
        diesel: existing ? (existing.diesel !== undefined && existing.diesel !== null ? existing.diesel.toString() : '') : '',
        cityGas: existing ? (existing.cityGas !== undefined && existing.cityGas !== null ? existing.cityGas.toString() : '') : '',
        electricity: existing ? (existing.electricity !== undefined && existing.electricity !== null ? existing.electricity.toString() : '') : '',
        water: existing ? (existing.water !== undefined && existing.water !== null ? existing.water.toString() : '') : '',
        revenue: existing ? (existing.revenue !== undefined && existing.revenue !== null ? existing.revenue.toString() : '') : '',
      };
    });
    setMonthlyInputs(loadedInputs);
    setErrorMessage('');
    setSuccessMessage('');
  }, [year, records]);

  const handleInputChange = (index, field, value) => {
    setMonthlyInputs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const isClosed = (m) => !!closedMonths[`${year}-${String(m).padStart(2, '0')}`];

  const handleSaveAll = (e) => {
    if (e) e.preventDefault();

    const parsed = [];
    for (let i = 0; i < 12; i++) {
      const row = monthlyInputs[i];
      if (!row) return;
      const monthNum = i + 1;
      const isBlank = (v) => v === '' || v === null || v === undefined;

      // 마감된 월은 수정할 수 없으므로 저장된 실적을 그대로 유지한다
      if (isClosed(monthNum)) {
        const keep = records.find(r => r.year === year && r.month === monthNum);
        if (keep) parsed.push(keep);
        continue;
      }

      // 완전히 빈 달은 레코드를 만들지 않는다(미입력과 0을 구분, 입력 개월 수·연환산 왜곡 방지)
      const isZeroOrBlank = (v) => isBlank(v) || Number(v) === 0;
      if ([row.diesel, row.cityGas, row.electricity, row.water, row.revenue].every(isZeroOrBlank)) continue;

      // 값을 입력한 달은 핵심 3개 에너지를 모두 적어야 한다(사용량이 없으면 0을 직접 입력)
      const missing = [['경유', row.diesel], ['도시가스', row.cityGas], ['구매전력', row.electricity]]
        .filter(([, v]) => isBlank(v)).map(([n]) => n);
      if (missing.length > 0) {
        setErrorMessage(`${monthNum}월 ${missing.join(', ')} 값이 비어 있습니다. 사용량이 없으면 0을 직접 입력해주세요.`);
        return;
      }

      const dVal = parseFloat(row.diesel);
      const gVal = parseFloat(row.cityGas);
      const eVal = parseFloat(row.electricity);
      const wVal = isBlank(row.water) ? 0 : parseFloat(row.water);
      const revVal = isBlank(row.revenue) ? null : parseFloat(row.revenue);

      if (isNaN(dVal) || dVal < 0 || isNaN(gVal) || gVal < 0 || isNaN(eVal) || eVal < 0 || isNaN(wVal) || wVal < 0 || (revVal !== null && (isNaN(revVal) || revVal < 0))) {
        setErrorMessage(`${monthNum}월 입력 항목에 0 이상의 올바른 숫자를 입력해주세요.`);
        return;
      }

      parsed.push({
        id: `${year}-${monthNum.toString().padStart(2, '0')}`,
        year,
        month: monthNum,
        diesel: dVal,
        cityGas: gVal,
        electricity: eVal,
        water: wVal,
        revenue: revVal
      });
    }

    if (parsed.length === 0) {
      setErrorMessage('저장할 입력값이 없습니다. (월별 삭제는 저장된 실적 목록의 삭제 버튼을 이용하세요)');
      return;
    }

    onSaveRecords(year, parsed);
    setErrorMessage('');
  };

  const handleClear = () => {
    if (window.confirm(`${year}년의 모든 월별 실적 입력칸을 지우시겠습니까? (저장된 정보는 지워지지 않습니다)`)) {
      setMonthlyInputs(Array.from({ length: 12 }, () => ({
        diesel: '',
        cityGas: '',
        electricity: '',
        water: '',
        revenue: '',
      })));
    }
  };

  if (monthlyInputs.length === 0) return null;

  return (
    <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#FAF9F6]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#1C1A17] text-[#FAF9F6]">
            <Icon name="edit" className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1C1A17] font-display">월별 실제 실적 일괄 입력 및 관리</h2>
            <p className="text-xs text-[#57534E] mt-0.5">선택한 연도의 1월부터 12월까지의 실제 소비 실적 및 매출액을 표(Grid) 형식으로 일괄 입력 및 동기화하십시오.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#78716C] font-semibold">연도 선택:</span>
          <YearPicker value={year} years={years} onChange={(y) => setYear(y)} />
          <button
            type="button"
            onClick={handleAddYear}
            className="px-3 py-1.5 bg-[#1C1A17] hover:bg-[#1C1A17]/85 text-[#FAF9F6] text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 shadow-sm"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            <span>+ 새 연도 등록</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 border border-[#1C1A17]/30 hover:bg-[#F2EFE9] text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            입력칸 비우기
          </button>
        </div>
      </div>

      <form onSubmit={handleSaveAll} className="space-y-6">
        <div className="overflow-x-auto border border-[#1C1A17]/10 w-full">
          <table className="w-full text-left border-collapse table-auto text-xs">
            <thead>
              <tr className="bg-[#FAF9F6] border-b border-[#1C1A17]/15 text-[10px] sm:text-[11px] font-bold text-[#57534E] uppercase tracking-wider font-mono">
                <th className="py-2.5 px-3 text-center whitespace-nowrap border-r border-[#1C1A17]/10 w-16">월 구분</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">경유 실적 (L)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">도시가스 실적 (Nm³)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">구매전력 실적 (kWh)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">상수도 실적 (TON)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">매출액 (억원)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap border-r border-[#1C1A17]/10">예상 탄소 배출량 (tCO₂e)</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap w-20">마감</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1A17]/10 text-xs text-[#1C1A17] font-mono">
              {Array.from({ length: 12 }, (_, i) => {
                const m = i + 1;
                const row = monthlyInputs[i];
                if (!row) return null;
                const dVal = parseFloat(row.diesel) || 0;
                const gVal = parseFloat(row.cityGas) || 0;
                const eVal = parseFloat(row.electricity) || 0;
                const calc = calculateEmissions(dVal, gVal, eVal, year);
                const closed = isClosed(m);
                const hasSaved = records.some(r => r.year === year && r.month === m && isEntered(r));

                return (
                  <tr key={m} className="hover:bg-[#FCFAF7] transition-colors">
                    <td className="py-2 px-3 text-center font-bold text-[#1C1A17] border-r border-[#1C1A17]/10 bg-[#FAF9F6]">
                      {m}월{closed && ' 🔒'}
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        type="number"
                        disabled={closed}
                        step="any"
                        value={row.diesel}
                        onChange={(e) => handleInputChange(i, 'diesel', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        type="number"
                        disabled={closed}
                        step="any"
                        value={row.cityGas}
                        onChange={(e) => handleInputChange(i, 'cityGas', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        type="number"
                        disabled={closed}
                        step="any"
                        value={row.electricity}
                        onChange={(e) => handleInputChange(i, 'electricity', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        type="number"
                        disabled={closed}
                        step="any"
                        value={row.water}
                        onChange={(e) => handleInputChange(i, 'water', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-[#1C1A17]/10">
                      <input
                        type="number"
                        disabled={closed}
                        step="any"
                        value={row.revenue}
                        onChange={(e) => handleInputChange(i, 'revenue', e.target.value)}
                        className="w-full bg-[#FAF9F6] border border-[#E5E2D9] px-2 py-1 text-xs text-right focus:outline-none focus:border-[#1C1A17] font-mono font-bold text-blue-700"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[#1E40AF] border-r border-[#1C1A17]/10">{calc.total.toFixed(3)} t</td>
                    <td className="py-1 px-2 text-center">
                      {closed ? (
                        <button type="button" onClick={() => onToggleClose && onToggleClose(year, m, false)} className="text-[10px] font-bold px-2 py-1 border border-[#991B1B] text-[#991B1B] hover:bg-[#FEF2F2] cursor-pointer whitespace-nowrap">해제</button>
                      ) : (
                        <button type="button" disabled={!hasSaved} onClick={() => onToggleClose && onToggleClose(year, m, true)} title={hasSaved ? '이 달 실적을 마감(수정 잠금)' : '저장된 실적이 있어야 마감할 수 있습니다'} className="text-[10px] font-bold px-2 py-1 border border-[#1C1A17]/30 hover:bg-[#F2EFE9] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">마감</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {errorMessage && <p className="text-xs text-red-600 font-semibold">{errorMessage}</p>}
        {successMessage && <p className="text-xs text-green-700 font-semibold">{successMessage}</p>}

        <div className="flex justify-end items-center gap-3 pt-2">
          {isSaving && (
            <span className="text-xs text-[#D97706] font-semibold animate-pulse mr-1">
              ⚡ 대성스틸 보안 서버에 고속 저장 중...
            </span>
          )}
          <button
            type="submit"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-6 py-3 bg-[#1C1A17] disabled:bg-[#1C1A17]/60 text-white text-xs font-bold hover:bg-[#2C2A27] transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            {isSaving ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#FAF9F6] border-t-transparent inline-block mr-1"></span>
                <span>데이터 처리 중...</span>
              </>
            ) : (
              <>
                <Icon name="database" className="w-4 h-4" /> <span>{year}년도 실적 일괄 저장 및 동기화</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

