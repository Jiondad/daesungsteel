/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MonthlyRecord, MonthlyTarget } from './types';
import Dashboard from './components/Dashboard';
import DataEntry from './components/DataEntry';
import Roadmap from './components/Roadmap';
import { TARGETS_2026 } from './constants';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  FileEdit, 
  Compass, 
  Building2, 
  ShieldAlert, 
  TrendingDown, 
  Gauge,
  HelpCircle
} from 'lucide-react';

const LOCAL_STORAGE_KEY = 'daesung_steel_ghg_records';

// Pre-seeded high-fidelity data up to June 2026 (the current month in our local time)
// This populates the dashboards beautifully on the first load so the user has immediate insights
const SEED_RECORDS: MonthlyRecord[] = [
  { id: "2026-01", year: 2026, month: 1, diesel: 95, cityGas: 7400, electricity: 92000, water: 260, revenue: 120 },
  { id: "2026-02", year: 2026, month: 2, diesel: 540, cityGas: 9300, electricity: 96000, water: 410, revenue: 115 },
  { id: "2026-03", year: 2026, month: 3, diesel: 420, cityGas: 8900, electricity: 87000, water: 380, revenue: 130 },
  { id: "2026-04", year: 2026, month: 4, diesel: 710, cityGas: 6100, electricity: 84500, water: 370, revenue: 125 },
  { id: "2026-05", year: 2026, month: 5, diesel: 430, cityGas: 1800, electricity: 67000, water: 230, revenue: 140 },
  { id: "2026-06", year: 2026, month: 6, diesel: 490, cityGas: 950, electricity: 71200, water: 220, revenue: 135 },
];

const LOCAL_STORAGE_TARGETS_KEY = 'daesung_steel_ghg_targets';

export default function App() {
  const [records, setRecords] = useState<MonthlyRecord[]>([]);
  const [targets, setTargets] = useState<Record<number, MonthlyTarget[]>>({});
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entry' | 'roadmap'>('dashboard');

  // Initialize and load from local storage (or seed if empty)
  useEffect(() => {
    const savedTargets = localStorage.getItem(LOCAL_STORAGE_TARGETS_KEY);
    if (savedTargets) {
      try {
        setTargets(JSON.parse(savedTargets));
      } catch (e) {
        console.error('Error parsing local storage targets', e);
        const defaultTargets = {
          2026: TARGETS_2026,
          2025: TARGETS_2026.map(t => ({ ...t })),
          2024: TARGETS_2026.map(t => ({ ...t })),
        };
        setTargets(defaultTargets);
        localStorage.setItem(LOCAL_STORAGE_TARGETS_KEY, JSON.stringify(defaultTargets));
      }
    } else {
      const defaultTargets = {
        2026: TARGETS_2026,
        2025: TARGETS_2026.map(t => ({ ...t })),
        2024: TARGETS_2026.map(t => ({ ...t })),
      };
      setTargets(defaultTargets);
      localStorage.setItem(LOCAL_STORAGE_TARGETS_KEY, JSON.stringify(defaultTargets));
    }

    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized = parsed.map((r: any) => ({
          ...r,
          revenue: typeof r.revenue === 'number' && !isNaN(r.revenue) ? r.revenue : 120, // default 120 억원
        }));
        setRecords(sanitized);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
      } catch (e) {
        console.error('Error parsing local storage data, resetting with seeds', e);
        setRecords(SEED_RECORDS);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(SEED_RECORDS));
      }
    } else {
      // Seed with initial high-fidelity data
      setRecords(SEED_RECORDS);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(SEED_RECORDS));
    }
  }, []);

  // Save or update record
  const handleSaveRecord = (record: MonthlyRecord) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      let updated: MonthlyRecord[];
      if (idx > -1) {
        updated = [...prev];
        updated[idx] = record;
      } else {
        updated = [...prev, record];
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Save or update multiple records at once
  const handleSaveRecords = (newRecords: MonthlyRecord[]) => {
    setRecords((prev) => {
      const recordMap = new Map(prev.map(r => [r.id, r]));
      newRecords.forEach(record => {
        recordMap.set(record.id, record);
      });
      const updated = Array.from(recordMap.values());
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Save or update targets for a specific year
  const handleSaveTargets = (year: number, yearTargets: MonthlyTarget[]) => {
    setTargets((prev) => {
      const updated = {
        ...prev,
        [year]: yearTargets,
      };
      localStorage.setItem(LOCAL_STORAGE_TARGETS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Delete record
  const handleDeleteRecord = (id: string) => {
    if (window.confirm('정말로 이 월별 실적 기록을 삭제하시겠습니까? 관련 탄소 배출 데이터가 영구 삭제됩니다.')) {
      setRecords((prev) => {
        const updated = prev.filter((r) => r.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1A17] flex flex-col font-sans selection:bg-[#E5E2D9] selection:text-[#1C1A17]">
      
      {/* Dynamic Top Announcement Strip */}
      <div className="bg-[#1C1A17] border-b border-[#2C2A27] px-4 py-2.5 text-center text-xs text-[#E5E2D9] font-mono flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse inline-block" />
        <span className="tracking-wide">ANNUAL REPORT: 2026년 대성스틸 국가 온실가스 의무 감축 로드맵 준수 실적 평가 가동 중</span>
      </div>

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-50 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-[#E5E2D9] px-4 sm:px-6 lg:px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo Brand Panel */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#1C1A17] rounded-none border border-[#1C1A17] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#FAF9F6]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[#1C1A17] font-display">
                  (주)대성스틸
                </h1>
                <span className="text-[10px] bg-[#15803D]/10 text-[#15803D] border border-[#15803D]/20 px-2 py-0.5 rounded-none font-semibold tracking-wider uppercase font-mono">
                  ESG LEADERSHIP
                </span>
              </div>
              <p className="text-xs text-[#57534E] font-mono uppercase tracking-wider mt-0.5">Greenhouse Gas Management Portal &mdash; 2026</p>
            </div>
          </div>

          {/* Navigation Control Tabs */}
          <nav className="flex bg-[#F2EFE9] p-1 border border-[#E5E2D9] gap-1 text-sm font-medium">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 transition-all duration-200 cursor-pointer font-serif ${
                activeTab === 'dashboard'
                  ? 'bg-[#1C1A17] text-[#FAF9F6] font-medium'
                  : 'text-[#57534E] hover:text-[#1C1A17] hover:bg-[#EAE6DD]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              대시보드
            </button>
            <button
              onClick={() => setActiveTab('entry')}
              className={`flex items-center gap-2 px-4 py-2 transition-all duration-200 cursor-pointer font-serif ${
                activeTab === 'entry'
                  ? 'bg-[#1C1A17] text-[#FAF9F6] font-medium'
                  : 'text-[#57534E] hover:text-[#1C1A17] hover:bg-[#EAE6DD]'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              실적 입력
            </button>
            <button
              onClick={() => setActiveTab('roadmap')}
              className={`flex items-center gap-2 px-4 py-2 transition-all duration-200 cursor-pointer font-serif ${
                activeTab === 'roadmap'
                  ? 'bg-[#1C1A17] text-[#FAF9F6] font-medium'
                  : 'text-[#57534E] hover:text-[#1C1A17] hover:bg-[#EAE6DD]'
              }`}
            >
              <Compass className="w-4 h-4" />
              로드맵 시뮬레이터
            </button>
          </nav>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="w-full"
          >
            {activeTab === 'dashboard' && (
              <Dashboard 
                records={records} 
                onNavigateToEntry={() => setActiveTab('entry')} 
                targets={targets}
              />
            )}
            {activeTab === 'entry' && (
              <DataEntry
                records={records}
                onSaveRecords={handleSaveRecords}
                onDeleteRecord={handleDeleteRecord}
                targets={targets}
                onSaveTargets={handleSaveTargets}
              />
            )}
            {activeTab === 'roadmap' && (
              <Roadmap records={records} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Disclaimer Panel */}
      <footer className="bg-[#F5F2EB] border-t border-[#E5E2D9] py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-[#57534E] font-mono">
          <div className="flex items-center gap-1.5 justify-center md:justify-start">
            <ShieldAlert className="w-4 h-4 text-[#78716C]" />
            <span>본 시스템은 대한민국 환경부 온실가스 배출 계수 검증 표준에 따라 완벽하게 구현되었습니다.</span>
          </div>
          <div>
            <span>© 2026 (주)대성스틸 ESG 탄소 관리국. All rights reserved.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
