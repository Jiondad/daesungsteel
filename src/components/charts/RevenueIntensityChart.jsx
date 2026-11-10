import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { formatVal } from '../../lib/emissions';
import { CHART_COLORS as C } from './chartColors';

// 월별 매출액(막대)과 배출 원단위(선). 대비를 높이고 원단위 값을 점 위에 표시하며 평균선을 함께 그린다.
export const RevenueIntensityChart = ({ data, average = null }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    const ctx = canvasRef.current.getContext('2d');

    const pointLabels = {
      id: 'intensityLabels',
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(1);
        if (!meta || !meta.data) return;
        const c = chart.ctx;
        c.save();
        c.font = 'bold 11px "JetBrains Mono", monospace';
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.fillStyle = C.intensity;
        c.lineJoin = 'round';
        c.lineWidth = 3;
        c.strokeStyle = '#FFFFFF';
        data.forEach((d, i) => {
          const el = meta.data[i];
          if (d.intensity === null || d.intensity === undefined || !el) return;
          c.strokeText(formatVal(d.intensity, 3), el.x, el.y - 8);
          c.fillText(formatVal(d.intensity, 3), el.x, el.y - 8);
        });
        c.restore();
      },
    };

    const datasets = [
      {
        label: '월별 매출액 (억원)',
        data: data.map((d) => d.revenue),
        backgroundColor: C.revenueBar,
        borderColor: C.revenueBorder,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: 'y',
        order: 3,
      },
      {
        label: '배출 원단위 (t/억원)',
        data: data.map((d) => d.intensity),
        borderColor: C.intensity,
        backgroundColor: C.intensity,
        borderWidth: 3,
        type: 'line',
        tension: 0,
        spanGaps: false,
        pointRadius: 5,
        pointHoverRadius: 7,
        yAxisID: 'y1',
        order: 1,
      },
    ];
    if (average !== null) {
      datasets.push({
        label: '평균 원단위',
        data: data.map(() => average),
        borderColor: C.intensityAvg,
        borderWidth: 1.5,
        borderDash: [6, 5],
        type: 'line',
        pointRadius: 0,
        yAxisID: 'y1',
        order: 2,
      });
    }

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      plugins: [pointLabels],
      data: { labels: data.map((d) => `${d.month}월`), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1C1A17',
            titleFont: { family: 'Noto Sans KR', size: 13, weight: 'bold' },
            bodyFont: { family: 'Noto Sans KR', size: 12 },
            padding: 10,
            cornerRadius: 4,
            callbacks: {
              label: (item) => {
                if (item.datasetIndex === 0) return ` ${item.dataset.label}: ${formatVal(item.raw, 2)} 억원`;
                return ` ${item.dataset.label}: ${formatVal(item.raw, 3)} t/억원`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Noto Sans KR', size: 12 }, color: C.axisText },
            border: { color: C.grid },
          },
          y: {
            position: 'left',
            beginAtZero: true,
            grid: { color: C.grid },
            ticks: { font: { family: 'JetBrains Mono', size: 11 }, color: C.revenueBorder },
            title: { display: true, text: '매출액 (억원)', font: { family: 'Noto Sans KR', size: 12 }, color: C.revenueBorder },
            border: { display: false },
          },
          y1: {
            position: 'right',
            grace: '20%',
            grid: { drawOnChartArea: false },
            ticks: { font: { family: 'JetBrains Mono', size: 11 }, color: C.intensity },
            title: { display: true, text: '배출 원단위 (t/억원)', font: { family: 'Noto Sans KR', size: 12 }, color: C.intensity },
            border: { display: false },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, average]);

  return <div className="h-80 w-full print:h-44 print-avoid-break"><canvas ref={canvasRef} /></div>;
};
