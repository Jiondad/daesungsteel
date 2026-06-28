/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MonthlyRecord, MonthlyTarget } from '../types';
import { EMISSION_FACTORS, TARGETS_2026, calculateEmissions, calculateWaterEmissions } from '../constants';
import { 
  Trash2, 
  Flame, 
  Zap, 
  Droplet, 
  Info, 
  HelpCircle,
  FileSpreadsheet,
  Coins,
  Calendar,
  Save,
  Target,
  FileText
} from 'lucide-react';

interface DataEntryProps {
  records: MonthlyRecord[];
  onSaveRecords: (records: MonthlyRecord[]) => void;
  onDeleteRecord: (id: string) => void;
  targets: Record<number, MonthlyTarget[]>;
  onSaveTargets: (year: number, yearTargets: MonthlyTarget[]) => void;
}

interface MonthInputState {
  diesel: string;
  cityGas: string;
  electricity: string;
  water: string;
  revenue: string;
}

interface TargetInputState {
  diesel: string;
  cityGas: string;
  electricity: string;
  water: string;
}

export default function DataEntry({ 
  records, 
  onSaveRecords, 
  onDeleteRecord,
  targets,
  onSaveTargets 
}: DataEntryProps) {
  // Working year state
  const [year, setYear] = useState<number>(2026);

  // Local spreadsheet-style input states (12 months)
  const [monthlyInputs, setMonthlyInputs] = useState<MonthInputState[]>(() => 
    Array.from({ length: 12 }, () => ({
      diesel: '',
      cityGas: '',
      electricity: '',
      water: '',
      revenue: '',
    }))
  );

  const [targetInputs, setTargetInputs] = useState<TargetInputState[]>(() =>
    Array.from({ length: 12 }, () => ({
      diesel: '',
      cityGas: '',
      electricity: '',
      water: '',
    }))
  );

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Automatically load existing records and targets for the selected year
  useEffect(() => {
    // 1. Load actual consumption inputs
    const loadedInputs = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const existing = records.find(r => r.year === year && r.month === monthNum);
      if (existing) {
        return {
          diesel: existing.diesel.toString(),
          cityGas: existing.cityGas.toString(),
          electricity: existing.electricity.toString(),
          water: existing.water.toString(),
          revenue: existing.revenue !== undefined ? existing.revenue.toString() : '',
        };
      } else {
        return {
          diesel: '',
          cityGas: '',
          electricity: '',
          water: '',
          revenue: '',
        };
      }
    });
    setMonthlyInputs(loadedInputs);

    // 2. Load target/KPI inputs
    const yearTargets = targets[year] || TARGETS_2026;
    const loadedTargets = Array.from({ length: 12 }, (_, i) => {
      const t = yearTargets[i] || TARGETS_2026[i] || { diesel: 0, cityGas: 0, electricity: 0, water: 0 };
      return {
        diesel: t.diesel.toString(),
        cityGas: t.cityGas.toString(),
        electricity: t.electricity.toString(),
        water: t.water.toString(),
      };
    });
    setTargetInputs(loadedTargets);

    setErrorMessage('');
    setSuccessMessage('');
  }, [year, records, targets]);

  // Handle actual record cell input change
  const handleActualChange = (monthIdx: number, field: keyof MonthInputState, value: string) => {
    setMonthlyInputs(prev => {
      const updated = [...prev];
      updated[monthIdx] = {
        ...updated[monthIdx],
        [field]: value
      };
      return updated;
    });
  };

  // Handle target/KPI cell input change
  const handleTargetChange = (monthIdx: number, field: keyof TargetInputState, value: string) => {
    setTargetInputs(prev => {
      const updated = [...prev];
      updated[monthIdx] = {
        ...updated[monthIdx],
        [field]: value
      };
      return updated;
    });
  };

  // Handle bulk actual performance data save
  const handleSaveAllActuals = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate and build MonthlyRecord array
    const recordsToSave: MonthlyRecord[] = [];
    let hasValidationError = false;

    for (let i = 0; i < 12; i++) {
      const monthNum = i + 1;
      const row = monthlyInputs[i];

      // If all fields in a row are empty, we skip or treat them as zeroes.
      // Let's treat them as zeroes if any field has value, or save everything.
      const dVal = parseFloat(row.diesel);
      const gVal = parseFloat(row.cityGas);
      const eVal = parseFloat(row.electricity);
      const wVal = parseFloat(row.water);
      const revVal = parseFloat(row.revenue);

      // Validate inputs if user typed something in any field
      const hasAnyValue = row.diesel || row.cityGas || row.electricity || row.water || row.revenue;
      if (hasAnyValue) {
        if (
          (row.diesel && (isNaN(dVal) || dVal < 0)) ||
          (row.cityGas && (isNaN(gVal) || gVal < 0)) ||
          (row.electricity && (isNaN(eVal) || eVal < 0)) ||
          (row.water && (isNaN(wVal) || wVal < 0)) ||
          (row.revenue && (isNaN(revVal) || revVal < 0))
        ) {
          hasValidationError = true;
          break;
        }
      }

      recordsToSave.push({
        id: `${year}-${monthNum.toString().padStart(2, '0')}`,
        year,
        month: monthNum,
        diesel: dVal || 0,
        cityGas: gVal || 0,
        electricity: eVal || 0,
        water: wVal || 0,
        revenue: revVal || 0,
      });
    }

    if (hasValidationError) {
      setErrorMessage('모든 항목에 0 이상의 올바른 숫자를 입력해주세요. (예: 빈칸은 0으로 처리됩니다.)');
      return;
    }

    onSaveRecords(recordsToSave);
    setSuccessMessage(`${year}년 1월~12월 에너지 소비실적 및 매출액 데이터가 일괄 성공적으로 저장되었습니다.`);
    setErrorMessage('');
    setTimeout(() => setSuccessMessage(''), 4500);
  };

  // Handle bulk KPI goals/targets save
  const handleSaveAllTargets = (e: React.FormEvent) => {
    e.preventDefault();

    const targetsToSave: MonthlyTarget[] = [];
    let hasValidationError = false;

    for (let i = 0; i < 12; i++) {
      const row = targetInputs[i];

      const dVal = parseFloat(row.diesel);
      const gVal = parseFloat(row.cityGas);
      const eVal = parseFloat(row.electricity);
      const wVal = parseFloat(row.water);

      const hasAnyValue = row.diesel || row.cityGas || row.electricity || row.water;
      if (hasAnyValue) {
        if (
          (row.diesel && (isNaN(dVal) || dVal < 0)) ||
          (row.cityGas && (isNaN(gVal) || gVal < 0)) ||
          (row.electricity && (isNaN(eVal) || eVal < 0)) ||
          (row.water && (isNaN(wVal) || wVal < 0))
        ) {
          hasValidationError = true;
          break;
        }
      }

      targetsToSave.push({
        diesel: dVal || 0,
        cityGas: gVal || 0,
        electricity: eVal || 0,
        water: wVal || 0,
      });
    }

    if (hasValidationError) {
      setErrorMessage('목표 항목에 0 이상의 올바른 숫자를 입력해주세요.');
      return;
    }

    onSaveTargets(year, targetsToSave);
    setSuccessMessage(`${year}년 1월~12월 탄소 KPI 연간 세부 목표량이 일괄 업데이트 동기화되었습니다.`);
    setErrorMessage('');
    setTimeout(() => setSuccessMessage(''), 4500);
  };

  // Quick action: Reset current inputs to blank
  const handleClearActuals = () => {
    if (window.confirm(`${year}년의 작성 중인 모든 소비 실적 입력칸을 초기화하시겠습니까? (저장된 정보는 지워지지 않습니다)`)) {
      setMonthlyInputs(Array.from({ length: 12 }, () => ({
        diesel: '',
        cityGas: '',
        electricity: '',
        water: '',
        revenue: '',
      })));
    }
  };

  // Quick action: Reset target inputs to template (TARGETS_2026)
  const handleResetTargetsToTemplate = () => {
    if (window.confirm(`${year}년 목표 입력칸을 기본 마스터 데이터 템플릿(2026년 기준안)으로 초기화하시겠습니까?`)) {
      const loadedTargets = TARGETS_2026.map(t => ({
        diesel: t.diesel.toString(),
        cityGas: t.cityGas.toString(),
        electricity: t.electricity.toString(),
        water: t.water.toString(),
      }));
      setTargetInputs(loadedTargets);
    }
  };

  // Helper: check if a month row has actual saved data in parent state
  const isMonthSaved = (monthNum: number) => {
    return records.some(r => r.year === year && r.month === monthNum);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* LEFT: Grid-style Spreadsheet Entry Panels (Actuals & Goals) */}
      <div className="lg:col-span-2 space-y-8">
        
        {/* Universal Year Controls Panel */}
        <div className="bg-[#1C1A17] p-5 border border-[#1C1A17] rounded-none flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white text-[#1C1A17] flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-[#78716C] font-mono block">Selected Target Year</span>
              <span className="text-sm font-bold text-white font-serif">연도별 데이터 일괄 관리 환경 설정:</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-[#FAF9F6] text-[#1C1A17] border border-[#FAF9F6] rounded-none px-4 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-white focus:border-white cursor-pointer"
            >
              <option value={2026}>2026년 (KPI 가동)</option>
              <option value={2025}>2025년 (기준년도)</option>
              <option value={2024}>2024년</option>
            </select>
          </div>
        </div>

        {/* Global Feedback Alert Banner */}
        {errorMessage && (
          <div className="text-xs font-semibold text-[#991B1B] bg-[#FEF2F2] border border-[#FCA5A5] p-4 rounded-none font-mono flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#991B1B] rounded-full animate-ping" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="text-xs font-semibold text-[#166534] bg-[#F0FDF4] border border-[#86EFAC] p-4 rounded-none font-mono flex items-center gap-2 animate-pulse">
            <span className="w-2.5 h-2.5 bg-[#166534] rounded-full" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* SECTION 1: [연도별 실적 일괄 입력] 바둑판 표 양식 */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#1C1A17] flex items-center gap-2 font-display">
                <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                {year}년 월별 에너지 실제 소비실적 일괄 전산 입력표
              </h3>
              <p className="text-xs text-[#57534E] mt-0.5">
                1월부터 12월까지의 실제 실적 수치를 한 눈에 확인하고 일괄 적재 및 자동 환산 동기화합니다.
              </p>
            </div>
            <button
              onClick={handleClearActuals}
              className="text-[10px] font-mono text-[#78716C] hover:text-[#991B1B] border border-[#E5E2D9] px-2 py-1 hover:bg-[#FEF2F2] transition-colors cursor-pointer"
            >
              입력칸 초기화
            </button>
          </div>

          <form onSubmit={handleSaveAllActuals} className="space-y-4">
            <div className="overflow-x-auto border border-[#E5E2D9] bg-[#FCFAF7]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F2EFE9] border-b border-[#E5E2D9] text-[#57534E] uppercase font-mono tracking-wider font-semibold">
                    <th className="p-2.5 text-center w-16">구분</th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-600" />
                        <span>경유 (L)</span>
                      </div>
                    </th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-[#0F766E]" />
                        <span>도시가스 (Nm³)</span>
                      </div>
                    </th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-[#1E40AF]" />
                        <span>구매전력 (kWh)</span>
                      </div>
                    </th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Droplet className="w-3.5 h-3.5 text-teal-600" />
                        <span>상수도 (TON)</span>
                      </div>
                    </th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-[#D97706]" />
                        <span>매출액 (억원)</span>
                      </div>
                    </th>
                    <th className="p-2.5 text-center w-16">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9] font-mono">
                  {monthlyInputs.map((row, idx) => {
                    const monthNum = idx + 1;
                    const saved = isMonthSaved(monthNum);
                    return (
                      <tr key={monthNum} className="hover:bg-white transition-colors bg-white/70">
                        <td className="p-2 text-center font-bold text-[#1C1A17] font-serif border-r border-[#E5E2D9]">
                          {monthNum}월
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.diesel}
                            onChange={(e) => handleActualChange(idx, 'diesel', e.target.value)}
                            className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:bg-white"
                          />
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.cityGas}
                            onChange={(e) => handleActualChange(idx, 'cityGas', e.target.value)}
                            className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:bg-white"
                          />
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.electricity}
                            onChange={(e) => handleActualChange(idx, 'electricity', e.target.value)}
                            className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:bg-white"
                          />
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.water}
                            onChange={(e) => handleActualChange(idx, 'water', e.target.value)}
                            className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:bg-white"
                          />
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.revenue}
                            onChange={(e) => handleActualChange(idx, 'revenue', e.target.value)}
                            className="w-full bg-[#FAF9F6] text-[#1E40AF] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right font-bold focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:bg-white"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded-none tracking-tight uppercase border block text-center ${
                            saved 
                              ? 'bg-[#F0FDF4] text-[#166534] border-[#86EFAC]/50' 
                              : 'bg-[#FCFAF7] text-[#78716C] border-[#E5E2D9]'
                          }`}>
                            {saved ? 'Saved' : 'Empty'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-6 py-3 bg-[#1C1A17] hover:bg-[#2C2A27] text-white text-xs font-bold font-serif rounded-none shadow-md transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {year}년 실적 데이터 일괄 저장 및 동기화
              </button>
            </div>
          </form>
        </div>

        {/* SECTION 2: [연도별 목표 일괄 입력] 바둑판 표 양식 */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#1C1A17] flex items-center gap-2 font-display">
                <Target className="w-5 h-5 text-[#166534]" />
                {year}년 에너지 사용량 국가 온실가스 목표(KPI) 설정 일괄 표
              </h3>
              <p className="text-xs text-[#57534E] mt-0.5">
                당해 연도의 에너지원별 소비 상한 한계선(Run-rate Goals)을 12개월 바둑판 표로 일괄 수립하고 제어합니다.
              </p>
            </div>
            <button
              onClick={handleResetTargetsToTemplate}
              className="text-[10px] font-mono text-[#78716C] hover:text-[#B45309] border border-[#E5E2D9] px-2 py-1 hover:bg-[#FFFBEB] transition-colors cursor-pointer"
            >
              마스터 기본값 채우기
            </button>
          </div>

          <form onSubmit={handleSaveAllTargets} className="space-y-4">
            <div className="overflow-x-auto border border-[#E5E2D9] bg-[#FCFAF7]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F2EFE9] border-b border-[#E5E2D9] text-[#57534E] uppercase font-mono tracking-wider font-semibold">
                    <th className="p-2.5 text-center w-16">구분</th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-600" />
                        <span>경유 감축 상한 (L)</span>
                      </div>
                    </th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-[#0F766E]" />
                        <span>도시가스 상한 (Nm³)</span>
                      </div>
                    </th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-[#1E40AF]" />
                        <span>구매전력 상한 (kWh)</span>
                      </div>
                    </th>
                    <th className="p-2.5">
                      <div className="flex items-center gap-1">
                        <Droplet className="w-3.5 h-3.5 text-teal-600" />
                        <span>수도 사용 상한 (TON)</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9] font-mono">
                  {targetInputs.map((row, idx) => {
                    const monthNum = idx + 1;
                    return (
                      <tr key={monthNum} className="hover:bg-white transition-colors bg-white/70">
                        <td className="p-2 text-center font-bold text-[#1C1A17] font-serif border-r border-[#E5E2D9]">
                          {monthNum}월
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.diesel}
                            onChange={(e) => handleTargetChange(idx, 'diesel', e.target.value)}
                            className="w-full bg-[#FCFAF7] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#166534] focus:bg-white"
                          />
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.cityGas}
                            onChange={(e) => handleTargetChange(idx, 'cityGas', e.target.value)}
                            className="w-full bg-[#FCFAF7] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#166534] focus:bg-white"
                          />
                        </td>
                        <td className="p-1.5 border-r border-[#E5E2D9]">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.electricity}
                            onChange={(e) => handleTargetChange(idx, 'electricity', e.target.value)}
                            className="w-full bg-[#FCFAF7] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#166534] focus:bg-white"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={row.water}
                            onChange={(e) => handleTargetChange(idx, 'water', e.target.value)}
                            className="w-full bg-[#FCFAF7] text-[#1C1A17] border border-[#E5E2D9]/80 rounded-none px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#166534] focus:bg-white"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-6 py-3 bg-[#15803D] hover:bg-[#166534] text-white text-xs font-bold font-serif rounded-none shadow-md transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {year}년 탄소 감축 목표(KPI) 일괄 설정 저장
              </button>
            </div>
          </form>
        </div>

      </div>

      {/* RIGHT: Saved Records Table Log & Guidelines (1 Column) */}
      <div className="lg:col-span-1 space-y-8">
        
        {/* Saved Records Live log directory */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#1C1A17] flex items-center gap-2 font-display">
              <FileText className="w-4 h-4 text-[#1C1A17]" />
              저장된 실적 로그 라이브러리
            </h3>
            <p className="text-[11px] text-[#57534E] mt-1 leading-relaxed">
              LocalStorage 저장소에 현재 동기화 보관 중인 월별 이력 레코드 목록입니다.
            </p>
          </div>

          <div className="max-h-[380px] overflow-y-auto border border-[#E5E2D9] bg-[#FCFAF7]">
            {records.length > 0 ? (
              <div className="divide-y divide-[#E5E2D9]">
                {records
                  .sort((a, b) => b.id.localeCompare(a.id))
                  .map((r) => {
                    const em = calculateEmissions(r.diesel, r.cityGas, r.electricity);
                    return (
                      <div key={r.id} className="p-3 hover:bg-white transition-colors text-xs space-y-1.5">
                        <div className="flex justify-between items-center font-serif font-bold">
                          <span className="text-[#1C1A17]">{r.year}년 {r.month}월</span>
                          <button
                            onClick={() => onDeleteRecord(r.id)}
                            className="p-1 hover:bg-[#FEF2F2] text-[#991B1B] rounded-none border border-transparent hover:border-[#FCA5A5] transition-colors cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-[#57534E] font-mono">
                          <div>• 경유: {r.diesel.toLocaleString()} L</div>
                          <div>• 가스: {r.cityGas.toLocaleString()} Nm³</div>
                          <div>• 전력: {r.electricity.toLocaleString()} kWh</div>
                          <div>• 수도: {r.water.toLocaleString()} TON</div>
                          <div className="col-span-2 text-blue-800 font-bold">• 매출액: {r.revenue ? `${r.revenue.toLocaleString()} 억` : '-'}</div>
                          <div className="col-span-2 text-amber-700 font-bold border-t border-dashed border-[#E5E2D9] pt-1">
                            • 총배출: {em.total.toFixed(3)} tCO₂e
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[#78716C] font-mono">
                등록된 소비 실적이 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* Informational Guidance (Compact) */}
        <div className="bg-[#FCFAF7] border border-[#1C1A17]/15 rounded-none p-5 shadow-sm space-y-4 text-xs">
          <h4 className="font-bold text-[#1C1A17] flex items-center gap-1.5 font-serif">
            <Info className="w-4 h-4 text-[#1C1A17]" />
            산정 계수 및 전산 환경 안내
          </h4>
          <p className="text-[#57534E] leading-relaxed text-[11px]">
            본 시스템은 환경부 온실가스 표준 지침을 준수하며, 일괄 입력 완료 후 각 에너지 사용량에 아래 계수가 자동 적용되어 탄소 배출 등가량(tCO₂e)으로 실시간 환산 처리됩니다.
          </p>
          <div className="bg-white p-3 border border-[#E5E2D9] font-mono text-[11px] text-[#57534E] space-y-1.5 leading-relaxed">
            <div className="flex justify-between">
              <span>경유 (Diesel):</span>
              <span className="font-bold text-[#B45309]">2.5822 kg/L</span>
            </div>
            <div className="flex justify-between">
              <span>도시가스 (City Gas):</span>
              <span className="font-bold text-[#0F766E]">2.1952 kg/Nm³</span>
            </div>
            <div className="flex justify-between">
              <span>구매전력 (Electricity):</span>
              <span className="font-bold text-[#1E40AF]">0.4687 kg/kWh</span>
            </div>
            <div className="flex justify-between">
              <span>상수도 (Water):</span>
              <span className="font-bold text-teal-600">0.2370 kg/TON</span>
            </div>
          </div>
          <p className="text-[10px] text-[#78716C] leading-relaxed border-t border-[#E5E2D9] pt-3 flex gap-1.5">
            <HelpCircle className="w-4 h-4 shrink-0 text-[#C2410C]" />
            <span>수도는 Scope 3 규정에 의거하여 국가 보고 총 배출량 합산에서는 공식 자동 제외됩니다.</span>
          </p>
        </div>

      </div>

    </div>
  );
}
