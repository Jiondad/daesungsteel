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
    donutGrad.addColorStop(0, '#10B981'); // Emerald Mint
    donutGrad.addColorStop(1, '#059669'); // Dark Green Mint

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
        <span className="text-2xl font-black text-[#1C1A17] font-mono leading-none">{rate.toFixed(1)}%</span>
        <span className="text-[10px] text-[#78716C] font-bold uppercase tracking-wider mt-1.5">of target</span>
      </div>
    </div>
  );
};

