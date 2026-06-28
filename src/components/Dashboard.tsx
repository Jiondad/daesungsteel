/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { MonthlyRecord } from '../types';
import { EMISSION_FACTORS, TARGETS_2026, calculateEmissions, calculateWaterEmissions } from '../constants';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { 
  Building2, 
  Flame, 
  Zap, 
  Droplet, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar,
  Layers,
  ChevronRight,
  Info,
  Coins,
  Database
} from 'lucide-react';

interface DashboardProps {
  records: MonthlyRecord[];
  onNavigateToEntry: () => void;
}

export default function Dashboard({ records, onNavigateToEntry }: DashboardProps) {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(6); // Default to June, which is the current month in June 2026!

  // Filter records for selected year
  const yearRecords = useMemo(() => {
    return records.filter(r => r.year === selectedYear);
  }, [records, selectedYear]);

  // Selected Month's actual record
  const currentMonthRecord = useMemo(() => {
    return yearRecords.find(r => r.month === selectedMonth);
  }, [yearRecords, selectedMonth]);

  // Selected Month's target
  const currentMonthTarget = useMemo(() => {
    // KPI is only specified for 2026, for other years we can estimate or use 2026 as a reference
    return TARGETS_2026[selectedMonth - 1];
  }, [selectedMonth]);

  // Calculate actual emissions for selected month
  const currentMonthEmissions = useMemo(() => {
    if (!currentMonthRecord) return null;
    return calculateEmissions(
      currentMonthRecord.diesel,
      currentMonthRecord.cityGas,
      currentMonthRecord.electricity
    );
  }, [currentMonthRecord]);

  const currentMonthWaterEmissions = useMemo(() => {
    if (!currentMonthRecord) return 0;
    return calculateWaterEmissions(currentMonthRecord.water);
  }, [currentMonthRecord]);

  // Calculate target emissions for selected month
  const currentMonthTargetEmissions = useMemo(() => {
    return calculateEmissions(
      currentMonthTarget.diesel,
      currentMonthTarget.cityGas,
      currentMonthTarget.electricity
    );
  }, [currentMonthTarget]);

  const currentMonthTargetWaterEmissions = useMemo(() => {
    return calculateWaterEmissions(currentMonthTarget.water);
  }, [currentMonthTarget]);

  // Calculations for KPI badge (Actual vs Target)
  const kpiComparison = useMemo(() => {
    if (!currentMonthEmissions) return null;
    
    const actual = currentMonthEmissions.total;
    const target = currentMonthTargetEmissions.total;
    const diff = actual - target;
    const percent = target > 0 ? (actual / target) * 100 : 0;
    const isExceeded = actual > target;

    return {
      actual,
      target,
      diff,
      percent,
      isExceeded
    };
  }, [currentMonthEmissions, currentMonthTargetEmissions]);

  // Annual Cumulative Calculations
  const annualCumulative = useMemo(() => {
    let actualTotal = 0;
    let actualScope1 = 0;
    let actualScope2 = 0;
    let actualWater = 0;
    let actualRevenue = 0;
    
    let targetTotalForActiveMonths = 0;
    let annualTargetTotal = 568.698; // 2026 Annual Target

    // Calculate actual cumulative
    yearRecords.forEach(r => {
      const em = calculateEmissions(r.diesel, r.cityGas, r.electricity);
      actualTotal += em.total;
      actualScope1 += em.scope1;
      actualScope2 += em.scope2;
      actualWater += calculateWaterEmissions(r.water);
      actualRevenue += r.revenue || 0;

      // Sum targets up to entered months for run-rate comparison
      const t = TARGETS_2026[r.month - 1];
      const tEm = calculateEmissions(t.diesel, t.cityGas, t.electricity);
      targetTotalForActiveMonths += tEm.total;
    });

    const percentOfAnnualTarget = (actualTotal / annualTargetTotal) * 100;
    const activeMonthsCount = yearRecords.length;
    const averageIntensity = actualRevenue > 0 ? actualTotal / actualRevenue : 0;

    return {
      actualTotal,
      actualScope1,
      actualScope2,
      actualWater,
      targetTotalForActiveMonths,
      annualTargetTotal,
      percentOfAnnualTarget,
      activeMonthsCount,
      actualRevenue,
      averageIntensity
    };
  }, [yearRecords]);

  // Prepare chart data for all 12 months
  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const target = TARGETS_2026[i];
      const targetEm = calculateEmissions(target.diesel, target.cityGas, target.electricity);
      
      const record = yearRecords.find(r => r.month === monthNum);
      const actualEm = record 
        ? calculateEmissions(record.diesel, record.cityGas, record.electricity)
        : null;

      const intensity = record && record.revenue && record.revenue > 0 && actualEm
        ? parseFloat((actualEm.total / record.revenue).toFixed(3))
        : null;

      return {
        month: `${monthNum}월`,
        // Targets
        '목표 배출량': parseFloat(targetEm.total.toFixed(3)),
        '목표 Scope1': parseFloat(targetEm.scope1.toFixed(3)),
        '목표 Scope2': parseFloat(targetEm.scope2.toFixed(3)),
        // Actuals (stacked)
        '실제 Scope 1': actualEm ? parseFloat(actualEm.scope1.toFixed(3)) : null,
        '실제 Scope 2': actualEm ? parseFloat(actualEm.scope2.toFixed(3)) : null,
        '실제 총배출량': actualEm ? parseFloat(actualEm.total.toFixed(3)) : null,
        // Revenue & Intensity
        '매출액': record ? record.revenue : null,
        '배출 원단위': intensity,
      };
    });
  }, [yearRecords]);

  // Render month details helper
  const renderMetricRow = (
    label: string, 
    icon: React.ReactNode, 
    actualVal: number, 
    targetVal: number, 
    unit: string, 
    factor: number
  ) => {
    const isExceeded = actualVal > targetVal;
    const diff = actualVal - targetVal;
    const ratio = targetVal > 0 ? (actualVal / targetVal) * 100 : 0;
    
    // Emission calculations
    const actualEmission = actualVal * factor;
    const targetEmission = targetVal * factor;

    return (
      <div className="bg-[#FAF9F6] border border-[#1C1A17]/15 rounded-none p-4 sm:p-5 transition-all hover:border-[#1C1A17]/40 shadow-sm">
        <div className="flex flex-col justify-start items-start gap-1.5 mb-4">
          {/* 1행 (제목 영역) */}
          <div className="flex items-center gap-2.5 w-full">
            <div className="p-2 bg-[#1C1A17] text-[#FAF9F6] rounded-none shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <span className="text-[#1C1A17] font-semibold text-[13px] sm:text-sm block font-serif whitespace-nowrap">{label}</span>
              <span className="text-[10px] sm:text-[11px] text-[#78716C] font-mono block whitespace-nowrap">계수: {factor.toFixed(7)} tCO₂e/{unit}</span>
            </div>
          </div>
          
          {/* 2행 (상태 뱃지 영역) */}
          <span className={`px-2.5 py-1 rounded-none text-[10px] font-mono font-bold tracking-wider uppercase border whitespace-nowrap mt-1 ${
            isExceeded 
              ? 'bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]' 
              : 'bg-[#F0FDF4] text-[#166534] border-[#86EFAC]'
          }`}>
            {isExceeded ? '목표 초과' : '목표 달성'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4 border-t border-b border-[#FAF9F6] py-2">
          <div>
            <span className="text-[#78716C] text-[10px] uppercase tracking-wider block mb-1">사용량 대비</span>
            <div className="font-mono">
              <span className="text-[#1C1A17] font-bold text-sm">{actualVal.toLocaleString()}</span>
              <span className="text-[#78716C] text-xs ml-1">/ {targetVal.toLocaleString()} {unit}</span>
            </div>
          </div>
          <div>
            <span className="text-[#78716C] text-[10px] uppercase tracking-wider block mb-1">탄소 배출량</span>
            <div className="font-mono">
              <span className="text-[#1C1A17] font-bold text-sm">{actualEmission.toFixed(3)}</span>
              <span className="text-[#78716C] text-xs ml-1">/ {targetEmission.toFixed(3)} t</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between text-xs">
            <span className="text-[#57534E] font-mono">달성비율</span>
            <span className={`font-mono font-bold ${isExceeded ? 'text-[#991B1B]' : 'text-[#166534]'}`}>
              {ratio.toFixed(1)}%
            </span>
          </div>
          <div className="overflow-hidden h-2 text-xs flex rounded-none bg-[#EAE6DD] border border-[#1C1A17]/10">
            <div
              style={{ width: `${Math.min(ratio, 100)}%` }}
              className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 rounded-none ${
                isExceeded ? 'bg-[#991B1B]' : 'bg-[#15803D]'
              }`}
            />
          </div>
          {diff !== 0 && (
            <div className="text-right mt-2 text-[11px] font-mono">
              <span className={isExceeded ? 'text-[#991B1B] font-semibold' : 'text-[#166534] font-semibold'}>
                {isExceeded ? '▲' : '▼'} {Math.abs(diff).toLocaleString(undefined, { maximumFractionDigits: 3 })} {unit} ({isExceeded ? '초과' : '감축'})
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Filters and Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#F2EFE9] p-5 border border-[#E5E2D9] rounded-none">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#1C1A17] text-[#FAF9F6] rounded-none">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1C1A17] tracking-tight flex items-center gap-2 font-display">
              (주)대성스틸 <span className="text-[10px] text-[#FAF9F6] bg-[#1C1A17] px-2.5 py-0.5 rounded-none font-mono uppercase tracking-widest font-semibold">ESG CONTROL ROOM</span>
            </h2>
            <p className="text-xs text-[#57534E] mt-0.5 font-sans">실시간 월별 KPI 분석 및 온실가스 저감 대시보드</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white p-1.5 border border-[#E5E2D9] text-xs font-mono">
            <span className="text-[#78716C] px-2 uppercase tracking-wider font-semibold">조회 연도</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-[#FAF9F6] text-[#1C1A17] border-none rounded-none px-2 py-1 font-semibold focus:outline-none focus:ring-1 focus:ring-[#1C1A17] cursor-pointer"
            >
              <option value={2026}>2026년 (KPI 실행년도)</option>
              <option value={2025}>2025년 (기준년도)</option>
              <option value={2024}>2024년</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white p-1.5 border border-[#E5E2D9] text-xs font-mono">
            <span className="text-[#78716C] px-2 uppercase tracking-wider font-semibold">조회 월</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-[#FAF9F6] text-[#1C1A17] border-none rounded-none px-2 py-1 font-semibold focus:outline-none focus:ring-1 focus:ring-[#1C1A17] cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}월</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Revenue & Emission Intensity Summary Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Cumulative Revenue Card */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1E40AF]" />
          <div>
            <div className="flex items-center gap-2.5 text-xs text-[#1E40AF] font-mono font-semibold uppercase tracking-widest mb-3">
              <Coins className="w-4 h-4" />
              Corporate Cumulative Revenue
            </div>
            <div className="flex justify-between items-end">
              <div>
                <span className="text-[11px] text-[#57534E] font-medium block">연간 누적 매출액</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold font-display text-[#1C1A17]">
                    {annualCumulative.actualRevenue.toLocaleString()}
                  </span>
                  <span className="text-sm font-bold text-[#1C1A17] font-serif">억원</span>
                </div>
              </div>
              <div className="text-right font-mono text-[10px] text-[#78716C] mb-1">
                <span>누적 입력 {annualCumulative.activeMonthsCount}개월 기준</span>
              </div>
            </div>
          </div>
        </div>

        {/* Emission Intensity Card */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#15803D]" />
          <div>
            <div className="flex items-center gap-2.5 text-xs text-[#15803D] font-mono font-semibold uppercase tracking-widest mb-3">
              <TrendingDown className="w-4 h-4" />
              Greenhouse Gas Intensity (원단위)
            </div>
            <div className="flex justify-between items-end">
              <div>
                <span className="text-[11px] text-[#57534E] font-medium block">연간 평균 온실가스 배출 원단위</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold font-display text-[#15803D]">
                    {annualCumulative.averageIntensity.toFixed(3)}
                  </span>
                  <span className="text-xs text-[#78716C] font-mono">tCO₂e / 억원</span>
                </div>
              </div>
              <div className="text-right font-mono text-[10px] text-[#78716C] mb-1">
                <span>[총 배출량 {annualCumulative.actualTotal.toFixed(1)}t ÷ 매출 {annualCumulative.actualRevenue}억]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main KPI Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Selected Month Target vs Actual Card */}
        <div className="lg:col-span-2 bg-white border border-[#1C1A17]/15 rounded-none p-6 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1C1A17]" />
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[#C2410C] font-mono font-semibold uppercase tracking-widest mb-1">
                <Calendar className="w-3.5 h-3.5" />
                Monthly KPI Analysis
              </div>
              <h3 className="text-2xl font-bold text-[#1C1A17] font-display">
                {selectedYear}년 {selectedMonth}월 배출량 실적 비교
              </h3>
            </div>

            {kpiComparison ? (
              <div className="flex flex-col items-end shrink-0">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-none text-xs font-bold font-mono tracking-wider border whitespace-nowrap shrink-0 ${
                  kpiComparison.isExceeded 
                    ? 'bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]' 
                    : 'bg-[#F0FDF4] text-[#166534] border-[#86EFAC]'
                }`}>
                  {kpiComparison.isExceeded ? (
                    <>
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap">목표 초과 ({kpiComparison.percent.toFixed(1)}%)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap">목표 달성 ({kpiComparison.percent.toFixed(1)}%)</span>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-[#78716C] font-mono mt-1 whitespace-nowrap">2026년 기준 국가 지침 준수</span>
              </div>
            ) : (
              <span className="text-xs text-[#D97706] bg-[#FEF3C7] border border-[#FCD34D] px-3 py-1 rounded-none font-bold uppercase tracking-wider font-mono whitespace-nowrap shrink-0">
                실적 데이터 없음
              </span>
            )}
          </div>

          {currentMonthRecord ? (
            <div className="space-y-6">
              {/* Summary Numbers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[#FCFAF7] p-5 border border-[#E5E2D9]">
                <div className="space-y-1">
                  <span className="text-[11px] text-[#57534E] font-medium uppercase tracking-wider block">실제 배출량 합계 (S1+S2)</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold font-display text-[#1C1A17]">
                      {currentMonthEmissions?.total.toFixed(3)}
                    </span>
                    <span className="text-xs text-[#78716C] font-mono">tCO₂e</span>
                  </div>
                </div>

                <div className="space-y-1 border-t md:border-t-0 md:border-l border-[#E5E2D9] md:pl-6 pt-4 md:pt-0">
                  <span className="text-[11px] text-[#57534E] font-medium uppercase tracking-wider block">월별 KPI 목표량</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold font-display text-[#78716C]">
                      {currentMonthTargetEmissions.total.toFixed(3)}
                    </span>
                    <span className="text-xs text-[#78716C] font-mono">tCO₂e</span>
                  </div>
                </div>

                <div className="space-y-1 border-t md:border-t-0 md:border-l border-[#E5E2D9] md:pl-6 pt-4 md:pt-0">
                  <span className="text-[11px] text-[#57534E] font-medium uppercase tracking-wider block">목표 대비 격차 (Delta)</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-bold font-display ${kpiComparison?.isExceeded ? 'text-[#991B1B]' : 'text-[#166534]'}`}>
                      {kpiComparison ? (kpiComparison.isExceeded ? '+' : '') : ''}
                      {kpiComparison?.diff.toFixed(3)}
                    </span>
                    <span className={`text-xs font-mono font-bold ${kpiComparison?.isExceeded ? 'text-[#991B1B]' : 'text-[#166534]'}`}>tCO₂e</span>
                  </div>
                </div>
              </div>

              {/* Scope Detail Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#FAF9F6] p-4 border border-[#E5E2D9] flex justify-between items-center rounded-none shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 bg-[#B45309]" />
                    <div>
                      <span className="text-xs text-[#1C1A17] font-bold block font-serif">Scope 1 (직접 배출)</span>
                      <span className="text-[11px] text-[#78716C] block">경유 + 가스 연소 실적</span>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[#1C1A17] text-sm font-bold">{currentMonthEmissions?.scope1.toFixed(3)} t</span>
                    <span className="text-[#78716C] text-[10px] block">목표: {currentMonthTargetEmissions.scope1.toFixed(3)} t</span>
                  </div>
                </div>

                <div className="bg-[#FAF9F6] p-4 border border-[#E5E2D9] flex justify-between items-center rounded-none shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 bg-[#1E40AF]" />
                    <div>
                      <span className="text-xs text-[#1C1A17] font-bold block font-serif">Scope 2 (간접 배출)</span>
                      <span className="text-[11px] text-[#78716C] block">외부 구매 전력 사용분</span>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[#1C1A17] text-sm font-bold">{currentMonthEmissions?.scope2.toFixed(3)} t</span>
                    <span className="text-[#78716C] text-[10px] block">목표: {currentMonthTargetEmissions.scope2.toFixed(3)} t</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#E5E2D9] rounded-none bg-[#FCFAF7] space-y-4">
              <div className="p-3 bg-[#FAF9F6] text-[#78716C] border border-[#E5E2D9] rounded-none">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1 max-w-md">
                <p className="text-[#1C1A17] font-bold text-sm font-serif">{selectedYear}년 {selectedMonth}월 실적 보고서가 아직 입력되지 않았습니다.</p>
                <p className="text-xs text-[#57534E]">월별 에너지 사용량 원시 데이터를 입력하면, 온실가스 표준 배출량 tCO₂e으로 변환되어 이곳에 실시간 분석 공시됩니다.</p>
              </div>
              <button
                onClick={onNavigateToEntry}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-[#1C1A17] hover:bg-[#2C2A27] text-white text-xs font-bold font-serif tracking-wider uppercase rounded-none transition-all cursor-pointer"
              >
                에너지 실적 입력하러 가기
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Year Cumulative Card */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#15803D]" />
          
          <div className="space-y-4">
            <div className="flex flex-col justify-start items-start gap-1.5">
              <div className="flex items-center gap-1.5 text-xs text-[#15803D] font-mono font-semibold uppercase tracking-widest">
                <Layers className="w-3.5 h-3.5" />
                Annual Cumulative Target
              </div>
              <h3 className="text-sm sm:text-base font-bold text-[#1C1A17] font-display whitespace-nowrap">
                {selectedYear}년 누적 실적 및 로드맵 매칭률
              </h3>
            </div>

            <div className="space-y-5 py-2">
              <div className="flex flex-col justify-start items-start gap-1">
                <span className="text-xs text-[#57534E] font-medium font-serif whitespace-nowrap">현재 누적 총 배출량 (Scope 1+2)</span>
                <div className="font-mono">
                  <span className="text-2xl sm:text-3xl font-bold text-[#1C1A17] font-display">{annualCumulative.actualTotal.toFixed(3)}</span>
                  <span className="text-xs text-[#78716C] ml-1">t</span>
                </div>
              </div>

              {/* Progress Bar with target marker */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#57534E]">연간 목표 대비 소진율</span>
                  <span className="text-[#15803D] font-bold">{annualCumulative.percentOfAnnualTarget.toFixed(2)}%</span>
                </div>
                <div className="relative h-3 w-full bg-[#EAE6DD] rounded-none border border-[#1C1A17]/10">
                  <div
                    style={{ width: `${Math.min(annualCumulative.percentOfAnnualTarget, 100)}%` }}
                    className="h-full bg-[#15803D] rounded-none transition-all duration-500"
                  />
                  {/* Mark theoretical target line up to current month */}
                  {annualCumulative.activeMonthsCount > 0 && (
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-[#B45309]"
                      title={`현재 개월수 비례 Run-rate 목표선 (${((annualCumulative.targetTotalForActiveMonths / annualCumulative.annualTargetTotal) * 100).toFixed(1)}%)`}
                      style={{ left: `${Math.min((annualCumulative.targetTotalForActiveMonths / annualCumulative.annualTargetTotal) * 100, 99)}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-[#78716C] font-mono">
                  <span>0%</span>
                  {annualCumulative.activeMonthsCount > 0 && (
                    <span className="text-[#B45309] font-semibold">▲ {annualCumulative.activeMonthsCount}개월 누적 목표선</span>
                  )}
                  <span>100% 목표 ({annualCumulative.annualTargetTotal} t)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#E5E2D9] text-xs text-[#57534E] space-y-3 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-[#78716C] uppercase text-[10px] tracking-wider font-semibold">누적 입력 개월:</span>
              <span className="text-[#1C1A17] font-bold">{annualCumulative.activeMonthsCount} / 12 개월</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#78716C] uppercase text-[10px] tracking-wider font-semibold">누적 Scope 1:</span>
              <span className="text-[#1C1A17] font-bold">{annualCumulative.actualScope1.toFixed(3)} t</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#78716C] uppercase text-[10px] tracking-wider font-semibold">누적 Scope 2:</span>
              <span className="text-[#1C1A17] font-bold">{annualCumulative.actualScope2.toFixed(3)} t</span>
            </div>
            <div className="flex justify-between items-center text-xs text-[#78716C] border-t border-[#E5E2D9]/80 pt-2.5">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3" />
                수도 배출량 (S3 감축제외):
              </span>
              <span className="font-semibold">{annualCumulative.actualWater.toFixed(3)} t</span>
            </div>
          </div>

        </div>
      </div>

      {/* Detail Analysis Grid */}
      {currentMonthRecord && (
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-[#1C1A17] tracking-widest uppercase font-mono flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[#1C1A17]" />
            에너지 자원별 세부 KPI 분석 및 누출 관리
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderMetricRow(
              '경유 (Scope 1)', 
              <Flame className="w-4 h-4" />, 
              currentMonthRecord.diesel, 
              currentMonthTarget.diesel, 
              'L', 
              EMISSION_FACTORS.diesel
            )}
            {renderMetricRow(
              '도시가스 (Scope 1)', 
              <Building2 className="w-4 h-4" />, 
              currentMonthRecord.cityGas, 
              currentMonthTarget.cityGas, 
              'Nm³', 
              EMISSION_FACTORS.cityGas
            )}
            {renderMetricRow(
              '구매전력 (Scope 2)', 
              <Zap className="w-4 h-4" />, 
              currentMonthRecord.electricity, 
              currentMonthTarget.electricity, 
              'kWh', 
              EMISSION_FACTORS.electricity
            )}
            {renderMetricRow(
              '용수/수도 (전사제외)', 
              <Droplet className="w-4 h-4" />, 
              currentMonthRecord.water, 
              currentMonthTarget.water, 
              'TON', 
              EMISSION_FACTORS.water
            )}
          </div>
        </div>
      )}

      {/* Recharts Mixed Graph - 12 Months Run-rate Track */}
      <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#FAF9F6]">
          <div>
            <h3 className="text-lg font-bold text-[#1C1A17] flex items-center gap-2 font-display">
              <Layers className="w-4 h-4 text-[#1C1A17]" />
              {selectedYear}년 월별 목표 대비 실제 총 온실가스 배출량 추이
            </h3>
            <p className="text-xs text-[#57534E] mt-0.5 font-sans">막대그래프는 실제 배출량 (S1 직접 / S2 간접), 꺾은선은 대성스틸 2026년 월별 공식 Run-rate 감축 목표치입니다.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#B45309] rounded-none" />실제 Scope 1</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#1E40AF] rounded-none" />실제 Scope 2</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t-2 border-[#991B1B]" />목표 배출량 (t)</span>
          </div>
        </div>

        <div className="h-80 w-full font-mono text-[11px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#FAF9F6" />
              <XAxis dataKey="month" stroke="#78716C" tick={{ fill: '#78716C' }} />
              <YAxis stroke="#78716C" tick={{ fill: '#78716C' }} label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', fill: '#78716C', offset: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#FAF9F6', borderColor: '#E5E2D9', borderRadius: '0px' }}
                itemStyle={{ color: '#1C1A17' }}
                labelStyle={{ color: '#57534E', fontWeight: 'bold' }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ color: '#1C1A17', fontSize: '11px' }} />
              
              {/* Actuals Stacked Bar */}
              <Bar dataKey="실제 Scope 1" stackId="actual" fill="#B45309" radius={[0, 0, 0, 0]} barSize={24} />
              <Bar dataKey="실제 Scope 2" stackId="actual" fill="#1E40AF" radius={[0, 0, 0, 0]} barSize={24} />
              
              {/* KPI Goal Line */}
              <Line 
                type="monotone" 
                dataKey="목표 배출량" 
                stroke="#991B1B" 
                strokeWidth={2.5} 
                dot={{ r: 4, fill: '#991B1B', strokeWidth: 0 }} 
                activeDot={{ r: 6 }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recharts Line Graph - Monthly Revenue & Emission Intensity Trend */}
      <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#FAF9F6]">
          <div>
            <h3 className="text-lg font-bold text-[#1C1A17] flex items-center gap-2 font-display">
              <Coins className="w-4 h-4 text-[#1C1A17]" />
              {selectedYear}년 월별 매출액 대비 배출량(원단위) 추이
            </h3>
            <p className="text-xs text-[#57534E] mt-0.5 font-sans">
              막대그래프는 해당 월 매출액(억원)을 나타내며, 녹색 실선은 매출액 대비 배출량 비율인 온실가스 배출 원단위(tCO₂e/억원) 추이입니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-[#EAE6DD] rounded-none" />월별 매출액 (억원)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-[#15803D]" />배출 원단위 (tCO₂e/억원)
            </span>
          </div>
        </div>

        <div className="h-80 w-full font-mono text-[11px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: -5, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#FAF9F6" />
              <XAxis dataKey="month" stroke="#78716C" tick={{ fill: '#78716C' }} />
              <YAxis 
                yAxisId="left"
                stroke="#78716C" 
                tick={{ fill: '#78716C' }} 
                label={{ value: '매출액 (억원)', angle: -90, position: 'insideLeft', fill: '#78716C', offset: 10 }} 
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#78716C" 
                tick={{ fill: '#78716C' }} 
                label={{ value: '배출 원단위 (t/억원)', angle: 90, position: 'insideRight', fill: '#78716C', offset: 10 }} 
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#FAF9F6', borderColor: '#E5E2D9', borderRadius: '0px' }}
                itemStyle={{ color: '#1C1A17' }}
                labelStyle={{ color: '#57534E', fontWeight: 'bold' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#FAF9F6] border border-[#E5E2D9] rounded-none p-3.5 space-y-2 text-xs font-mono text-[#1C1A17]">
                        <p className="font-bold text-[#1C1A17] border-b border-[#E5E2D9] pb-1 font-serif">{data.month}</p>
                        <p className="text-[#1E40AF] font-semibold">
                          월 매출액: {data['매출액'] !== null && data['매출액'] !== undefined ? `${data['매출액'].toLocaleString()} 억원` : '데이터 미입력'}
                        </p>
                        <p className="text-[#15803D] font-semibold">
                          배출 원단위: {data['배출 원단위'] !== null && data['배출 원단위'] !== undefined ? `${data['배출 원단위'].toFixed(3)} t/억원` : '데이터 미입력'}
                        </p>
                        {data['실제 총배출량'] !== null && (
                          <p className="text-[#78716C] text-[10px] font-sans mt-1">
                            (배출량 {data['실제 총배출량'].toFixed(3)} t 기준)
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ color: '#1C1A17', fontSize: '11px' }} />
              
              {/* Revenue Bar */}
              <Bar yAxisId="left" dataKey="매출액" name="월별 매출액 (억원)" fill="#EAE6DD" radius={[0, 0, 0, 0]} barSize={24} />
              
              {/* Intensity Line */}
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="배출 원단위" 
                name="배출 원단위 (tCO₂e/억원)"
                stroke="#15803D" 
                strokeWidth={2.5} 
                dot={{ r: 4, fill: '#15803D', strokeWidth: 0 }} 
                activeDot={{ r: 6 }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Raw Data Table Section */}
      <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#FAF9F6]">
          <div>
            <h3 className="text-lg font-bold text-[#1C1A17] flex items-center gap-2 font-display">
              <Database className="w-4 h-4 text-[#1C1A17]" />
              {selectedYear}년 월별 로우데이터(Raw Data) 세부 이력
            </h3>
            <p className="text-xs text-[#57534E] mt-0.5 font-sans">
              선택한 연도의 1월부터 12월까지 입력된 실제 원본 사용량 데이터와 계산된 탄소배출량 및 매출 원단위 정보를 한눈에 확인할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#1C1A17]/10 w-full max-w-full">
          <table className="w-full text-left border-collapse font-sans table-auto">
            <thead>
              <tr className="bg-[#FAF9F6] border-b border-[#1C1A17]/15 text-[10px] sm:text-[11px] font-bold text-[#57534E] uppercase tracking-wider font-mono">
                <th className="py-2.5 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center whitespace-nowrap">작업년월</th>
                <th className="py-2.5 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right whitespace-nowrap">경유 (L)</th>
                <th className="py-2.5 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right whitespace-nowrap">도시가스 (Nm³)</th>
                <th className="py-2.5 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right whitespace-nowrap">구매전력 (kWh)</th>
                <th className="py-2.5 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right whitespace-nowrap">상수도 (TON)</th>
                <th className="py-2.5 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right whitespace-nowrap">매출액 (억원)</th>
                <th className="py-2.5 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right whitespace-nowrap">총 배출량 (tCO₂e)</th>
                <th className="py-2.5 px-2 sm:px-3 text-right whitespace-nowrap">원단위 (t/억원)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1A17]/10 text-[10px] sm:text-xs text-[#1C1A17]">
              {Array.from({ length: 12 }, (_, i) => {
                const monthNum = i + 1;
                const record = yearRecords.find(r => r.month === monthNum);
                const actualEm = record 
                  ? calculateEmissions(record.diesel, record.cityGas, record.electricity)
                  : null;
                const intensity = record && record.revenue && record.revenue > 0 && actualEm
                  ? parseFloat((actualEm.total / record.revenue).toFixed(3))
                  : null;

                return (
                  <tr 
                    key={monthNum} 
                    className="hover:bg-[#FAF9F6] transition-colors bg-white"
                  >
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center font-bold whitespace-nowrap">
                      {selectedYear}년 {monthNum}월
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? record.diesel.toLocaleString() : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? record.cityGas.toLocaleString() : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? record.electricity.toLocaleString() : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? record.water.toLocaleString() : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record && record.revenue !== null && record.revenue !== undefined ? record.revenue.toLocaleString() : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono font-bold text-[#1E40AF]">
                      {actualEm ? actualEm.total.toFixed(3) : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-right font-mono font-bold text-[#15803D]">
                      {intensity !== null ? intensity.toFixed(3) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
