import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { YearPicker } from './YearPicker';
import { AchievementDoughnutChart } from './charts/AchievementDoughnutChart';
import { MonthlyEmissionsChart } from './charts/MonthlyEmissionsChart';
import { RevenueIntensityChart } from './charts/RevenueIntensityChart';
import { TARGETS_2026 } from '../lib/constants';
import { calculateEmissions, formatVal, getFactors, isEntered } from '../lib/emissions';
import { buildSeasonalProfile, forecastAnnual } from '../lib/planning';
import { computeAnnualTarget, computePeriodStats, pctDiff } from '../lib/period';

export const Dashboard = ({ records, targets = {}, onNavigateToEntry, onRefresh, availableYears = [2026, 2025, 2024] }) => {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);
  const [printDate, setPrintDate] = useState('');
  const [showPrintNotice, setShowPrintNotice] = useState(false);

  useEffect(() => {
    if (onRefresh) onRefresh();
    setToMonth(12);
  }, [selectedYear]);

  const isIframe = useMemo(() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }, []);

  const handlePrint = () => {
    // Always try to invoke window.print()
    try {
      window.print();
    } catch (error) {
      console.error("Print invocation failed:", error);
    }
    
    // Show guidance notice if inside iframe where print might be blocked or fails to open
    if (isIframe) {
      setShowPrintNotice(true);
    }
  };

  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      const yr = now.getFullYear();
      const mt = String(now.getMonth() + 1).padStart(2, '0');
      const dy = String(now.getDate()).padStart(2, '0');
      const hr = String(now.getHours()).padStart(2, '0');
      const mn = String(now.getMinutes()).padStart(2, '0');
      const sc = String(now.getSeconds()).padStart(2, '0');
      setPrintDate(`${yr}-${mt}-${dy} ${hr}:${mn}:${sc}`);
    };
    updateDate();
    window.addEventListener('beforeprint', updateDate);
    return () => window.removeEventListener('beforeprint', updateDate);
  }, []);

  const yearTargets = useMemo(() => {
    return targets[selectedYear] || TARGETS_2026;
  }, [targets, selectedYear]);

  const handleFromMonthChange = (e) => {
    const val = Number(e.target.value);
    setFromMonth(val);
    if (val > toMonth) {
      setToMonth(val);
    }
  };

  const handleToMonthChange = (e) => {
    const val = Number(e.target.value);
    if (val < fromMonth) {
      setFromMonth(val);
    }
    setToMonth(val);
  };

  const yearRecords = useMemo(() => records.filter(r => r.year === selectedYear && isEntered(r)), [records, selectedYear]);

  // Calculate period-specific stats (fromMonth to toMonth)
  const periodStats = useMemo(
    () => computePeriodStats(yearRecords, yearTargets, fromMonth, toMonth, selectedYear),
    [yearRecords, fromMonth, toMonth, yearTargets, selectedYear]
  );

  // 계절 보정 연말 예상(참고용 추정치)과 연간 목표
  const forecast = useMemo(() => {
    const profile = buildSeasonalProfile(records, { beforeYear: selectedYear, maxYears: 2 });
    return forecastAnnual(records, selectedYear, profile);
  }, [records, selectedYear]);
  const annualTarget = useMemo(() => computeAnnualTarget(yearTargets, selectedYear), [yearTargets, selectedYear]);

  const signedPct = (v) => `${v >= 0 ? '+' : '−'}${formatVal(Math.abs(v), 1)}%`;
  const monthsLabel = (list) => {
    if (!list.length) return '';
    const contiguous = list.every((m, i) => i === 0 || m === list[i - 1] + 1);
    return contiguous ? (list.length === 1 ? `${list[0]}월` : `${list[0]}월~${list[list.length - 1]}월`) : `${list.join(', ')}월`;
  };

  // Yearly stats (1 to 12) for the table footer
  const yearStats = useMemo(() => {
    let diesel = 0;
    let cityGas = 0;
    let electricity = 0;
    let water = 0;
    let revenue = 0;
    let activeMonths = 0;

    for (let m = 1; m <= 12; m++) {
      const r = yearRecords.find(rec => rec.month === m);
      if (r) {
        diesel += r.diesel || 0;
        cityGas += r.cityGas || 0;
        electricity += r.electricity || 0;
        water += r.water || 0;
        revenue += r.revenue || 0;
        activeMonths++;
      }
    }

    const em = calculateEmissions(diesel, cityGas, electricity, selectedYear);
    return {
      diesel,
      cityGas,
      electricity,
      water,
      revenue,
      emissions: em.total,
      intensity: revenue > 0 ? (em.total / revenue) : 0,
      activeMonths
    };
  }, [yearRecords]);

  // Primary Mixed Graph Data (fromMonth to toMonth)
  const chartData1 = useMemo(() => {
    const data = [];
    for (let m = fromMonth; m <= toMonth; m++) {
      const target = yearTargets[m - 1] || yearTargets[0] || TARGETS_2026[0];
      const record = yearRecords.find(r => r.month === m);

      const targetEm = calculateEmissions(target.diesel, target.cityGas, target.electricity, selectedYear);
      const actualEm = record ? calculateEmissions(record.diesel, record.cityGas, record.electricity, selectedYear) : null;

      data.push({
        month: m,
        scope1: actualEm ? actualEm.scope1 : 0,
        scope2: actualEm ? actualEm.scope2 : 0,
        target: targetEm.total,
      });
    }
    return data;
  }, [yearRecords, fromMonth, toMonth, yearTargets]);

  // Revenue & Intensity Graph Data (fromMonth to toMonth)
  const chartData2 = useMemo(() => {
    const data = [];
    for (let m = fromMonth; m <= toMonth; m++) {
      const record = yearRecords.find(r => r.month === m);
      const actualEm = record ? calculateEmissions(record.diesel, record.cityGas, record.electricity, selectedYear) : null;
      const revenue = record && record.revenue !== undefined ? record.revenue : null;
      const intensity = record && record.revenue > 0 && actualEm ? (actualEm.total / record.revenue) : null;

      data.push({
        month: m,
        revenue: revenue,
        intensity: intensity,
      });
    }
    return data;
  }, [yearRecords, fromMonth, toMonth]);

  const renderMetricRow = (label, icon, value, target, unit, factor) => {
    const isExceeded = value > target;
    return (
      <div className="bg-[#FAF9F6] border border-[#1C1A17]/15 p-4 sm:p-5 hover:border-[#1C1A17]/40 shadow-sm print-avoid-break">
        <div className="flex flex-col justify-start items-start gap-1.5 mb-4">
          <div className="flex items-center gap-2.5 w-full">
            <div className="p-2 bg-[#1C1A17] text-[#FAF9F6] shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <span className="text-[#1C1A17] font-semibold text-[13px] sm:text-sm block whitespace-nowrap">{label}</span>
              <span className="text-[10px] text-[#78716C] font-mono block whitespace-nowrap">계수: {factor.toFixed(7)} tCO₂e/{unit}</span>
            </div>
          </div>
          {periodStats.activeMonthsCount > 0 ? (
            <span className={`px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider uppercase border whitespace-nowrap mt-1 ${
              isExceeded 
                ? 'bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]' 
                : 'bg-[#F0FDF4] text-[#166534] border-[#86EFAC]'
            }`}>
              {isExceeded ? '목표 초과' : '목표 달성'}
            </span>
          ) : (
            <span className="px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider uppercase border whitespace-nowrap mt-1 bg-gray-100 text-gray-500 border-gray-300">
              데이터 없음
            </span>
          )}
        </div>

        <div className="space-y-2 font-mono text-xs mt-3">
          <div className="flex justify-between items-center text-[#57534E]">
            <span>실제 사용량:</span>
            <span className="font-bold text-[#1C1A17]">{value !== undefined ? formatVal(value, 2) : '0.00'} {unit}</span>
          </div>
          <div className="flex justify-between items-center text-[#78716C]">
            <span>기준 목표치:</span>
            <span>{formatVal(target, 2)} {unit}</span>
          </div>
          <div className="flex justify-between items-center text-[#57534E] border-t border-[#1C1A17]/10 pt-2 text-[11px]">
            <span className="font-medium">환산 배출량:</span>
            <span className="font-bold text-[#1C1A17]">{formatVal(value * factor, 2)} tCO₂e</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Print Official Header (Only visible when printing / PDF generation) */}
      <div className="hidden print:block border-b-4 border-[#1C1A17] pb-5 print:pb-2 mb-8 print:mb-3">
        <div className="flex justify-between items-end">
          <div>
            <span className="text-[10px] text-[#78716C] font-mono tracking-widest block uppercase font-bold">CONFIDENTIAL — GHG EMISSIONS STANDARD REPORT</span>
            <h1 className="text-3xl print:text-xl font-extrabold tracking-tight text-[#1C1A17] font-display mt-1">
              (주)대성스틸 온실가스 인벤토리 공식 보고서
            </h1>
            <p className="text-xs text-[#57534E] font-mono mt-1">
              OFFICIAL GREENHOUSE GAS EMISSIONS STATEMENT & INVENTORY RECORD
            </p>
          </div>
          <div className="text-right">
            <div className="w-14 h-14 print:w-10 print:h-10 bg-[#1C1A17] text-[#FAF9F6] flex items-center justify-center font-bold text-lg ml-auto mb-1">DS</div>
            <span className="text-[10px] text-[#78716C] font-semibold block">(주)대성스틸 안전환경본부</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 print:gap-2 mt-6 print:mt-2 border-t border-[#1C1A17]/20 pt-4 print:pt-2 text-[11px] font-sans">
          <div className="border border-[#1C1A17]/10 p-2 print:p-1 bg-[#FAF9F6]/50">
            <span className="text-[#78716C] block uppercase font-mono text-[9px] tracking-wider font-semibold">보고 연도</span>
            <strong className="text-[#1C1A17] text-xs font-mono">{selectedYear}년도</strong>
          </div>
          <div className="border border-[#1C1A17]/10 p-2 print:p-1 bg-[#FAF9F6]/50">
            <span className="text-[#78716C] block uppercase font-mono text-[9px] tracking-wider font-semibold">설정 조회 기간</span>
            <strong className="text-[#1C1A17] text-xs font-mono">{fromMonth}월 ~ {toMonth}월 (누적)</strong>
          </div>
          <div className="border border-[#1C1A17]/10 p-2 print:p-1 bg-[#FAF9F6]/50">
            <span className="text-[#78716C] block uppercase font-mono text-[9px] tracking-wider font-semibold">검증 검인 표준</span>
            <strong className="text-[#1C1A17] text-xs">IPCC / 국가 배출 계수 기준</strong>
          </div>
          <div className="border border-[#1C1A17]/10 p-2 print:p-1 bg-[#FAF9F6]/50">
            <span className="text-[#78716C] block uppercase font-mono text-[9px] tracking-wider font-semibold">문서 관리 코드</span>
            <strong className="text-[#1C1A17] text-xs font-mono">DS-GHG-{selectedYear}-{String(fromMonth).padStart(2,'0')}{String(toMonth).padStart(2,'0')}</strong>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-[#1C1A17]/15 p-4 sm:p-5 shadow-sm print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#1C1A17] text-white">
            <Icon name="dashboard" className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1C1A17] font-display">종합 실적 모니터링 대시보드</h2>
            <p className="text-[11px] sm:text-xs text-[#57534E]">지정된 시작월 ~ 종료월 기간의 탄소 집약도 배출 성과 실적</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <YearPicker
            value={selectedYear}
            years={availableYears}
            onChange={(yr) => {
              setSelectedYear(yr);
              setFromMonth(1);
              setToMonth(12);
            }}
          />
          
          <div className="flex items-center gap-1.5 bg-[#FAF9F6] border border-[#E5E2D9] px-2.5 h-9 text-xs sm:text-sm">
            <span className="text-[#78716C] font-semibold text-[11px] mr-1 uppercase">시작</span>
            <select
              id="start-month"
              value={fromMonth}
              onChange={handleFromMonthChange}
              className="bg-transparent font-mono cursor-pointer focus:outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}월</option>
              ))}
            </select>
            <span className="text-[#78716C] px-1 font-semibold">~</span>
            <span className="text-[#78716C] font-semibold text-[11px] mr-1 uppercase">종료</span>
            <select
              id="end-month"
              value={toMonth}
              onChange={handleToMonthChange}
              className="bg-transparent font-mono cursor-pointer focus:outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}월</option>
              ))}
            </select>
          </div>

          {/* Report Print Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 h-9 px-3 bg-[#15803D] hover:bg-[#166534] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-sm border border-[#15803D]/10 rounded-none shrink-0"
            title="공식 온실가스 인벤토리 보고서 출력 및 PDF 저장"
          >
            <Icon name="print" className="w-3.5 h-3.5" />
            <span>보고서 출력</span>
          </button>
        </div>
      </div>

      {/* Single Integrated Performance Analysis Card */}
      {/* NOTE: no print-avoid-break here on purpose — this block is tall
          enough that forcing it to stay in one piece pushes it entirely
          onto the next page and leaves a large blank gap on the
          previous one. Instead, avoid-break is applied to each smaller
          sub-section below so nothing splits mid-card, but the page can
          still break naturally between them. The outer border/shadow is
          also dropped for print (print:border-0 etc.) — the inner cards
          already have their own borders, so when this outer box breaks
          across a page it no longer leaves a dangling half-open edge
          that looks like the content got cut off. */}
      <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm space-y-6 print:border-0 print:shadow-none print:p-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1C1A17]/10 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#1C1A17] uppercase tracking-wider font-display flex items-center gap-2 flex-wrap">
              <Icon name="dashboard" className="w-5 h-5 text-[#1C1A17] shrink-0" />
              <span className="whitespace-nowrap">{selectedYear}년 {fromMonth}월 ~ {toMonth}월 누적 탄소 명세서</span>
              <span className="whitespace-nowrap">(Carbon Statement)</span>
            </h3>
            <p className="text-xs text-[#57534E] mt-0.5">
              선택한 조회 기간 동안의 온실가스 배출 실적을 같은 기간의 누적 목표와 비교합니다.
              {periodStats.missingMonths.length > 0 && periodStats.activeMonthsCount > 0 && (
                <span className="block text-[#B45309] font-semibold mt-0.5">
                  미입력 {monthsLabel(periodStats.missingMonths)}은(는) 목표 누적에서 제외했습니다.
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-[#FAF9F6] border border-[#E5E2D9] px-2.5 py-1 text-xs font-mono shrink-0">
            <span className="text-[#78716C] uppercase font-bold text-[9px] whitespace-nowrap">조회 범위 내 입력 완료:</span>
            <span className="text-[#1C1A17] font-bold whitespace-nowrap">{periodStats.activeMonthsCount} / {(toMonth - fromMonth + 1)} 개월</span>
          </div>
        </div>

        {periodStats.activeMonthsCount > 0 ? (
          <div className="space-y-6">
            {/* 5 KPI Cards placed horizontally at the top */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-3 gap-4 font-mono print-avoid-break">
              <div className="bg-[#FAF9F6] p-4 border border-[#1C1A17]/10">
                <span className="text-[10px] text-[#78716C] uppercase tracking-wider block font-semibold">선택 기간 총 배출량</span>
                <span className="text-xl sm:text-2xl font-bold text-[#1C1A17]">{formatVal(periodStats.actualTotal, 2)}</span>
                <span className="text-xs text-[#57534E] ml-1">t</span>
              </div>
              <div className="bg-[#FAF9F6] p-4 border border-[#1C1A17]/10">
                <span className="text-[10px] text-[#78716C] uppercase tracking-wider block font-semibold">동일 기간 누적 목표</span>
                <span className="text-xl sm:text-2xl font-bold text-[#0D9488]">{formatVal(periodStats.targetTotal, 2)}</span>
                <span className="text-xs text-[#78716C] ml-1">t</span>
                <span className="text-[10px] text-[#78716C] block font-sans font-semibold mt-1 leading-tight">
                  입력 {periodStats.activeMonthsCount}개월 기준 · 기간 전체 목표 {formatVal(periodStats.targetFullTotal, 2)} t
                </span>
              </div>
              <div className="bg-[#FAF9F6] p-4 border border-[#1C1A17]/10">
                <span className="text-[10px] text-[#78716C] uppercase tracking-wider block font-semibold">Scope 1 (직접)</span>
                <span className="text-lg sm:text-xl font-bold text-[#B45309]">{formatVal(periodStats.actualScope1, 2)}</span>
                <span className="text-xs text-[#78716C] ml-0.5">t</span>
              </div>
              <div className="bg-[#FAF9F6] p-4 border border-[#1C1A17]/10">
                <span className="text-[10px] text-[#78716C] uppercase tracking-wider block font-semibold">Scope 2 (간접)</span>
                <span className="text-lg sm:text-xl font-bold text-[#1E40AF]">{formatVal(periodStats.actualScope2, 2)}</span>
                <span className="text-xs text-[#78716C] ml-0.5">t</span>
              </div>
              <div className="bg-[#FAF9F6] p-4 border border-[#1C1A17]/10 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-[#78716C] uppercase tracking-wider block font-semibold">평균 탄소 집약도</span>
                <span className="text-xl sm:text-2xl font-bold text-[#1C1A17]">{formatVal(periodStats.intensity, 3)}</span>
                <span className="text-xs text-[#57534E] ml-1">t/억원</span>
                <span className="text-[10px] text-[#78716C] block font-sans font-semibold mt-1 leading-tight">
                  매출 1억원당 배출량
                </span>
              </div>
            </div>

            {/* Left: Doughnut Chart / Right: Actual vs Target Horizontal Bar Chart */}
            {/* print:block (instead of staying a CSS grid) — Chromium's print
                pagination for grid containers is unreliable and can leave a
                large blank gap before breaking to the next page even when the
                next section would actually fit. A plain block stack (which
                looks identical here since print:grid-cols-1 already reduces
                this to one column) paginates correctly. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-1 print-stack gap-6 print:space-y-4 items-stretch">
              {/* Doughnut Chart Card (Left) */}
              <div className="border border-[#1C1A17]/10 p-5 bg-[#FAF9F6] flex flex-col justify-between print-avoid-break">
                <div>
                  <h4 className="text-xs font-bold text-[#1C1A17] tracking-wider uppercase font-sans flex items-center gap-1.5 mb-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                    목표 달성률 (Achievement Rate)
                  </h4>
                  <p className="text-[11px] text-[#78716C]">목표 가이드라인 사용량 대비 실제 온실가스 소진율을 가독성 있게 표현한 도넛 차트입니다.</p>
                </div>
                <div className="py-6 flex items-center justify-center">
                  <AchievementDoughnutChart actual={periodStats.actualTotal} target={periodStats.targetTotal} />
                </div>
                <div className="flex justify-between text-[11px] text-[#78716C] font-mono border-t border-[#1C1A17]/10 pt-3">
                  <span>동일 기간({periodStats.activeMonthsCount}개월) 누적 목표:</span>
                  <span className="font-bold text-[#1C1A17]">{formatVal(periodStats.targetTotal, 2)} t</span>
                </div>
                <div className="flex justify-between text-[11px] text-[#78716C] font-mono pt-1.5">
                  <span>기간 전체 목표 대비 현재 소진율:</span>
                  <span className="font-bold text-[#1C1A17]">{formatVal(periodStats.targetFullTotal > 0 ? (periodStats.actualTotal / periodStats.targetFullTotal) * 100 : 0, 1)}%</span>
                </div>
              </div>

              {/* Horizontal Bar Chart (Right) */}
              <div className="border border-[#1C1A17]/10 p-5 bg-[#FAF9F6] flex flex-col justify-between print-avoid-break">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
                  <div>
                    <h4 className="text-xs font-bold text-[#1C1A17] tracking-wider uppercase font-sans flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1C1A17]" />
                      선택 기간 배출 실적 vs 목표 가이드라인 비교 분석
                    </h4>
                    <p className="text-[11px] text-[#78716C] mt-0.5">실제 누적 배출량과 허용 가이드라인(목표 배출량) 간의 성과 격차를 비교 분석합니다.</p>
                  </div>
                  
                  {/* 요약 임팩트 텍스트 */}
                  <div className="text-right font-sans shrink-0">
                    {periodStats.actualTotal > periodStats.targetTotal ? (
                      <div className="bg-[#FEF2F2] border border-[#FECACA] px-3 py-1 rounded-none">
                        <span className="text-[9px] text-[#991B1B] block uppercase tracking-wider font-bold leading-none">가이드라인 초과</span>
                        <span className="text-base font-bold text-[#991B1B] font-mono leading-none block mt-0.5 font-bold">
                          +{formatVal(periodStats.targetTotal > 0 ? ((periodStats.actualTotal - periodStats.targetTotal) / periodStats.targetTotal) * 100 : 0, 1)}%
                        </span>
                      </div>
                    ) : (
                      <div className="bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-1 rounded-none">
                        <span className="text-[9px] text-[#15803D] block uppercase tracking-wider font-bold leading-none">가이드라인 준수</span>
                        <span className="text-base font-bold text-[#15803D] font-mono leading-none block mt-0.5 font-bold">
                          -{formatVal(periodStats.targetTotal > 0 ? ((periodStats.targetTotal - periodStats.actualTotal) / periodStats.targetTotal) * 100 : 0, 1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Horizontal Visual Chart */}
                <div className="space-y-4 font-mono py-4">
                  {/* Actual Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-[#57534E]">
                      <span>실제 배출 실적 (Actual)</span>
                      <span className="font-bold text-[#1C1A17]">{formatVal(periodStats.actualTotal, 2)} t</span>
                    </div>
                    <div className="w-full bg-[#EAE6DD] h-5 rounded-none relative overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          periodStats.actualTotal > periodStats.targetTotal 
                            ? 'bg-[#991B1B]' // Deep red
                            : 'bg-[#15803D]' // Deep green
                        }`}
                        style={{ 
                          width: `${Math.min(100, periodStats.targetTotal > 0 ? (periodStats.actualTotal / Math.max(periodStats.actualTotal, periodStats.targetTotal)) * 100 : 0)}%` 
                        }}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-[9px] font-bold text-white drop-shadow-sm">
                        {formatVal(periodStats.targetTotal > 0 ? (periodStats.actualTotal / periodStats.targetTotal) * 100 : 0, 1)}%
                      </span>
                    </div>
                  </div>

                  {/* Target Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-[#57534E]">
                      <span>목표 가이드라인 (Target)</span>
                      <span className="font-bold text-[#1C1A17]">{formatVal(periodStats.targetTotal, 2)} t</span>
                    </div>
                    <div className="w-full bg-[#EAE6DD] h-5 rounded-none relative overflow-hidden">
                      <div 
                        className="h-full bg-[#57534E] transition-all duration-500"
                        style={{ 
                          width: `${Math.min(100, periodStats.actualTotal > 0 ? (periodStats.targetTotal / Math.max(periodStats.actualTotal, periodStats.targetTotal)) * 100 : 0)}%` 
                        }}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-[9px] font-bold text-white drop-shadow-sm">
                        100%
                      </span>
                    </div>
                  </div>
                </div>
                
                <p className="text-[10px] text-[#78716C] italic leading-tight border-t border-[#1C1A17]/10 pt-2.5">
                  ※ 실제 배출량이 누적 목표 가이드라인(100%)을 준수하는지 점검합니다. 목표치를 초과한 경우 적색 막대로 감축 필요성을 나타냅니다.
                </p>
              </div>
            </div>

            {/* '지정 기간 종합 분석 결과' text box at the very bottom of the section */}
            <div className="p-4 border border-dashed border-[#E5E2D9] text-xs leading-relaxed flex items-start gap-2.5 bg-[#FCFAF7] print-avoid-break">
              <Icon name="info" className="w-5 h-5 text-[#78716C] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#1C1A17] block">지정 기간 종합 분석 결과</span>
                <div className="text-[#57534E] mt-1 space-y-1.5">
                  <p className={`font-semibold ${periodStats.actualTotal > periodStats.targetTotal ? 'text-[#991B1B]' : 'text-[#15803D]'}`}>
                    {periodStats.actualTotal > periodStats.targetTotal ? '✖' : '✔'} 입력된 {periodStats.activeMonthsCount}개월({monthsLabel(periodStats.activeMonthsList)})의 배출량 {formatVal(periodStats.actualTotal, 2)} t은 같은 기간 누적 목표 {formatVal(periodStats.targetTotal, 2)} t보다 {formatVal(Math.abs(periodStats.actualTotal - periodStats.targetTotal), 2)} t({signedPct(pctDiff(periodStats.actualTotal, periodStats.targetTotal))}) {periodStats.actualTotal > periodStats.targetTotal ? '많습니다.' : '적습니다.'}
                  </p>
                  <ul className="text-[11px] list-disc pl-4 space-y-0.5 font-mono">
                    <li>Scope 1: 실적 {formatVal(periodStats.actualScope1, 2)} t / 목표 {formatVal(periodStats.targetScope1, 2)} t ({signedPct(pctDiff(periodStats.actualScope1, periodStats.targetScope1))})</li>
                    <li>Scope 2: 실적 {formatVal(periodStats.actualScope2, 2)} t / 목표 {formatVal(periodStats.targetScope2, 2)} t ({signedPct(pctDiff(periodStats.actualScope2, periodStats.targetScope2))})</li>
                  </ul>
                  <p className="text-[11px] text-[#78716C]">Scope별로 증감 방향이 다를 수 있어 합계만으로 판단하지 말고 위 항목을 함께 확인하세요.</p>
                  {fromMonth === 1 && toMonth === 12 && forecast && !forecast.complete && (
                    <p className="text-[11px] text-[#57534E]">
                      계절 보정 연말 예상(참고용 추정): {formatVal(forecast.total, 2)} t · 연간 목표 {formatVal(annualTarget.total, 2)} t 대비 {signedPct(pctDiff(forecast.total, annualTarget.total))}
                      <span className="block text-[#78716C]">기준: {forecast.basisLabel}. 실적이 아닌 추정값입니다.</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="py-12 text-center bg-[#FAF9F6] border border-dashed border-[#E5E2D9] flex flex-col items-center justify-center space-y-4">
            <Icon name="alert" className="w-8 h-8 text-[#78716C]" />
            <p className="text-[#1C1A17] font-bold text-sm">{selectedYear}년 {fromMonth}월 ~ {toMonth}월 기간의 실적 보고서가 아직 입력되지 않았습니다.</p>
            <button
              onClick={onNavigateToEntry}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-[#1C1A17] hover:bg-[#2C2A27] text-white text-xs font-bold tracking-wider uppercase transition-all cursor-pointer"
            >
              <Icon name="plus" className="w-4 h-4" /> 실적 입력 바로가기
            </button>
          </div>
        )}
      </div>

      {/* Details & Live calculations */}
      {/* NOTE: avoid-break is intentionally NOT on this whole wrapper —
          it's applied per-card inside renderMetricRow instead, so the
          4 cards can flow across a page break without leaving a big
          blank gap, while no single card ever splits in half. */}
      {periodStats.activeMonthsCount > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm sm:text-base font-bold text-[#1C1A17] tracking-widest uppercase font-mono flex items-center gap-2">
            <Icon name="trend" className="w-5 h-5 text-[#1C1A17]" />
            에너지 자원별 세부 KPI 분석 및 누출 관리 ({fromMonth}월 ~ {toMonth}월 누적)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 print:grid-cols-2 gap-4">
            {renderMetricRow('경유 (Scope 1)', <Icon name="flame" className="w-4 h-4" />, periodStats.actualDiesel, periodStats.targetDiesel, 'L', getFactors(selectedYear).diesel)}
            {renderMetricRow('도시가스 (Scope 1)', <Icon name="flame" className="w-4 h-4" />, periodStats.actualCityGas, periodStats.targetCityGas, 'Nm³', getFactors(selectedYear).cityGas)}
            {renderMetricRow('구매전력 (Scope 2)', <Icon name="zap" className="w-4 h-4" />, periodStats.actualElectricity, periodStats.targetElectricity, 'kWh', getFactors(selectedYear).electricity)}
            {renderMetricRow('용수/수도 (전사제외)', <Icon name="droplet" className="w-4 h-4" />, periodStats.actualWater, periodStats.targetWater, 'TON', getFactors(selectedYear).water)}
          </div>
        </div>
      )}

      {/* Graphical Trends */}
      {/* Same fix as above: block instead of grid for print so Chromium's
          pagination engine doesn't leave a blank gap before this section. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 print:grid-cols-1 print-stack gap-8 print:space-y-4">
        <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm print-avoid-break">
          <h3 className="text-base sm:text-lg print:text-sm font-bold text-[#1C1A17] flex items-center gap-2 font-display mb-4 print:mb-2 border-b pb-3 print:pb-1.5 border-[#FAF9F6]">
            <Icon name="layers" className="w-4 h-4 text-[#1C1A17]" />
            {selectedYear}년 {fromMonth}월 ~ {toMonth}월 월별 목표 대비 실제 총 온실가스 배출량 추이
          </h3>
          <MonthlyEmissionsChart data={chartData1} />
          <div className="flex flex-wrap gap-4 text-[10px] font-mono mt-4 print:mt-2 justify-center">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#D97706]" />실제 Scope 1</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#2563EB]" />실제 Scope 2</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t-2 border-[#DC2626]" />목표 배출량 (t)</span>
          </div>
        </div>

        <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm print-avoid-break">
          <h3 className="text-base sm:text-lg print:text-sm font-bold text-[#1C1A17] flex items-center gap-2 font-display mb-4 print:mb-2 border-b pb-3 print:pb-1.5 border-[#FAF9F6]">
            <Icon name="coins" className="w-4 h-4 text-[#1C1A17]" />
            {selectedYear}년 {fromMonth}월 ~ {toMonth}월 월별 매출액 대비 배출량(원단위) 추이
          </h3>
          <RevenueIntensityChart data={chartData2} />
          <div className="flex flex-wrap gap-4 text-[10px] font-mono mt-4 print:mt-2 justify-center">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#EAE6DD]" />월별 매출액 (억원)</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t-2 border-[#10B981]" />배출 원단위 (tCO₂e/억원)</span>
          </div>
        </div>
      </div>

      {/* Raw Data Table Section */}
      <div className="bg-white border border-[#1C1A17]/15 p-6 shadow-sm">
        {/* print-keep-with-next: without this, the heading+description
            can get stranded alone at the bottom of a page while the
            actual table starts fresh on the next page. This forces
            them to move to the next page together instead. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#FAF9F6] print-keep-with-next">
          <div>
            <h3 className="text-lg font-bold text-[#1C1A17] flex items-center gap-2 font-display">
              <Icon name="database" className="w-4 h-4 text-[#1C1A17]" />
              {selectedYear}년 월별 로우데이터(Raw Data) 세부 이력
            </h3>
            <p className="text-xs text-[#57534E] mt-0.5">
              선택한 연도의 1월부터 12월까지 입력된 실제 원본 사용량 데이터와 계산된 탄소배출량 및 매출 원단위 정보를 확인할 수 있습니다. (선택된 조회 기간 {fromMonth}월 ~ {toMonth}월은 밝은 배경색으로 강조 표시됩니다.)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#1C1A17]/10 w-full max-w-full">
          <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
            </colgroup>
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
                const actualEm = record ? calculateEmissions(record.diesel, record.cityGas, record.electricity, selectedYear) : null;
                const intensity = record && record.revenue > 0 && actualEm ? (actualEm.total / record.revenue) : null;
                const isActive = monthNum >= fromMonth && monthNum <= toMonth;

                return (
                  <tr key={monthNum} className={`hover:bg-[#FAF9F6] transition-colors ${isActive ? 'bg-[#FCFAF7] font-medium' : 'bg-white opacity-60'}`}>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center font-bold whitespace-nowrap">
                      {selectedYear}년 {monthNum}월 {isActive && <span className="ml-1 text-[9px] bg-[#15803D]/10 text-[#15803D] px-1 py-0.5 font-sans font-bold uppercase rounded-sm">선택</span>}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? formatVal(record.diesel, 0) : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? formatVal(record.cityGas, 0) : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? formatVal(record.electricity, 0) : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record ? formatVal(record.water, 0) : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                      {record && record.revenue !== null && record.revenue !== undefined ? formatVal(record.revenue, 0) : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono font-bold text-[#1E40AF]">
                      {actualEm ? formatVal(actualEm.total, 2) : '-'}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-right font-mono font-bold text-[#15803D]">
                      {intensity !== null ? formatVal(intensity, 3) : '-'}
                    </td>
                  </tr>
                );
              })}

              {/* 선택 기간 합계 / 평균 */}
              <tr className="bg-[#EAE6DD] font-bold text-[#1C1A17] border-t-2 border-[#1C1A17]/30">
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center whitespace-nowrap">
                  선택 기간 합계 / 평균 ({fromMonth}월~{toMonth}월)
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {periodStats.activeMonthsCount > 0 ? formatVal(periodStats.actualDiesel, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {periodStats.activeMonthsCount > 0 ? formatVal(periodStats.actualCityGas, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {periodStats.activeMonthsCount > 0 ? formatVal(periodStats.actualElectricity, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {periodStats.activeMonthsCount > 0 ? formatVal(periodStats.actualWater, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {periodStats.activeMonthsCount > 0 ? formatVal(periodStats.actualRevenue, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono text-[#1E40AF]">
                  {periodStats.activeMonthsCount > 0 ? formatVal(periodStats.actualTotal, 2) : '0.00'}
                </td>
                <td className="py-3 px-2 sm:px-3 text-right font-mono text-[#15803D]">
                  {periodStats.activeMonthsCount > 0 && periodStats.intensity > 0 ? formatVal(periodStats.intensity, 3) : '-'}
                </td>
              </tr>

              {/* 연도계 (1~12월 전체 합계/평균) */}
              <tr className="bg-[#F2EFE9] font-bold text-[#1C1A17] border-t border-[#1C1A17]/20">
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center whitespace-nowrap">
                  연도계 (1~12월 전체)
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.diesel, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.cityGas, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.electricity, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.water, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.revenue, 0) : '0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono text-[#1E40AF]">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.emissions, 2) : '0.00'}
                </td>
                <td className="py-3 px-2 sm:px-3 text-right font-mono text-[#15803D]">
                  {yearStats.activeMonths > 0 && yearStats.intensity > 0 ? formatVal(yearStats.intensity, 3) : '-'}
                </td>
              </tr>

              {/* 에너지 환산 합계 (MWh) */}
              <tr className="bg-[#F5F5F4] font-bold text-[#1C1A17] border-t border-[#1C1A17]/15">
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center font-bold whitespace-nowrap">
                  에너지 환산 합계 (MWh)
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.diesel * 0.009444, 1) : '0.0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.cityGas * 0.011046, 1) : '0.0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-right font-mono">
                  {yearStats.activeMonths > 0 ? formatVal(yearStats.electricity * 0.001, 1) : '0.0'}
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center font-mono text-[#57534E]">
                  -
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center font-mono text-[#57534E]">
                  -
                </td>
                <td className="py-3 px-2 sm:px-3 border-r border-[#1C1A17]/10 text-center font-mono text-[#57534E]">
                  -
                </td>
                <td className="py-3 px-2 sm:px-3 text-center font-mono text-[#57534E]">
                  -
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Official Footer with Signatures & Real-time Date Time (Only visible when printing / PDF) */}
      <div className="hidden print:block mt-10 pt-6 border-t border-dashed border-[#1C1A17] print-avoid-break">
        <div className="p-4 bg-[#FAF9F6] border border-[#1C1A17]/20 text-xs leading-relaxed space-y-2">
          <p className="font-bold text-[#1C1A17] flex items-center gap-1.5">
            ✔ 본 보고서는 (주)대성스틸 온실가스 인벤토리 시스템에 의해 산정된 공식 데이터입니다.
          </p>
          <p className="text-[#57534E]">
            본 온실가스 명세서는 환경부 '온실가스·에너지 목표관리제 운영지침' 및 '온실가스 배출권거래제의 계획기간별 배출량 산정 가이드라인'에 준거하여 산정되었으며, 외부 제3자 검증 및 공식 제출용 증빙 자료로서 법적 실효성 및 신뢰도를 보증합니다.
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-8 mt-8 text-xs font-mono">
          <div className="space-y-3">
            <div>
              <span className="text-[#78716C] inline-block w-20">출력 일시:</span>
              <span className="text-[#1C1A17] font-semibold">{printDate}</span>
            </div>
            <div>
              <span className="text-[#78716C] inline-block w-20">출력 부서:</span>
              <span className="text-[#1C1A17] font-semibold">(주)대성스틸 안전환경본부</span>
            </div>
            <div>
              <span className="text-[#78716C] inline-block w-20">데이터 출처:</span>
              <span className="text-[#1C1A17] font-semibold">Daesung Steel GHG Inventory Engine v1.2</span>
            </div>
          </div>
          
          <div className="flex flex-col justify-end items-end space-y-8 pr-4">
            <div className="flex items-center gap-8">
              <span className="text-[#57534E] font-sans font-semibold">작성 담당자:</span>
              <div className="border-b border-[#1C1A17] w-48 text-right pb-1 text-[#78716C] font-sans">
                (서명/인)
              </div>
            </div>
            <div className="flex items-center gap-8">
              <span className="text-[#57534E] font-sans font-semibold">환경 관리 책임자:</span>
              <div className="border-b border-[#1C1A17] w-48 text-right pb-1 text-[#78716C] font-sans">
                (서명/인)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print guidance modal for Iframe environments */}
      {showPrintNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1A17]/80 backdrop-blur-sm print:hidden">
          <div className="bg-white border border-[#1C1A17]/20 p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setShowPrintNotice(false)}
              className="absolute top-4 right-4 text-[#78716C] hover:text-[#1C1A17] transition-colors cursor-pointer text-lg font-bold"
            >
              &times;
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#15803D]/10 flex items-center justify-center text-[#15803D]">
                <Icon name="print" className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#1C1A17] font-display">보고서 인쇄 및 PDF 저장 안내</h3>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-[#57534E] leading-relaxed mb-6">
              <p>
                [보고서 출력]은 브라우저의 인쇄 창을 엽니다. 인쇄 대상(프린터)에서 <strong>PDF로 저장</strong>을 선택하면 PDF 파일로 저장할 수 있습니다.
              </p>
              <p className="font-semibold text-[#1C1A17] bg-[#FCFAF7] p-2.5 border-l-4 border-[#15803D]">
                인쇄 창이 열리지 않으면 아래 [새 탭에서 열기]로 대시보드를 새 창에서 연 뒤 [보고서 출력]을 다시 눌러 주세요.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.open(window.location.href, '_blank');
                  setShowPrintNotice(false);
                }}
                className="flex-1 py-2 bg-[#1C1A17] hover:bg-[#2C2A27] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer text-center"
              >
                새 탭에서 열기
              </button>
              <button
                onClick={() => setShowPrintNotice(false)}
                className="px-4 py-2 border border-[#E5E2D9] text-[#57534E] hover:text-[#1C1A17] text-xs sm:text-sm font-semibold transition-all cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

