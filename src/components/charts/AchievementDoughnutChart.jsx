import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

// --- COOPERATIVE ACHIEVEMENT DOUGHNUT CHART ---
export const AchievementDoughnutChart = ({ actual, target }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    const rate = target > 0 ? (actual / target) * 100 : 0;

    // 은은하고 현대적인 그라디언트 설정
    const donutGrad = ctx.createLinearGradient(0, 0, 0, 150);
    // 목표 초과(100% 초과)면 붉은색, 이내면 초록색으로 표시 — 초과인데 초록색 가득 찬 링으로 보이는 오해 방지
    const over = rate > 100;
    donutGrad.addColorStop(0, over ? '#DC2626' : '#10B981');
    donutGrad.addColorStop(1, over ? '#991B1B' : '#059669');

    chartInstance.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['소진율', '잔여한도'],
        datasets: [{
          data: [Math.min(rate, 100), Math.max(0, 100 - rate)],
          backgroundColor: [donutGrad, '#EAE6DD'],
          borderWidth: 0,
          hoverOffset: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [actual, target]);

  const rate = target > 0 ? (actual / target) * 100 : 0;

  return (
    <div className="relative w-40 h-40 mx-auto">
      <canvas ref={canvasRef} />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className={`text-2xl font-black font-mono leading-none ${rate > 100 ? 'text-[#991B1B]' : 'text-[#1C1A17]'}`}>{rate.toFixed(1)}%</span>
        <span className={`text-[10px] font-bold tracking-wider mt-1.5 ${rate > 100 ? 'text-[#991B1B]' : 'text-[#78716C]'}`}>{rate > 100 ? '목표 초과' : '목표 이내'}</span>
      </div>
    </div>
  );
};

