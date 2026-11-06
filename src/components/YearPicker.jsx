import { useEffect, useRef, useState } from 'react';

// --- MAIN DASHBOARD COMPONENT ---
// --- 달력형 연도 선택기 (드롭다운 대체) ---
// 12개 연도를 3×4 달력 격자로 보여주고, 등록된 연도만 선택 가능. 바깥 클릭/Esc로 닫힘.
export const YearPicker = ({ value, years = [], onChange, ariaLabel = '연도 선택' }) => {
  const [open, setOpen] = useState(false);
  const [pageStart, setPageStart] = useState(Number(value) - 5);
  const wrapRef = useRef(null);
  const thisYear = new Date().getFullYear();
  const registered = new Set((years || []).map(Number));

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setPageStart(Number(value) - 5);
    setOpen(o => !o);
  };

  const cells = Array.from({ length: 12 }, (_, i) => pageStart + i);

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="h-9 flex items-center gap-2 bg-[#FAF9F6] border border-[#E5E2D9] hover:border-[#1C1A17]/40 px-3 text-xs sm:text-sm font-mono cursor-pointer focus:outline-none focus:border-[#1C1A17]"
      >
        <svg className="w-3.5 h-3.5 text-[#57534E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span className="font-bold">{value}년</span>
        <svg className={`w-3 h-3 text-[#78716C] transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div role="dialog" aria-label={ariaLabel} className="absolute left-0 top-full mt-1 z-50 w-60 bg-white border border-[#1C1A17]/20 shadow-lg p-3 print:hidden">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setPageStart(p => p - 12)} aria-label="이전 연도 범위"
              className="w-7 h-7 flex items-center justify-center hover:bg-[#F2EFE9] cursor-pointer text-[#57534E] font-bold">&lsaquo;</button>
            <span className="text-xs font-bold font-mono text-[#1C1A17]">{pageStart} – {pageStart + 11}</span>
            <button type="button" onClick={() => setPageStart(p => p + 12)} aria-label="다음 연도 범위"
              className="w-7 h-7 flex items-center justify-center hover:bg-[#F2EFE9] cursor-pointer text-[#57534E] font-bold">&rsaquo;</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {cells.map(y => {
              const enabled = registered.size === 0 || registered.has(y);
              const selected = Number(value) === y;
              return (
                <button
                  key={y}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={selected}
                  title={enabled ? `${y}년 선택` : '등록되지 않은 연도입니다. [+ 새 연도 등록]으로 추가하세요.'}
                  onClick={() => { onChange(y); setOpen(false); }}
                  className={`h-9 text-xs font-mono border transition-colors ${
                    selected
                      ? 'bg-[#1C1A17] text-[#FAF9F6] border-[#1C1A17] font-bold'
                      : enabled
                        ? 'bg-[#FAF9F6] text-[#1C1A17] border-[#E5E2D9] hover:border-[#1C1A17] cursor-pointer'
                        : 'bg-white text-[#D6D3D1] border-[#F2EFE9] cursor-not-allowed'
                  } ${y === thisYear && !selected ? 'ring-1 ring-[#15803D]' : ''}`}
                >
                  {y}
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-[#F2EFE9] text-[10px] text-[#78716C] leading-relaxed">
            회색 연도는 등록되지 않은 연도입니다. 연한 초록 테두리는 올해입니다.
          </div>
        </div>
      )}
    </div>
  );
};

