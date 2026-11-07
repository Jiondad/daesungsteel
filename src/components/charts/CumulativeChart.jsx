import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { formatVal } from '../../lib/emissions';
import { CHART_COLORS as C } from './chartColors';

// 누적 목표 경로(점선) vs 누적 실적(실선). 실적 곡선이 목표 곡선 위에 있으면 목표 초과 상태.
export const CumulativeChart = ({ data }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    const ctx = canvasRef.current.getContext('2d');

    const endLabels = {
      id: 'cumEndLabels',
      afterDatasetsDraw(chart) {
        const c = chart.ctx;
        c.save();
        c.font = 'bold 12px "JetBrains Mono", monospace';
        c.textBaseline = 'bottom';
        c.textAlign = 'right';
        const lastActual = [...data].reverse().find((d) => d.actualCum !== null);
        if (lastActual) {
          const idx = data.indexOf(lastActual);
          const el = chart.getDatasetMeta(1).data[idx];
          if (el) {
            c.fillStyle = C.actualLine;
            c.fillText(`${formatVal(lastActual.actualCum, 1)} t`, el.x - 4, el.y - 8);
          }
        }
        const lastTarget = data[data.length - 1];
        const tEl = chart.getDatasetMeta(0).data[data.length - 1];
        if (lastTarget && tEl) {
          c.fillStyle = C.targetLine;
          c.textBaseline = 'top';
          c.fillText(`${formatVal(lastTarget.targetCum, 1)} t`, tEl.x - 4, tEl.y + 8);
        }
        c.restore();
      },
    };

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      plugins: [endLabels],
      data: {
        labels: data.map((d) => `${d.month}월`),
        datasets: [
          {
            label: '누적 목표',
            data: data.map((d) => d.targetCum),
            borderColor: C.targetLine,
            backgroundColor: C.targetLine,
            borderWidth: 2.5,
            borderDash: [7, 5],
            pointRadius: 3,
            tension: 0,
            order: 2,
          },
          {
            label: '누적 실적',
            data: data.map((d) => d.actualCum),
            borderColor: C.actualLine,
            backgroundColor: C.actualLine,
            borderWidth: 3.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            spanGaps: false,
            tension: 0,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 12, right: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1C1A17',
            titleFont: { family: 'Noto Sans KR', size: 13, weight: 'bold' },
            bodyFont: { family: 'Noto Sans KR', size: 12 },
            padding: 10,
            cornerRadius: 4,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${formatVal(item.raw, 2)} t`,
              afterBody: (items) => {
                const d = data[items[0].dataIndex];
                if (d.actualCum === null) return ['실적 미입력'];
                const diff = d.actualCum - d.targetCum;
                return [`누적 차이: ${diff >= 0 ? '+' : '−'}${formatVal(Math.abs(diff), 2)} t (${diff > 0 ? '목표 초과' : '목표 이내'})`];
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
            beginAtZero: true,
            grid: { color: C.grid },
            ticks: { font: { family: 'JetBrains Mono', size: 11 }, color: C.axisText },
            title: { display: true, text: '누적 tCO₂e', font: { family: 'Noto Sans KR', size: 12 }, color: C.axisText },
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
  }, [data]);

  return <div className="h-80 w-full print:h-44 print-avoid-break"><canvas ref={canvasRef} /></div>;
};
