import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { formatVal } from '../../lib/emissions';

export const RoadmapSimulatorChart = ({ data }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.year),
        datasets: [
          {
            label: '공식 감축 목표',
            data: data.map(d => d.target),
            borderColor: '#B91C1C',
            borderWidth: 3,
            fill: false,
            tension: 0.15,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#B91C1C',
            pointBorderWidth: 2.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            order: 2
          },
          {
            label: '무조치(BAU) 경로',
            data: data.map(d => d.bau),
            borderColor: '#78716C',
            borderWidth: 2,
            borderDash: [2, 4],
            fill: false,
            tension: 0.15,
            pointRadius: 3,
            pointBackgroundColor: '#78716C',
            order: 4
          },
          {
            label: '시나리오 경로',
            data: data.map(d => d.sim),
            borderColor: '#0D9488',
            borderWidth: 2.5,
            borderDash: [5, 5],
            fill: false,
            tension: 0.15,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#0D9488',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            order: 3
          },
          {
            label: '실적 / 연말 예상',
            data: data.map(d => d.actual),
            backgroundColor: '#1D4ED8',
            borderColor: '#1D4ED8',
            borderWidth: 0,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#1D4ED8',
            pointBorderWidth: 3,
            pointStyle: data.map(d => (d.actualIsForecast ? 'triangle' : 'circle')),
            pointRadius: 6,
            pointHoverRadius: 8,
            showLine: false,
            type: 'line',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1C1A17',
            titleFont: { family: 'Noto Sans KR', size: 12, weight: 'bold' },
            bodyFont: { family: 'Noto Sans KR', size: 11 },
            padding: 10,
            cornerRadius: 4,
            displayColors: true,
            callbacks: {
              label: function(context) {
                return ` ${context.dataset.label}: ${formatVal(context.raw, 2)} t`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#FAF9F6', borderDash: [4, 4], drawTicks: false },
            ticks: { font: { family: 'Noto Sans KR', size: 11 } },
            border: { display: false }
          },
          y: {
            grace: '8%',
            grid: { color: '#EAE6DD', borderDash: [4, 4], drawTicks: false },
            ticks: { font: { family: 'JetBrains Mono', size: 11 } },
            title: { display: true, text: 'tCO₂e', font: { family: 'Noto Sans KR', size: 11 } },
            border: { display: false }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data]);

  return <div className="h-80 w-full print:h-44 print-avoid-break"><canvas ref={canvasRef} /></div>;
};

