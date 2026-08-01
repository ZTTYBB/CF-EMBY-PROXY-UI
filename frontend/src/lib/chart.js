const chartByCanvas = new WeakMap();
const renderVersionByCanvas = new WeakMap();

function bumpRenderVersion(canvas) {
  const nextVersion = (renderVersionByCanvas.get(canvas) || 0) + 1;
  renderVersionByCanvas.set(canvas, nextVersion);
  return nextVersion;
}

export async function renderTrendChart(canvas, points = [], options = {}) {
  if (!canvas) return null;

  const renderVersion = bumpRenderVersion(canvas);
  const Chart = options.Chart || (await (typeof options.loadChart === 'function'
    ? options.loadChart()
    : import('chart.js/auto'))).default;
  if (renderVersionByCanvas.get(canvas) !== renderVersion || canvas.isConnected === false) return null;
  const label = String(options.label || '趋势').trim() || '趋势';
  const borderColor = String(options.borderColor || '#fb923c').trim() || '#fb923c';
  const backgroundColor = String(options.backgroundColor || 'rgba(251, 146, 60, 0.18)').trim() || 'rgba(251, 146, 60, 0.18)';

  const activeChart = chartByCanvas.get(canvas);
  if (activeChart) activeChart.destroy();

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label,
          data: points.map((point) => point.value),
          borderColor,
          backgroundColor,
          tension: 0.35,
          fill: true,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          displayColors: false,
          backgroundColor: '#08111f',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255,255,255,0.06)'
          },
          ticks: {
            color: '#cbd5e1'
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255,255,255,0.06)'
          },
          ticks: {
            color: '#cbd5e1',
            precision: 0
          }
        }
      }
    }
  });
  chartByCanvas.set(canvas, chart);

  return chart;
}

export function destroyTrendChart(canvas) {
  if (!canvas) return;
  bumpRenderVersion(canvas);
  const activeChart = chartByCanvas.get(canvas);
  if (!activeChart) return;
  activeChart.destroy();
  chartByCanvas.delete(canvas);
}

export async function renderReleaseChart(canvas, points = []) {
  return renderTrendChart(canvas, points, {
    label: '模块改动热度',
    borderColor: '#fb923c',
    backgroundColor: 'rgba(251, 146, 60, 0.18)'
  });
}

export function destroyReleaseChart(canvas) {
  destroyTrendChart(canvas);
}
