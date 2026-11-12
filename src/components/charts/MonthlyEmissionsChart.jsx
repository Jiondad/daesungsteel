import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { formatVal } from '../../lib/emissions';
import { CHART_COLORS as C } from './chartColors';

// 월별 목표(회색 막대) vs 실적(Scope 1+2 누적 막대). 막대 위에 월별 달성률(%)을 표시하고,
// 미입력 월은 0으로 그리지 않고 '미입력'으로 표시한다.
export const MonthlyEmissionsChart = ({ data }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    const ctx = canvasRef.current.getContext('2d');

    const overlay = {
      id: 'monthlyOverlay',
      beforeDatasetsDraw(chart) {
        const { ctx: c, chartArea, scales } = chart;
        if (!chartArea || !scales.x) return;
        const band = chartArea.width / data.length;
        c.save();
        data.forEach((d, i) => {
          if (d.entered) return;
          const x = scales.x.getPixelForValue(i);
          c.fillStyle = 'rgba(231, 229, 228, 0.55)';
          c.fillRect(x - band / 2, chartArea.top, band, chartArea.height);
        });
        c.restore();
      },
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(2); // 실적 Scope 2 = 누적 막대의 맨 위
        if (!meta || !meta.data) return;
        const c = chart.ctx;
        c.save();
        c.font = 'bold 12px "Noto Sans KR", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.lineJoin = 'round';
        c.lineWidth = 3;
        c.strokeStyle = '#FFFFFF';
        // 미입력 월 표시(막대 위가 아니라 그래프 상단에, 흰 테두리로 읽기 쉽게)
        const { chartArea, scales } = chart;
        if (chartArea && scales.x) {
          data.forEach((d, i) => {
            if (d.entered) return;
            const x = scales.x.getPixelForValue(i);
            c.fillStyle = '#57534E';
            c.font = '12px "Noto Sans KR", sans-serif';
            c.textBaseline = 'top';
            c.strokeText('미입력', x, chartArea.top + 6);
            c.fillText('미입력', x, chartArea.top + 6);
          });
        }
        c.font = 'bold 12px "Noto Sans KR", sans-serif';
        c.textBaseline = 'bottom';
        data.forEach((d, i) => {
          const el = meta.data[i];
          if (!d.entered || d.rate === null || !el) return;
          c.fillStyle = d.rate > 100 ? C.over : C.ok;
          c.strokeText(`${formatVal(d.rate, 0)}%`, el.x, el.y - 6);
          c.fillText(`${formatVal(d.rate, 0)}%`, el.x, el.y - 6);
        });
        c.restore();
      },
    };

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      plugins: [overlay],
      data: {
        labels: data.map((d) => `${d.month}월`),
        datasets: [
          {
            label: '월 목표',
            data: data.map((d) => d.target),
            backgroundColor: C.targetBar,
            borderColor: C.targetBarBorder,
            borderWidth: 1,
            stack: 'target',
            barPercentage: 0.9,
            categoryPercentage: 0.8,
            order: 2,
          },
          {
            label: '실적 Scope 1',
            data: data.map((d) => d.scope1),
            backgroundColor: C.scope1,
            stack: 'actual',
            barPercentage: 0.9,
            categoryPercentage: 0.8,
            order: 1,
          },
          {
            label: '실적 Scope 2',
            data: data.map((d) => d.scope2),
            backgroundColor: C.scope2,
            stack: 'actual',
            barPercentage: 0.9,
            categoryPercentage: 0.8,
            order: 1,
          },
        ],
      },
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
              title: (items) => `${data[items[0].dataIndex].month}월`,
              label: (item) => ` ${item.dataset.label}: ${formatVal(item.raw, 2)} t`,
              afterBody: (items) => {
                const d = data[items[0].dataIndex];
                if (!d.entered) return ['실적 미입력'];
                return [
                  `실적 합계: ${formatVal(d.actual, 2)} t`,
                  `월 목표: ${formatVal(d.target, 2)} t`,
                  `달성률: ${formatVal(d.rate, 1)}% (${d.rate > 100 ? '목표 초과' : '목표 이내'})`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { family: 'Noto Sans KR', size: 12 }, color: C.axisText },
            border: { color: C.grid },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: C.grid },
            ticks: { font: { family: 'JetBrains Mono', size: 11 }, color: C.axisText },
            title: { display: true, text: 'tCO₂e', font: { family: 'Noto Sans KR', size: 12 }, color: C.axisText },
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

  return <div className="h-60 w-full print:h-44 print-avoid-break"><canvas ref={canvasRef} /></div>;
};
