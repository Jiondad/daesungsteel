/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MonthlyRecord } from '../types';
import { EMISSION_FACTORS, calculateEmissions, calculateWaterEmissions } from '../constants';
import { 
  PlusCircle, 
  Trash2, 
  Edit3, 
  RotateCcw, 
  Flame, 
  Zap, 
  Droplet, 
  Info, 
  HelpCircle,
  FileSpreadsheet,
  FileText,
  Coins
} from 'lucide-react';

interface DataEntryProps {
  records: MonthlyRecord[];
  onSaveRecord: (record: MonthlyRecord) => void;
  onDeleteRecord: (id: string) => void;
}

export default function DataEntry({ records, onSaveRecord, onDeleteRecord }: DataEntryProps) {
  // Form State
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(6);
  const [diesel, setDiesel] = useState<string>('');
  const [cityGas, setCityGas] = useState<string>('');
  const [electricity, setElectricity] = useState<string>('');
  const [water, setWater] = useState<string>('');
  const [revenue, setRevenue] = useState<string>('');

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Watch for existing record to load for editing or pre-fill
  useEffect(() => {
    const existing = records.find(r => r.year === year && r.month === month);
    if (existing) {
      setDiesel(existing.diesel.toString());
      setCityGas(existing.cityGas.toString());
      setElectricity(existing.electricity.toString());
      setWater(existing.water.toString());
      setRevenue(existing.revenue !== undefined ? existing.revenue.toString() : '');
      setIsEditing(true);
    } else {
      // Clear form except year/month
      setDiesel('');
      setCityGas('');
      setElectricity('');
      setWater('');
      setRevenue('');
      setIsEditing(false);
    }
    setErrorMessage('');
    setSuccessMessage('');
  }, [year, month, records]);

  // Real-time calculated feedback
  const liveCalculations = React.useMemo(() => {
    const dVal = parseFloat(diesel) || 0;
    const gVal = parseFloat(cityGas) || 0;
    const eVal = parseFloat(electricity) || 0;
    const wVal = parseFloat(water) || 0;

    const main = calculateEmissions(dVal, gVal, eVal);
    const waterEm = calculateWaterEmissions(wVal);

    return {
      scope1: main.scope1,
      scope2: main.scope2,
      total: main.total,
      water: waterEm,
    };
  }, [diesel, cityGas, electricity, water]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const dVal = parseFloat(diesel);
    const gVal = parseFloat(cityGas);
    const eVal = parseFloat(electricity);
    const wVal = parseFloat(water);
    const revVal = parseFloat(revenue);

    if (isNaN(dVal) || dVal < 0 || isNaN(gVal) || gVal < 0 || isNaN(eVal) || eVal < 0 || isNaN(wVal) || wVal < 0 || isNaN(revVal) || revVal < 0) {
      setErrorMessage('모든 항목에 0 이상의 올바른 숫자를 입력해주세요. (매출액 포함)');
      return;
    }

    const newRecord: MonthlyRecord = {
      id: `${year}-${month.toString().padStart(2, '0')}`,
      year,
      month,
      diesel: dVal,
      cityGas: gVal,
      electricity: eVal,
      water: wVal,
      revenue: revVal,
    };

    onSaveRecord(newRecord);
    setSuccessMessage(`${year}년 ${month}월 실적 등록/수정이 완료되었습니다.`);
    setErrorMessage('');

    // Timer to fade success message
    setTimeout(() => {
      setSuccessMessage('');
    }, 4000);
  };

  const handleClear = () => {
    setDiesel('');
    setCityGas('');
    setElectricity('');
    setWater('');
    setRevenue('');
    setIsEditing(false);
    setErrorMessage('');
  };

  const loadRecordToForm = (record: MonthlyRecord) => {
    setYear(record.year);
    setMonth(record.month);
    setDiesel(record.diesel.toString());
    setCityGas(record.cityGas.toString());
    setElectricity(record.electricity.toString());
    setWater(record.water.toString());
    setRevenue(record.revenue !== undefined ? record.revenue.toString() : '');
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Input Form Column */}
      <div className="lg:col-span-1 bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-6">
        <div>
          <h3 className="text-xl font-bold text-[#1C1A17] flex items-center gap-2 font-display">
            <PlusCircle className="w-5 h-5 text-[#1C1A17]" />
            {isEditing ? '실적 수정하기' : '월별 에너지 실적 입력'}
          </h3>
          <p className="text-xs text-[#57534E] mt-1.5 leading-relaxed font-sans">
            {isEditing 
              ? '기존 등록된 데이터가 로드되었습니다. 값을 수정하여 갱신할 수 있습니다.' 
              : '연도와 월을 선택하고 경유, 도시가스, 전력, 수도 사용량을 입력하십시오.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Year / Month Selector */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#78716C] font-semibold uppercase tracking-wider block">작업 연도</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:border-[#1C1A17] cursor-pointer"
              >
                <option value={2026}>2026년</option>
                <option value={2025}>2025년</option>
                <option value={2024}>2024년</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#78716C] font-semibold uppercase tracking-wider block">작업 월</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:border-[#1C1A17] cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}월</option>
                ))}
              </select>
            </div>
          </div>

          <hr className="border-[#FAF9F6]" />

          {/* Diesel Input (L) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                경유 사용량 (Diesel)
              </label>
              <span className="text-[10px] text-[#78716C] font-mono uppercase tracking-wider">Scope 1</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                placeholder="예: 450"
                value={diesel}
                onChange={(e) => setDiesel(e.target.value)}
                className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none pl-3 pr-12 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:border-[#1C1A17]"
              />
              <span className="absolute right-3 top-3 text-xs text-[#78716C] font-mono">L</span>
            </div>
          </div>

          {/* City Gas Input (Nm³) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                <Flame className="w-3.5 h-3.5 text-[#0F766E]" />
                도시가스 사용량 (City Gas / LNG)
              </label>
              <span className="text-[10px] text-[#78716C] font-mono uppercase tracking-wider">Scope 1</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                placeholder="예: 2500"
                value={cityGas}
                onChange={(e) => setCityGas(e.target.value)}
                className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none pl-3 pr-12 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:border-[#1C1A17]"
              />
              <span className="absolute right-3 top-3 text-xs text-[#78716C] font-mono">Nm³</span>
            </div>
          </div>

          {/* Purchase Power Input (kWh) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                <Zap className="w-3.5 h-3.5 text-[#1E40AF]" />
                구매전력 사용량 (Electricity)
              </label>
              <span className="text-[10px] text-[#78716C] font-mono uppercase tracking-wider">Scope 2</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                placeholder="예: 85000"
                value={electricity}
                onChange={(e) => setElectricity(e.target.value)}
                className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none pl-3 pr-14 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:border-[#1C1A17]"
              />
              <span className="absolute right-3 top-3 text-xs text-[#78716C] font-mono">kWh</span>
            </div>
          </div>

          {/* Water Input (TON) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                <Droplet className="w-3.5 h-3.5 text-teal-600" />
                수도 사용량 (Water)
              </label>
              <span className="text-[10px] text-[#78716C] font-mono uppercase tracking-wider">전사제외</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                placeholder="예: 250"
                value={water}
                onChange={(e) => setWater(e.target.value)}
                className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none pl-3 pr-14 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:border-[#1C1A17]"
              />
              <span className="absolute right-3 top-3 text-xs text-[#78716C] font-mono">TON</span>
            </div>
          </div>

          {/* Monthly Revenue Input (억원) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                월별 매출액 (Revenue)
              </label>
              <span className="text-[10px] text-[#78716C] font-mono uppercase tracking-wider">원단위 분모</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                placeholder="예: 120"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                className="w-full bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none pl-3 pr-16 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1C1A17] focus:border-[#1C1A17]"
              />
              <span className="absolute right-3 top-3 text-xs text-[#78716C] font-mono">억원</span>
            </div>
          </div>

          {/* Error and Success Feedback messages */}
          {errorMessage && (
            <p className="text-xs font-semibold text-[#991B1B] bg-[#FEF2F2] border border-[#FCA5A5] p-3 rounded-none font-mono">
              {errorMessage}
            </p>
          )}

          {successMessage && (
            <p className="text-xs font-semibold text-[#166534] bg-[#F0FDF4] border border-[#86EFAC] p-3 rounded-none font-mono">
              {successMessage}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#1C1A17] text-xs font-bold font-serif rounded-none border border-[#1C1A17]/30 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              초기화
            </button>
            <button
              type="submit"
              className="flex-[2] flex items-center justify-center gap-1 px-3 py-2.5 bg-[#1C1A17] hover:bg-[#2C2A27] text-[#FAF9F6] text-xs font-bold font-serif rounded-none shadow-md transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {isEditing ? '실적 수정 완료' : '월별 실적 등록'}
            </button>
          </div>
        </form>

        <hr className="border-[#FAF9F6]" />

        {/* Real-time calculated GHG indicators */}
        <div className="bg-[#FCFAF7] p-4 border border-[#E5E2D9] space-y-3.5 text-xs">
          <span className="font-bold text-[#1C1A17] block uppercase tracking-widest text-[10px] font-mono">
            실시간 환산 배출량 시뮬레이터 (tCO₂e)
          </span>
          <div className="space-y-2 font-mono">
            <div className="flex justify-between border-b border-[#FAF9F6] pb-1.5">
              <span className="text-[#78716C]">Scope 1 (직접):</span>
              <span className="text-[#1C1A17] font-semibold">{liveCalculations.scope1.toFixed(3)} t</span>
            </div>
            <div className="flex justify-between border-b border-[#FAF9F6] pb-1.5">
              <span className="text-[#78716C]">Scope 2 (간접):</span>
              <span className="text-[#1C1A17] font-semibold">{liveCalculations.scope2.toFixed(3)} t</span>
            </div>
            <div className="flex justify-between font-bold border-t border-[#E5E2D9] pt-2.5 text-sm">
              <span className="text-[#1C1A17] font-serif">전사 배출량 (S1+S2):</span>
              <span className="text-[#C2410C] font-display text-base font-bold">{liveCalculations.total.toFixed(3)} t</span>
            </div>
            <div className="flex justify-between text-xs text-[#78716C] border-t border-dashed border-[#E5E2D9] pt-2">
              <span className="flex items-center gap-1 font-serif">
                <Droplet className="w-3 h-3 text-teal-600" />
                수도 배출량 (S3 감축제외):
              </span>
              <span className="font-semibold">{liveCalculations.water.toFixed(4)} t</span>
            </div>
          </div>
        </div>

      </div>

      {/* Database Listing & ESG conversion guidelines Columns */}
      <div className="lg:col-span-2 space-y-8">
        
        {/* Saved Records Table */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-xl font-bold text-[#1C1A17] flex items-center gap-2 font-display">
                <FileSpreadsheet className="w-5 h-5 text-[#1C1A17]" />
                대성스틸 연도/월별 실적 로그 라이브러리
              </h3>
              <p className="text-xs text-[#57534E] mt-1">
                LocalStorage 보안 데이터 저장소에 동기화된 대성스틸 실제 소비실적 로그 이력입니다.
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-[#F2EFE9] text-[#1C1A17] border border-[#E5E2D9] px-3 py-1 self-start sm:self-auto uppercase tracking-wide">
              총 {records.length}개 이력 공시됨
            </span>
          </div>

          {records.length > 0 ? (
            <div className="overflow-x-auto border border-[#E5E2D9] bg-[#FCFAF7]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F2EFE9] border-b border-[#E5E2D9] text-[#57534E] uppercase font-mono tracking-wider font-semibold">
                    <th className="p-3">작업년월</th>
                    <th className="p-3">경유 (L)</th>
                    <th className="p-3">가스 (Nm³)</th>
                    <th className="p-3">전력 (kWh)</th>
                    <th className="p-3">수도 (TON)</th>
                    <th className="p-3 text-right">매출액 (억원)</th>
                    <th className="p-3 text-right">배출 원단위 (t/억원)</th>
                    <th className="p-3 text-right">총 배출량 (Scope 1+2)</th>
                    <th className="p-3 text-center">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9]/80 font-mono text-[#1C1A17]">
                  {records
                    .sort((a, b) => b.id.localeCompare(a.id)) // Sort latest first
                    .map((r) => {
                      const em = calculateEmissions(r.diesel, r.cityGas, r.electricity);
                      const intensity = r.revenue && r.revenue > 0 ? em.total / r.revenue : 0;
                      return (
                        <tr key={r.id} className="hover:bg-white transition-colors">
                          <td className="p-3 font-bold text-[#1C1A17] font-serif">{r.year}년 {r.month}월</td>
                          <td className="p-3 text-[#57534E]">{r.diesel.toLocaleString()}</td>
                          <td className="p-3 text-[#57534E]">{r.cityGas.toLocaleString()}</td>
                          <td className="p-3 text-[#57534E]">{r.electricity.toLocaleString()}</td>
                          <td className="p-3 text-[#57534E]">{r.water.toLocaleString()}</td>
                          <td className="p-3 text-right text-[#1E40AF] font-bold">{r.revenue ? `${r.revenue.toLocaleString()} 억` : '-'}</td>
                          <td className="p-3 text-right text-[#166534] font-bold">{intensity > 0 ? intensity.toFixed(3) : '-'}</td>
                          <td className="p-3 text-right font-bold text-[#C2410C]">{em.total.toFixed(3)} t</td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center gap-1.5">
                              <button
                                onClick={() => loadRecordToForm(r)}
                                className="p-1.5 bg-white hover:bg-[#FAF9F6] text-[#1C1A17] border border-[#E5E2D9] rounded-none transition-all cursor-pointer"
                                title="수정"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteRecord(r.id)}
                                className="p-1.5 bg-white hover:bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5] rounded-none transition-all cursor-pointer"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#E5E2D9] rounded-none bg-[#FCFAF7] space-y-3">
              <FileSpreadsheet className="w-8 h-8 text-[#78716C]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-[#1C1A17] font-serif">데이터가 존재하지 않습니다.</p>
                <p className="text-xs text-[#57534E] mt-0.5">좌측 폼을 이용해 첫 실적 정보를 입력해보세요.</p>
              </div>
            </div>
          )}
        </div>

        {/* ESG Conversion Guideline Card */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-5">
          <h3 className="text-lg font-bold text-[#1C1A17] flex items-center gap-2 font-display">
            <Info className="w-5 h-5 text-[#1C1A17]" />
            온실가스 인벤토리 산정 가이드 및 국가 배출계수 기준
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            
            <div className="bg-[#FAF9F6] p-4 rounded-none border border-[#E5E2D9] space-y-3">
              <h4 className="font-bold text-[#1C1A17] flex items-center gap-1.5 font-serif text-sm">
                <span className="w-2 h-2 bg-[#B45309]" />
                Scope 1 (직접 배출원) 산식
              </h4>
              <p className="text-[#57534E] leading-relaxed">
                기업이 소유하거나 통제하는 배출원(경유 차량 사용, 난방용 LNG 보일러 연소 등)에서 직접 배출되는 탄소량입니다.
              </p>
              <div className="bg-white p-3 border border-[#E5E2D9] font-mono text-[11px] text-[#B45309] leading-relaxed">
                • 경유: 사용량(L) × 2.5822 kg CO₂e<br />
                • 도시가스: 사용량(Nm³) × 2.1952 kg CO₂e
              </div>
            </div>

            <div className="bg-[#FAF9F6] p-4 rounded-none border border-[#E5E2D9] space-y-3">
              <h4 className="font-bold text-[#1C1A17] flex items-center gap-1.5 font-serif text-sm">
                <span className="w-2 h-2 bg-[#1E40AF]" />
                Scope 2 (간접 배출원) 산식
              </h4>
              <p className="text-[#57534E] leading-relaxed">
                기업이 외부로부터 구매하여 소비한 전기, 열 등을 생산하는 과정에서 간접적으로 발생하는 탄소량입니다.
              </p>
              <div className="bg-white p-3 border border-[#E5E2D9] font-mono text-[11px] text-[#1E40AF] leading-relaxed">
                • 전력: 사용량(kWh) × 0.4687 kg CO₂e<br />
                • 배출계수: 한국전력 전력배출계수 표준 반영
              </div>
            </div>

          </div>

          <div className="bg-[#FCFAF7] p-4 border border-[#E5E2D9] flex items-start gap-3 text-xs text-[#1C1A17]">
            <HelpCircle className="w-5 h-5 text-[#C2410C] shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <span className="font-bold font-serif text-[#1C1A17] block">수도 배출계수 산출 제외 규정 (GHG Protocol 준수)</span>
              <p className="text-[#57534E] leading-relaxed text-[11px]">
                수도(공업/생활용수)는 정수 유통 과정에서 일부 간접 배출(Scope 3)로 간주되나, 전사 총계(Scope 1+2) 산출 기준에는 포함하지 않는 것이 국제 표준인 GHG Protocol 및 환경부 탄소 공시 표준입니다. 본 온실가스 관리 시스템은 용수 사용량 및 탄소 배출량 이력은 정합 계산하되 전사 총량(tCO2e) 합계 및 목표 매칭률에서는 규정에 의거 자동 제외 처리합니다.
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
