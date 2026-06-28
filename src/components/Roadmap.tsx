/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { MonthlyRecord } from '../types';
import { ROADMAP_TARGETS, calculateEmissions } from '../constants';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Scatter
} from 'recharts';
import { 
  Compass, 
  Settings2, 
  HelpCircle, 
  Zap, 
  Flame, 
  Leaf, 
  ArrowRight,
  TrendingDown,
  Sparkles
} from 'lucide-react';

interface RoadmapProps {
  records: MonthlyRecord[];
}

export default function Roadmap({ records }: RoadmapProps) {
  // Simulator state levers
  const [solarRate, setSolarRate] = useState<number>(0);         // RE100 Solar adoption (reduces electricity by up to 40%)
  const [burnerEfficiency, setBurnerEfficiency] = useState<number>(0); // Gas efficiency upgrades (reduces gas by up to 25%)
  const [evTransition, setEvTransition] = useState<number>(0);   // EV Fleet transition (reduces diesel by up to 70%)

  // 1. Group actual records by year to calculate actual totals
  const actualAnnualEmissions = useMemo(() => {
    const sums: { [year: number]: { total: number; months: number } } = {};
    
    records.forEach(r => {
      const em = calculateEmissions(r.diesel, r.cityGas, r.electricity);
      if (!sums[r.year]) {
        sums[r.year] = { total: 0, months: 0 };
      }
      sums[r.year].total += em.total;
      sums[r.year].months += 1;
    });

    // We only project full years or annualize partial years if helpful
    // Let's annualize only if months > 0. For realistic display, if it's 2026 (current), we can extrapolate or show cumulative.
    // Let's extrapolate the current year if it's incomplete to give a realistic comparison!
    return Object.keys(sums).map(yrStr => {
      const yr = parseInt(yrStr);
      const data = sums[yr];
      let total = data.total;
      
      // If incomplete year (e.g. less than 12 months), extrapolate for the roadmap chart
      const isExtrapolated = data.months < 12;
      if (isExtrapolated && data.months > 0) {
        total = (data.total / data.months) * 12;
      }

      return {
        year: yr,
        actual: parseFloat(total.toFixed(3)),
        monthsCount: data.months,
        isExtrapolated
      };
    });
  }, [records]);

  // 2. Calculate the baseline future projection values
  // We'll use 2025 baseline values (Scope 1: 92.720, Scope 2: 486.396) as our starter reference for future projection
  const simulatedData = useMemo(() => {
    const baseScope1Gas = 80.0;     // estimated gas portion of 2025 S1
    const baseScope1Diesel = 12.720; // estimated diesel portion of 2025 S1
    const baseScope2Elec = 486.396;  // estimated electricity 2025 S2

    // Apply simulation levers:
    // Solar Rate (0-100%) reduces Scope 2 Electricity by up to 45% (RE100 impact)
    const s2Reduction = baseScope2Elec * (solarRate / 100) * 0.45;
    const simScope2 = baseScope2Elec - s2Reduction;

    // Burner Efficiency (0-100%) reduces Scope 1 Gas by up to 25%
    const gasReduction = baseScope1Gas * (burnerEfficiency / 100) * 0.25;
    const simScope1Gas = baseScope1Gas - gasReduction;

    // EV Transition (0-100%) reduces Diesel by up to 80% (with a small 5% increase in electricity)
    const dieselReduction = baseScope1Diesel * (evTransition / 100) * 0.80;
    const simScope1Diesel = baseScope1Diesel - dieselReduction;
    
    // EV increases electricity slightly
    const evElecAddition = baseScope1Diesel * (evTransition / 100) * 0.10; // 10% equivalent added to elec
    const finalScope2 = simScope2 + evElecAddition;
    const finalScope1 = simScope1Gas + simScope1Diesel;
    const finalTotal = finalScope1 + finalScope2;

    return {
      scope1: finalScope1,
      scope2: finalScope2,
      total: finalTotal
    };
  }, [solarRate, burnerEfficiency, evTransition]);

  // 3. Prepare the Recharts coordinate array (2025 ~ 2030)
  const chartData = useMemo(() => {
    return ROADMAP_TARGETS.map(targetPoint => {
      const year = targetPoint.year;
      
      // Look up actual emissions for this year
      const actualPt = actualAnnualEmissions.find(a => a.year === year);
      
      // Look up simulated projection path:
      // For 2025, it's baseline. For 2026, it's partially simulated or actual.
      // From 2027 onwards, we fully project based on the simulator!
      let projectionValue: number | null = null;
      if (year === 2025) {
        projectionValue = 579.116;
      } else if (year === 2026) {
        // Linear bridge or simulation
        projectionValue = parseFloat((579.116 - (579.116 - simulatedData.total) * 0.2).toFixed(3));
      } else {
        // Progressively reach full simulation setting by 2030
        const factor = (year - 2026) / 4; // 2027=0.25, 2028=0.5, 2029=0.75, 2030=1.0
        const simPathVal = 579.116 - (579.116 - simulatedData.total) * factor;
        projectionValue = parseFloat(simPathVal.toFixed(3));
      }

      return {
        year: `${year}년`,
        yearNum: year,
        '감축 목표선': targetPoint.target,
        '실제 배출량(연환산)': actualPt ? actualPt.actual : null,
        '시뮬레이션 경로': projectionValue,
        // Helper metadata
        isExtrapolated: actualPt?.isExtrapolated || false,
        monthsCount: actualPt?.monthsCount || 0
      };
    });
  }, [ROADMAP_TARGETS, actualAnnualEmissions, simulatedData]);

  // Target values to show in comparison
  const simulatedYear2030Emissions = simulatedData.total;
  const targetYear2030Emissions = 470.756;
  const isGoalMetIn2030 = simulatedYear2030Emissions <= targetYear2030Emissions;
  const totalReductionAmount = 579.116 - simulatedYear2030Emissions;
  const totalReductionPercent = (totalReductionAmount / 579.116) * 100;

  return (
    <div className="space-y-8">
      
      {/* Title & Introduction Header */}
      <div className="bg-[#F2EFE9] p-5 border border-[#E5E2D9] rounded-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#1C1A17] text-[#FAF9F6] rounded-none">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1C1A17] tracking-tight font-display">
              대성스틸 2030 저탄소 중기 로드맵 & 감축 시뮬레이터
            </h2>
            <p className="text-xs text-[#57534E] mt-0.5 font-sans">환경부 2030 온실가스 감축 목표(NDC) 경로 추종 여부 판단 및 가상 에너지 효율화 시뮬레이션</p>
          </div>
        </div>
        <span className="text-xs bg-white px-3 py-1.5 rounded-none text-[#1C1A17] font-mono border border-[#E5E2D9] font-bold">
          기준 연도: 2025년 (579.116 t)
        </span>
      </div>

      {/* Main Roadmap Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Recharts Graphical Panel */}
        <div className="xl:col-span-2 bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#FAF9F6]">
            <div>
              <h3 className="text-base font-bold text-[#1C1A17] uppercase tracking-wider font-display">
                중기 탄소 저감 가이드라인 vs 실적 모니터링
              </h3>
              <p className="text-xs text-[#57534E] mt-0.5">실선은 연간 타겟이며, 점선은 자발적 설비 개선 적용 시 시뮬레이션 감축 경로입니다.</p>
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-0.5 bg-[#991B1B]" />감축 목표선</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-0.5 bg-[#166534] border-t border-dashed" />시뮬레이션 경로</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-none bg-[#1E40AF] inline-block" />실제 실적 (연환산)
              </span>
            </div>
          </div>

          <div className="h-80 w-full font-mono text-[11px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 15, right: 15, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#FAF9F6" />
                <XAxis dataKey="year" stroke="#78716C" tick={{ fill: '#78716C' }} />
                <YAxis 
                  stroke="#78716C" 
                  domain={[400, 600]}
                  tick={{ fill: '#78716C' }}
                  label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', fill: '#78716C', offset: 10 }} 
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#FAF9F6] border border-[#E5E2D9] rounded-none p-3.5 space-y-2 text-xs font-mono text-[#1C1A17]">
                          <p className="font-bold text-[#1C1A17] border-b border-[#E5E2D9] pb-1 font-serif">{data.year}</p>
                          <p className="text-[#991B1B] font-semibold">목표량: {data['감축 목표선'].toFixed(3)} t</p>
                          {data['시뮬레이션 경로'] && (
                            <p className="text-[#166534] font-semibold">시뮬레이션: {data['시뮬레이션 경로'].toFixed(3)} t</p>
                          )}
                          {data['실제 배출량(연환산)'] !== null && (
                            <div className="text-[#1E40AF] border-t border-[#E5E2D9] pt-1 mt-1 font-semibold">
                              <p>실제실적: {data['실제 배출량(연환산)'].toFixed(3)} t</p>
                              {data.isExtrapolated && (
                                <p className="text-[10px] text-[#78716C] font-sans">({data.monthsCount}개월 기준 연환산)</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ color: '#1C1A17', fontSize: '11px' }} />
                
                {/* Target Path line */}
                <Line 
                  type="monotone" 
                  dataKey="감축 목표선" 
                  stroke="#991B1B" 
                  strokeWidth={2.5} 
                  dot={{ r: 4, fill: '#991B1B' }} 
                  activeDot={{ r: 6 }} 
                />

                {/* Simulation projection path */}
                <Line 
                  type="monotone" 
                  dataKey="시뮬레이션 경로" 
                  stroke="#166534" 
                  strokeWidth={2} 
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#166534' }} 
                  activeDot={{ r: 5 }} 
                />

                {/* Actual Points Scatter */}
                <Scatter
                  dataKey="실제 배출량(연환산)"
                  fill="#1E40AF"
                  line={false}
                  shape="circle"
                  legendType="circle"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#FCFAF7] p-4 border border-[#E5E2D9] text-xs text-[#57534E] leading-relaxed flex items-start gap-2.5">
            <HelpCircle className="w-5 h-5 text-[#78716C] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[#1C1A17] block font-serif">연환산 가중치 적용 안내 (Extrapolation)</span>
              <p className="text-[11px] text-[#57534E] mt-1 leading-relaxed">
                2026년과 같이 아직 12개월 전체가 채워지지 않은 당해 연도의 실제 배출량 포인트는, **[현재까지 입력된 총량 ÷ 입력 개월수 × 12개월]** 공식을 통해 연 단위로 가중 환산하여 시뮬레이터 차트에 임시 점으로 자동 표현됩니다. 연초 실적 입력 시에도 정상적인 비교가 가능하도록 보정해주는 유용한 기법입니다.
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Levers Control panel */}
        <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-[#1C1A17]" />
              <h3 className="text-sm font-bold text-[#1C1A17] uppercase tracking-widest font-mono">
                저탄소 설비 시뮬레이션 레버
              </h3>
            </div>
            <p className="text-xs text-[#57534E] leading-relaxed">
              대성스틸의 미래 저감 기술 도입률을 조정하여 2030년 목표 달성 가능 시나리오를 설계하십시오.
            </p>

            <hr className="border-[#FAF9F6]" />

            {/* Slider 1: Solar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  자가 태양광 발전 (RE100)
                </span>
                <span className="text-[#B45309] font-mono font-bold">{solarRate}% 도입</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={solarRate}
                onChange={(e) => setSolarRate(Number(e.target.value))}
                className="w-full h-1.5 bg-[#EAE6DD] appearance-none cursor-pointer accent-[#1C1A17]"
              />
              <span className="text-[10px] text-[#78716C] block font-sans">설치 면적 비례 전사 구매전력 최대 45% 대체</span>
            </div>

            {/* Slider 2: Gas Efficiency */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                  <Flame className="w-3.5 h-3.5 text-amber-600" />
                  가스 연소설비 효율화 개조
                </span>
                <span className="text-[#B45309] font-mono font-bold">{burnerEfficiency}% 개조</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={burnerEfficiency}
                onChange={(e) => setBurnerEfficiency(Number(e.target.value))}
                className="w-full h-1.5 bg-[#EAE6DD] appearance-none cursor-pointer accent-[#1C1A17]"
              />
              <span className="text-[10px] text-[#78716C] block font-sans">친환경 노즐 및 열교환 시스템 적용 시 가스 사용량 최대 25% 감축</span>
            </div>

            {/* Slider 3: EV Transition */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#1C1A17] font-bold flex items-center gap-1.5 font-serif">
                  <Leaf className="w-3.5 h-3.5 text-teal-600" />
                  전사 차량 및 이송설비 전기화 (EV)
                </span>
                <span className="text-[#15803D] font-mono font-bold">{evTransition}% 전환</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={evTransition}
                onChange={(e) => setEvTransition(Number(e.target.value))}
                className="w-full h-1.5 bg-[#EAE6DD] appearance-none cursor-pointer accent-[#1C1A17]"
              />
              <span className="text-[10px] text-[#78716C] block font-sans">경유 지게차/차량 퇴출로 Scope 1 경유 최대 80% 절감</span>
            </div>
          </div>

          {/* Simulation Outcome Panel */}
          <div className={`p-4 border transition-all rounded-none ${
            isGoalMetIn2030 
              ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#166534]' 
              : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
          }`}>
            <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-widest mb-2.5 font-mono">
              <Sparkles className="w-4 h-4 text-[#1C1A17]" />
              <span>2030년 감축 예측 시나리오 결과</span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-[#1C1A17]/5 pb-1">
                <span className="text-[#78716C]">예측 배출량 (2030):</span>
                <span className="font-bold text-[#1C1A17]">{simulatedYear2030Emissions.toFixed(3)} t</span>
              </div>
              <div className="flex justify-between border-b border-[#1C1A17]/5 pb-1">
                <span className="text-[#78716C]">국가 감축 목표치 (2030):</span>
                <span className="text-[#78716C]">{targetYear2030Emissions.toFixed(3)} t</span>
              </div>
              
              <div className="border-t border-[#1C1A17]/10 my-2 pt-2 flex justify-between items-center text-sm">
                <span className="text-[#1C1A17] font-serif font-bold">목표 달성 여부:</span>
                <span className={`font-bold px-2.5 py-0.5 rounded-none border text-xs ${
                  isGoalMetIn2030 
                    ? 'bg-[#F0FDF4] text-[#166534] border-[#86EFAC]' 
                    : 'bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]'
                }`}>
                  {isGoalMetIn2030 ? '목표 달성 성공' : '감축 역량 부족'}
                </span>
              </div>

              <div className="text-[10px] text-[#57534E] font-sans pt-1 leading-relaxed">
                {isGoalMetIn2030 ? (
                  <span className="text-[#166534] font-medium">✔ 설정된 청정설비 도입률을 유지하면 2030년 정부 NDC 목표선을 안전하게 준수하고 녹색 선도 철강기업으로 자리매김합니다!</span>
                ) : (
                  <span className="text-[#C2410C] font-medium">✖ 2030년 목표치인 470.756 tCO₂e에 도달하려면 추가 설비 투자 또는 구매전력의 RE100 이행 비율을 더 높여야 합니다.</span>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Corporate Mid-term targets table */}
      <div className="bg-white border border-[#1C1A17]/15 rounded-none p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-[#1C1A17] uppercase tracking-widest font-mono flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-[#1C1A17]" />
          대성스틸 연도별 온실가스 저감 국가 제출용 표준 로드맵 타겟 테이블
        </h3>
        <div className="overflow-x-auto border border-[#E5E2D9] bg-[#FCFAF7]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F2EFE9] border-b border-[#E5E2D9] text-[#57534E] uppercase font-mono tracking-wider font-semibold">
                <th className="p-3.5">연도 구분</th>
                <th className="p-3.5">배출 목표총량 (tCO₂e)</th>
                <th className="p-3.5">Scope 1 (직접) 목표</th>
                <th className="p-3.5">Scope 2 (간접) 목표</th>
                <th className="p-3.5">연간 누적 감축 비율</th>
                <th className="p-3.5 text-right">상태 구분</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E2D9] font-mono text-[#1C1A17]">
              {ROADMAP_TARGETS.map((r, idx) => {
                const totalTarget = r.target;
                const reductionFromBaseline = idx === 0 ? 0 : 579.116 - totalTarget;
                const reductionPercent = (reductionFromBaseline / 579.116) * 100;

                return (
                  <tr key={r.year} className={`hover:bg-white transition-colors ${idx === 1 ? 'bg-[#FCFAF7]' : ''}`}>
                    <td className="p-3.5 font-bold text-[#1C1A17] font-serif">{r.label} ({r.year}년)</td>
                    <td className="p-3.5 text-[#1C1A17] font-bold">{totalTarget.toFixed(3)} t</td>
                    <td className="p-3.5 text-[#57534E]">{r.scope1 ? `${r.scope1.toFixed(3)} t` : '탄력적 분배'}</td>
                    <td className="p-3.5 text-[#57534E]">{r.scope2 ? `${r.scope2.toFixed(3)} t` : '탄력적 분배'}</td>
                    <td className="p-3.5">
                      <span className={idx === 0 ? 'text-[#78716C]' : 'text-[#166534] font-bold'}>
                        {idx === 0 ? '기준년도' : `▼ ${reductionPercent.toFixed(2)}%`}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {idx === 0 ? (
                        <span className="px-2.5 py-1 text-[10px] bg-[#FAF9F6] text-[#78716C] border border-[#E5E2D9] uppercase font-bold tracking-wider">Baseline</span>
                      ) : idx === 1 ? (
                        <span className="px-2.5 py-1 text-[10px] bg-[#FEF3C7] text-[#D97706] border border-[#FCD34D] uppercase font-bold tracking-wider">당해 실행 중</span>
                      ) : (
                        <span className="px-2.5 py-1 text-[10px] bg-[#FAF9F6] text-[#78716C] border border-[#E5E2D9] uppercase font-bold tracking-wider">예정 목표</span>
                      )}
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
