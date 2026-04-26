/**
 * CryptoAnalyst — Charts Module
 * Manages price charts (line) and volume bar charts using Chart.js v4.
 */

const Charts = (() => {
  let priceChart  = null;
  let volumeChart = null;

  // Colour palette
  const C = {
    accent:    '#6c63ff',
    green:     '#00d68f',
    red:       '#ff4d6a',
    yellow:    '#ffd166',
    sma20:     '#f59e0b',
    sma50:     '#3b82f6',
    ema12:     '#a78bfa',
    bbUpper:   'rgba(255,77,106,0.5)',
    bbMiddle:  'rgba(255,255,255,0.25)',
    bbLower:   'rgba(0,214,143,0.5)',
    bbFill:    'rgba(108,99,255,0.06)',
    volume:    'rgba(108,99,255,0.4)',
    grid:      'rgba(42,47,69,0.6)',
    text:      '#555d7a',
  };

  // Shared Chart.js defaults
  Chart.defaults.color          = C.text;
  Chart.defaults.borderColor    = C.grid;
  Chart.defaults.font.family    = "'Inter', sans-serif";
  Chart.defaults.font.size      = 11;

  /** Destroy existing instances */
  function destroyAll() {
    if (priceChart)  { priceChart.destroy();  priceChart  = null; }
    if (volumeChart) { volumeChart.destroy(); volumeChart = null; }
  }

  /**
   * Build datasets for the price chart given toggle state.
   */
  function buildPriceDatasets(timestamps, prices, toggles) {
    const datasets = [];

    // ── Main price line ───────────────────────────────────────────────
    const priceColor = prices.at(-1) >= prices[0] ? C.green : C.red;
    datasets.push({
      label: 'Price',
      data: timestamps.map((t, i) => ({ x: t, y: prices[i] })),
      borderColor: priceColor,
      backgroundColor: priceColor.replace(')', ', 0.08)').replace('rgb', 'rgba'),
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: true,
      order: 10,
    });

    // ── SMA 20 ────────────────────────────────────────────────────────
    if (toggles.sma20) {
      const smaVals = TA.smaSeries(prices, 20);
      datasets.push({
        label: 'SMA 20',
        data: timestamps.map((t, i) => ({ x: t, y: smaVals[i] })),
        borderColor: C.sma20,
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        order: 5,
      });
    }

    // ── SMA 50 ────────────────────────────────────────────────────────
    if (toggles.sma50) {
      const smaVals = TA.smaSeries(prices, 50);
      datasets.push({
        label: 'SMA 50',
        data: timestamps.map((t, i) => ({ x: t, y: smaVals[i] })),
        borderColor: C.sma50,
        borderWidth: 1.5,
        borderDash: [6, 3],
        pointRadius: 0,
        fill: false,
        order: 4,
      });
    }

    // ── EMA 12 ────────────────────────────────────────────────────────
    if (toggles.ema12) {
      const emaVals = TA.emaSeries(prices, 12);
      datasets.push({
        label: 'EMA 12',
        data: timestamps.map((t, i) => ({ x: t, y: emaVals[i] })),
        borderColor: C.ema12,
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        order: 3,
      });
    }

    // ── Bollinger Bands ───────────────────────────────────────────────
    if (toggles.bb) {
      const { upper, middle, lower } = TA.bollingerSeries(prices, 20);
      datasets.push({
        label: 'BB Upper',
        data: timestamps.map((t, i) => ({ x: t, y: upper[i] })),
        borderColor: C.bbUpper,
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        order: 2,
      });
      datasets.push({
        label: 'BB Middle',
        data: timestamps.map((t, i) => ({ x: t, y: middle[i] })),
        borderColor: C.bbMiddle,
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
        order: 2,
      });
      datasets.push({
        label: 'BB Lower',
        data: timestamps.map((t, i) => ({ x: t, y: lower[i] })),
        borderColor: C.bbLower,
        borderWidth: 1,
        pointRadius: 0,
        backgroundColor: C.bbFill,
        fill: '-1',   // fill between BB Lower and BB Upper
        order: 1,
      });
    }

    return datasets;
  }

  /**
   * Render (or re-render) the price chart.
   *
   * @param {number[]} timestamps  — epoch ms
   * @param {number[]} prices      — close prices
   * @param {number[]} volumes     — volume values (optional)
   * @param {object}   toggles     — { sma20, sma50, ema12, bb }
   * @param {string}   currency    — 'usd' | 'eur' | …
   */
  function renderPriceChart(timestamps, prices, volumes, toggles, currency = 'usd') {
    destroyAll();

    const pCtx = document.getElementById('priceChart');
    const vCtx = document.getElementById('volumeChart');
    const chartWrap  = document.getElementById('chartWrap');
    const volWrap    = document.getElementById('volumeChartWrap');

    if (!pCtx) return;

    const currencySymbol = { usd: '$', eur: '€', gbp: '£', btc: '₿' }[currency] || '$';

    const datasets = buildPriceDatasets(timestamps, prices, toggles);

    // Determine time unit based on span
    const spanDays = (timestamps.at(-1) - timestamps[0]) / 86_400_000;
    let timeUnit = 'hour';
    if (spanDays > 3)   timeUnit = 'day';
    if (spanDays > 90)  timeUnit = 'week';
    if (spanDays > 365) timeUnit = 'month';

    priceChart = new Chart(pCtx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { boxWidth: 12, padding: 14, color: C.text, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: '#1c2030',
            borderColor: '#2a2f45',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label(ctx) {
                if (ctx.parsed.y === null) return null;
                const val = ctx.parsed.y;
                const fmt = val < 0.01 ? val.toExponential(4) : val.toLocaleString(undefined, { maximumFractionDigits: 6 });
                return `${ctx.dataset.label}: ${currencySymbol}${fmt}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: timeUnit, tooltipFormat: 'MMM d, yyyy HH:mm' },
            grid: { color: C.grid },
            ticks: { maxRotation: 0, color: C.text, maxTicksLimit: 8 },
          },
          y: {
            position: 'right',
            grid: { color: C.grid },
            ticks: {
              color: C.text,
              callback(val) {
                if (val >= 1000) return `${currencySymbol}${(val / 1000).toFixed(1)}k`;
                if (val < 0.01)  return `${currencySymbol}${val.toExponential(2)}`;
                return `${currencySymbol}${val.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
              },
            },
          },
        },
      },
    });

    chartWrap.classList.remove('hidden');

    // Volume chart
    if (volumes && volumes.length && vCtx) {
      const volData = timestamps.map((t, i) => ({ x: t, y: volumes[i] || 0 }));
      volumeChart = new Chart(vCtx, {
        type: 'bar',
        data: {
          datasets: [{
            label: 'Volume',
            data: volData,
            backgroundColor: C.volume,
            borderWidth: 0,
            barThickness: 'flex',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 200 },
          plugins: { legend: { display: false }, tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.parsed.y;
                if (v >= 1e9) return `Vol: ${(v/1e9).toFixed(2)}B`;
                if (v >= 1e6) return `Vol: ${(v/1e6).toFixed(2)}M`;
                return `Vol: ${v.toLocaleString()}`;
              },
            },
          }},
          scales: {
            x: {
              type: 'time',
              time: { unit: timeUnit },
              grid: { display: false },
              ticks: { display: false },
            },
            y: {
              position: 'right',
              grid: { color: C.grid },
              ticks: {
                color: C.text,
                maxTicksLimit: 3,
                callback(v) {
                  if (v >= 1e9) return `${(v/1e9).toFixed(1)}B`;
                  if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`;
                  return v.toLocaleString();
                },
              },
            },
          },
        },
      });
      volWrap.classList.remove('hidden');
    }
  }

  /**
   * Update overlay datasets when toggles change without full rebuild.
   */
  function updateOverlays(timestamps, prices, toggles, currency = 'usd') {
    if (!priceChart) return;
    const datasets = buildPriceDatasets(timestamps, prices, toggles);
    priceChart.data.datasets = datasets;
    priceChart.update('none');
  }

  return { renderPriceChart, updateOverlays, destroyAll };
})();
