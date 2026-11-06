import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { formatVal } from '../../lib/emissions';

// --- CHART COMPONENTS USING RAW CHART.JS CANVAS ---
export const MonthlyEmissionsChart = ({ data }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');

    // 은은한 그라디언트 생성
    const scope1Grad = ctx.createLinearGradient(0, 0, 0, 300);
    scope1Grad.addColorStop(0, '#14B8A6'); // Mint Teal
    scope1Grad.addColorStop(1, '#0F766E'); // Deep Teal

    const scope2Grad = ctx.createLinearGradient(0, 0, 0, 300);
    scope2Grad.addColorStop(0, '#60A5FA'); // Light Slate Blue
    scope2Grad.addColorStop(1, '#1E3A8A'); // Slate Blue / Navy

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => `${d.month}월`),
        datasets: [
          {
            label: '실제 Scope 1',
            data: data.map(d => d.scope1),
            backgroundColor: scope1Grad,
            stack: 'actual',
            borderRadius: 4,
            order: 2
          },
          {
            label: '실제 Scope 2',
            data: data.map(d => d.scope2),
            backgroundColor: scope2Grad,
            stack: 'actual',
            borderRadius: 4,
            order: 2
          },
          {
            label: '목표 배출량 (t)',
            data: data.map(d => d.target),
            borderColor: '#DC2626',
            borderWidth: 3,
            type: 'line',
            fill: false,
            tension: 0.15,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#DC2626',
            pointBorderWidth: 2.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
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
            stacked: true,
            grid: {
              color: '#FAF9F6',
              borderDash: [4, 4],
              drawTicks: false
            },
            ticks: {
              font: { family: 'Noto Sans KR', size: 11 }
            },
            border: { display: false }
          },
          y: {
            stacked: true,
            grid: {
              color: '#EAE6DD',
              borderDash: [4, 4],
              drawTicks: false
            },
            ticks: {
              font: { family: 'JetBrains Mono', size: 11 }
            },
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

