import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { formatVal } from '../../lib/emissions';

export const RevenueIntensityChart = ({ data }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');

    // 매출액 은은한 그라디언트
    const revGrad = ctx.createLinearGradient(0, 0, 0, 300);
    revGrad.addColorStop(0, '#F5F5F4'); // warm light gray
    revGrad.addColorStop(1, '#D6D3D1'); // stone 300

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => `${d.month}월`),
        datasets: [
          {
            label: '월별 매출액 (억원)',
            data: data.map(d => d.revenue),
            backgroundColor: revGrad,
            borderRadius: 4,
            yAxisID: 'y',
            order: 2
          },
          {
            label: '배출 원단위 (t/억원)',
            data: data.map(d => d.intensity),
            borderColor: '#10B981',
            borderWidth: 3,
            type: 'line',
            fill: false,
            tension: 0.15,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#10B981',
            pointBorderWidth: 2.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            yAxisID: 'y1',
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
                if (context.datasetIndex === 0) {
                  return ` ${context.dataset.label}: ${formatVal(context.raw, 2)} 억원`;
                }
                return ` ${context.dataset.label}: ${formatVal(context.raw, 3)} t/억원`;
              }
            }
          }
        },
        scales: {
          x: {
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
            position: 'left',
            grid: {
              color: '#EAE6DD',
              borderDash: [4, 4],
              drawTicks: false
            },
            ticks: {
              font: { family: 'JetBrains Mono', size: 11 }
            },
            title: { display: true, text: '매출액 (억원)', font: { family: 'Noto Sans KR', size: 11 } },
            border: { display: false }
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              font: { family: 'JetBrains Mono', size: 11 }
            },
            title: { display: true, text: '배출 원단위 (t/억원)', font: { family: 'Noto Sans KR', size: 11 } },
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

