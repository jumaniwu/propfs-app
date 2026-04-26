/**
 * CryptoAnalyst — Main Application Controller
 *
 * Orchestrates: navigation, markets table, watchlist, coin modal,
 * technical analysis panel, chart rendering, search, sorting.
 */

const app = (() => {

  /* ------------------------------------------------------------------ */
  /* State                                                                 */
  /* ------------------------------------------------------------------ */
  const state = {
    currency:       'usd',
    perPage:        50,
    currentPage:    1,
    filter:         'all',        // all | gainers | losers
    sortKey:        'rank',
    sortDir:        'asc',
    marketsData:    [],
    watchlist:      new Set(JSON.parse(localStorage.getItem('watchlist') || '[]')),
    activePage:     'markets',
    modal: {
      coinId:      null,
      activeTab:   'overview',
      chartDays:   30,
      chartData:   null,         // { timestamps, prices, volumes }
      ohlcData:    null,
      coinDetail:  null,
    },
  };

  /* ------------------------------------------------------------------ */
  /* Formatting helpers                                                    */
  /* ------------------------------------------------------------------ */

  const currencySymbols = { usd: '$', eur: '€', gbp: '£', btc: '₿' };

  function fmtPrice(val, currency = state.currency) {
    if (val === null || val === undefined) return '—';
    const sym = currencySymbols[currency] || '$';
    if (Math.abs(val) < 0.001) return `${sym}${val.toExponential(4)}`;
    if (Math.abs(val) < 1)     return `${sym}${val.toFixed(6)}`;
    if (Math.abs(val) < 100)   return `${sym}${val.toFixed(4)}`;
    return `${sym}${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  function fmtLarge(val) {
    if (val === null || val === undefined) return '—';
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9)  return `$${(val  / 1e9).toFixed(2)}B`;
    if (val >= 1e6)  return `$${(val  / 1e6).toFixed(2)}M`;
    return `$${val.toLocaleString()}`;
  }

  function fmtPct(val) {
    if (val === null || val === undefined) return '<span class="pct neu">—</span>';
    const cls = val > 0 ? 'pos' : val < 0 ? 'neg' : 'neu';
    const prefix = val > 0 ? '+' : '';
    return `<span class="pct ${cls}">${prefix}${val.toFixed(2)}%</span>`;
  }

  function signalBadge(signal) {
    const icons = { buy: '▲', sell: '▼', hold: '●' };
    return `<span class="signal-badge ${signal}">${icons[signal] || '●'} ${signal.toUpperCase()}</span>`;
  }

  /* ------------------------------------------------------------------ */
  /* Toast notifications                                                   */
  /* ------------------------------------------------------------------ */

  function toast(msg, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastOut .3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                            */
  /* ------------------------------------------------------------------ */

  function navigate(page) {
    state.activePage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const pageEl = document.getElementById(`${page}Page`);
    const linkEl = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (pageEl) pageEl.classList.add('active');
    if (linkEl) linkEl.classList.add('active');

    if (page === 'watchlist') renderWatchlist();
  }

  /* ------------------------------------------------------------------ */
  /* Global Stats Bar                                                      */
  /* ------------------------------------------------------------------ */

  async function loadGlobalStats() {
    try {
      const data = await API.getGlobalStats();
      const d = data.data;
      document.getElementById('statMarketCap').textContent = fmtLarge(d.total_market_cap?.usd);
      document.getElementById('statVolume').textContent    = fmtLarge(d.total_volume?.usd);
      document.getElementById('statBtcDom').textContent    = `${d.market_cap_percentage?.btc?.toFixed(1)}%`;
      document.getElementById('statCoins').textContent     = d.active_cryptocurrencies?.toLocaleString();

      const mktChange = d.market_cap_change_percentage_24h_usd;
      const trendEl = document.getElementById('statTrend');
      if (mktChange > 1) { trendEl.textContent = `▲ ${mktChange.toFixed(2)}%`; trendEl.style.color = 'var(--green)'; }
      else if (mktChange < -1) { trendEl.textContent = `▼ ${Math.abs(mktChange).toFixed(2)}%`; trendEl.style.color = 'var(--red)'; }
      else { trendEl.textContent = `● ${mktChange.toFixed(2)}%`; trendEl.style.color = 'var(--yellow)'; }
    } catch (e) {
      console.warn('Global stats error:', e.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Markets Table                                                         */
  /* ------------------------------------------------------------------ */

  async function loadMarkets() {
    showMarketsState('loading');
    try {
      const data = await API.getMarkets(state.currency, state.perPage, state.currentPage);
      state.marketsData = data;
      renderMarketsTable();
      showMarketsState('table');
    } catch (e) {
      document.getElementById('marketsErrorMsg').textContent = e.message;
      showMarketsState('error');
    }
  }

  function showMarketsState(which) {
    const loading = document.getElementById('marketsLoading');
    const error   = document.getElementById('marketsError');
    const table   = document.getElementById('marketsTable');
    const pager   = document.getElementById('pagination');
    loading.classList.add('hidden');
    error.classList.add('hidden');
    table.classList.add('hidden');
    pager.classList.add('hidden');

    if (which === 'loading') loading.classList.remove('hidden');
    if (which === 'error')   error.classList.remove('hidden');
    if (which === 'table') {
      table.classList.remove('hidden');
      pager.classList.remove('hidden');
    }
  }

  function getFilteredData() {
    let data = [...state.marketsData];

    if (state.filter === 'gainers') {
      data = data.filter(c => (c.price_change_percentage_24h || 0) > 0);
    } else if (state.filter === 'losers') {
      data = data.filter(c => (c.price_change_percentage_24h || 0) < 0);
    }

    const dir = state.sortDir === 'asc' ? 1 : -1;
    const keyMap = {
      rank:     c => c.market_cap_rank,
      price:    c => c.current_price,
      change1h: c => c.price_change_percentage_1h_in_currency  || 0,
      change24h:c => c.price_change_percentage_24h              || 0,
      change7d: c => c.price_change_percentage_7d_in_currency  || 0,
      marketcap:c => c.market_cap,
      volume:   c => c.total_volume,
    };

    const keyFn = keyMap[state.sortKey] || keyMap['rank'];
    data.sort((a, b) => (keyFn(a) - keyFn(b)) * dir);

    return data;
  }

  function renderMarketsTable() {
    const tbody = document.getElementById('marketsBody');
    const data  = getFilteredData();

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">No coins match the current filter.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(coin => {
      const signal = TA.quickSignal(
        coin.price_change_percentage_24h,
        coin.price_change_percentage_7d_in_currency
      );
      const starred = state.watchlist.has(coin.id);

      return `<tr>
        <td class="td-rank">${coin.market_cap_rank || '—'}</td>
        <td class="td-coin">
          <div class="coin-cell">
            <button class="star-btn ${starred ? 'starred' : ''}" data-coinid="${coin.id}" title="${starred ? 'Remove from watchlist' : 'Add to watchlist'}">
              ${starred ? '&#9733;' : '&#9734;'}
            </button>
            <img class="coin-img" src="${coin.image || ''}" alt="${coin.symbol}" loading="lazy"
                 onerror="this.style.display='none'">
            <div class="coin-name-wrap">
              <span class="coin-name">${escapeHtml(coin.name)}</span>
              <span class="coin-symbol">${coin.symbol?.toUpperCase()}</span>
            </div>
          </div>
        </td>
        <td>${fmtPrice(coin.current_price)}</td>
        <td>${fmtPct(coin.price_change_percentage_1h_in_currency)}</td>
        <td>${fmtPct(coin.price_change_percentage_24h)}</td>
        <td>${fmtPct(coin.price_change_percentage_7d_in_currency)}</td>
        <td>${fmtLarge(coin.market_cap)}</td>
        <td>${fmtLarge(coin.total_volume)}</td>
        <td>${signalBadge(signal)}</td>
        <td>
          <button class="action-btn" data-coinid="${coin.id}">Analyse &#8594;</button>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('pageInfo').textContent = `Page ${state.currentPage}`;
  }

  /* ------------------------------------------------------------------ */
  /* Watchlist                                                             */
  /* ------------------------------------------------------------------ */

  function saveWatchlist() {
    localStorage.setItem('watchlist', JSON.stringify([...state.watchlist]));
  }

  function toggleWatchlist(coinId) {
    if (state.watchlist.has(coinId)) {
      state.watchlist.delete(coinId);
      toast('Removed from watchlist', 'info');
    } else {
      state.watchlist.add(coinId);
      toast('Added to watchlist', 'success');
    }
    saveWatchlist();
    // Update star buttons in markets table
    document.querySelectorAll(`.star-btn[data-coinid="${coinId}"]`).forEach(btn => {
      const isStarred = state.watchlist.has(coinId);
      btn.classList.toggle('starred', isStarred);
      btn.innerHTML = isStarred ? '&#9733;' : '&#9734;';
      btn.title = isStarred ? 'Remove from watchlist' : 'Add to watchlist';
    });
    if (state.activePage === 'watchlist') renderWatchlist();
  }

  async function renderWatchlist() {
    const empty = document.getElementById('watchlistEmpty');
    const table = document.getElementById('watchlistTable');
    const tbody = document.getElementById('watchlistBody');

    if (!state.watchlist.size) {
      empty.classList.remove('hidden');
      table.classList.add('hidden');
      return;
    }

    // Try to get watchlist coins from already-loaded markets data
    const allLoaded = state.marketsData.filter(c => state.watchlist.has(c.id));
    // If we don't have them all, fetch
    let coins = allLoaded;
    if (allLoaded.length < state.watchlist.size) {
      try {
        const data = await API.getMarkets(state.currency, 250, 1);
        coins = data.filter(c => state.watchlist.has(c.id));
      } catch (e) {
        coins = allLoaded; // fallback
      }
    }

    if (!coins.length) {
      empty.classList.remove('hidden');
      table.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    table.classList.remove('hidden');

    tbody.innerHTML = coins.map((coin, idx) => {
      const signal = TA.quickSignal(
        coin.price_change_percentage_24h,
        coin.price_change_percentage_7d_in_currency
      );
      return `<tr>
        <td class="td-rank">${idx + 1}</td>
        <td class="td-coin">
          <div class="coin-cell">
            <img class="coin-img" src="${coin.image}" alt="${coin.symbol}" loading="lazy" onerror="this.style.display='none'">
            <div class="coin-name-wrap">
              <span class="coin-name">${escapeHtml(coin.name)}</span>
              <span class="coin-symbol">${coin.symbol?.toUpperCase()}</span>
            </div>
          </div>
        </td>
        <td>${fmtPrice(coin.current_price)}</td>
        <td>${fmtPct(coin.price_change_percentage_24h)}</td>
        <td>${fmtPct(coin.price_change_percentage_7d_in_currency)}</td>
        <td>${fmtLarge(coin.market_cap)}</td>
        <td>${signalBadge(signal)}</td>
        <td><button class="action-btn" data-coinid="${coin.id}">Analyse &#8594;</button></td>
        <td>
          <button class="action-btn" style="color:var(--red);border-color:var(--red)" data-remove="${coin.id}">&#10005;</button>
        </td>
      </tr>`;
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Coin Detail Modal                                                     */
  /* ------------------------------------------------------------------ */

  async function openModal(coinId) {
    const modal = document.getElementById('coinModal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    state.modal.coinId    = coinId;
    state.modal.activeTab = 'overview';
    state.modal.chartDays = 30;
    state.modal.chartData = null;
    state.modal.ohlcData  = null;

    // Activate overview tab
    activateModalTab('overview');

    // Fill header with quick data from marketsData if available
    const quick = state.marketsData.find(c => c.id === coinId);
    if (quick) fillModalHeaderQuick(quick);

    // Load full detail
    try {
      const detail = await API.getCoinDetail(coinId);
      state.modal.coinDetail = detail;
      fillModalHeader(detail);
      fillOverviewTab(detail);
      fillInfoTab(detail);
    } catch (e) {
      toast('Failed to load coin data: ' + e.message, 'error');
    }
  }

  function closeModal() {
    document.getElementById('coinModal').classList.add('hidden');
    document.body.style.overflow = '';
    Charts.destroyAll();
    state.modal.coinId = null;
  }

  function fillModalHeaderQuick(coin) {
    document.getElementById('modalCoinImg').src    = coin.image   || '';
    document.getElementById('modalCoinImg').alt    = coin.symbol  || '';
    document.getElementById('modalCoinName').textContent   = coin.name   || '';
    document.getElementById('modalCoinSymbol').textContent = (coin.symbol || '').toUpperCase();
    document.getElementById('modalCoinRank').textContent   = `#${coin.market_cap_rank || '?'}`;
    document.getElementById('modalPrice').textContent      = fmtPrice(coin.current_price);

    const chg = coin.price_change_percentage_24h;
    const chgEl = document.getElementById('modalPriceChange');
    chgEl.innerHTML = fmtPct(chg) + ' <span style="color:var(--text-muted);font-size:.8rem">24h</span>';

    // Quick signal from 24h/7d changes
    const quickSig = TA.quickSignal(coin.price_change_percentage_24h, coin.price_change_percentage_7d_in_currency);
    fillSignalCard({ verdict: quickSig, score: 50, indicators: [], reasons: [] });
  }

  function fillModalHeader(detail) {
    const md = detail.market_data;
    document.getElementById('modalCoinImg').src            = detail.image?.large || detail.image?.small || '';
    document.getElementById('modalCoinName').textContent   = detail.name || '';
    document.getElementById('modalCoinSymbol').textContent = (detail.symbol || '').toUpperCase();
    document.getElementById('modalCoinRank').textContent   = `#${detail.market_cap_rank || '?'}`;
    document.getElementById('modalPrice').textContent      = fmtPrice(md?.current_price?.[state.currency]);

    const chg = md?.price_change_percentage_24h;
    const chgEl = document.getElementById('modalPriceChange');
    chgEl.innerHTML = fmtPct(chg) + ' <span style="color:var(--text-muted);font-size:.8rem">24h</span>';
  }

  function fillSignalCard(analysis) {
    const { verdict, score, indicators, reasons } = analysis;
    const verdictEl = document.getElementById('signalVerdict');
    verdictEl.className = `signal-verdict ${verdict}`;
    const labels = { buy: '▲ BUY', sell: '▼ SELL', hold: '● HOLD' };
    verdictEl.textContent = labels[verdict] || '● HOLD';

    const buyCount  = indicators.filter(i => i.signal === 'buy').length;
    const sellCount = indicators.filter(i => i.signal === 'sell').length;
    const holdCount = indicators.filter(i => i.signal === 'hold' && i.weight > 0).length;

    document.getElementById('signalScore').innerHTML =
      `<strong>Score: ${score}/100</strong><br>` +
      `Buy signals: ${buyCount}<br>` +
      `Sell signals: ${sellCount}<br>` +
      `Neutral: ${holdCount}`;

    const reasonsEl = document.getElementById('signalReasons');
    reasonsEl.innerHTML = reasons.slice(0, 8).map(r =>
      `<span class="reason-tag ${r.type}">${escapeHtml(r.text)}</span>`
    ).join('');
  }

  function fillOverviewTab(detail) {
    const md   = detail.market_data;
    const cur  = state.currency;
    const sym  = currencySymbols[cur] || '$';

    const stats = [
      { label: 'Market Cap',       value: fmtLarge(md?.market_cap?.[cur]) },
      { label: 'Fully Diluted Val',value: fmtLarge(md?.fully_diluted_valuation?.[cur]) },
      { label: '24h Volume',        value: fmtLarge(md?.total_volume?.[cur]) },
      { label: '24h High',          value: fmtPrice(md?.high_24h?.[cur]) },
      { label: '24h Low',           value: fmtPrice(md?.low_24h?.[cur]) },
      { label: 'ATH',               value: fmtPrice(md?.ath?.[cur]) },
      { label: 'ATH Date',          value: md?.ath_date?.[cur] ? new Date(md.ath_date[cur]).toLocaleDateString() : '—' },
      { label: 'ATH Change',        value: md?.ath_change_percentage?.[cur] !== undefined ? `${md.ath_change_percentage[cur].toFixed(2)}%` : '—' },
      { label: 'ATL',               value: fmtPrice(md?.atl?.[cur]) },
      { label: 'Circulating Supply',value: md?.circulating_supply ? md.circulating_supply.toLocaleString() : '—' },
      { label: 'Max Supply',        value: md?.max_supply ? md.max_supply.toLocaleString() : '∞' },
      { label: 'Price Change 7d',   value: md?.price_change_percentage_7d !== undefined ? `${md.price_change_percentage_7d.toFixed(2)}%` : '—' },
      { label: 'Price Change 30d',  value: md?.price_change_percentage_30d !== undefined ? `${md.price_change_percentage_30d.toFixed(2)}%` : '—' },
      { label: 'Price Change 1y',   value: md?.price_change_percentage_1y  !== undefined ? `${md.price_change_percentage_1y.toFixed(2)}%`  : '—' },
    ];

    document.getElementById('modalStats').innerHTML = stats.map(s =>
      `<div class="stat-card">
        <div class="stat-card-label">${escapeHtml(s.label)}</div>
        <div class="stat-card-value">${s.value}</div>
      </div>`
    ).join('');
  }

  function fillInfoTab(detail) {
    const md  = detail.market_data;
    const cur = state.currency;
    const container = document.getElementById('coinInfoContent');

    // Description
    let descHtml = '';
    const desc = detail.description?.en?.replace(/<[^>]*>/g, '').trim();
    if (desc) {
      descHtml = `
        <div class="info-section">
          <h4>About ${escapeHtml(detail.name)}</h4>
          <p class="info-desc" id="coinDesc">${escapeHtml(desc.slice(0, 600))}${desc.length > 600 ? '…' : ''}</p>
          ${desc.length > 600 ? `<button class="read-more-btn" id="readMoreBtn">Read more</button>` : ''}
        </div>`;
    }

    // Links
    const links = detail.links || {};
    const homepage = links.homepage?.filter(Boolean)[0];
    const twitter  = links.twitter_screen_name;
    const reddit   = links.subreddit_url;
    const github   = links.repos_url?.github?.[0];
    const explorer = links.blockchain_site?.filter(Boolean)[0];

    const linkItems = [
      homepage && `<a href="${escapeHtml(homepage)}" target="_blank" rel="noopener" style="color:var(--accent)">Website &#8599;</a>`,
      twitter  && `<a href="https://twitter.com/${twitter}" target="_blank" rel="noopener" style="color:var(--accent)">Twitter &#8599;</a>`,
      reddit   && `<a href="${escapeHtml(reddit)}" target="_blank" rel="noopener" style="color:var(--accent)">Reddit &#8599;</a>`,
      github   && `<a href="${escapeHtml(github)}" target="_blank" rel="noopener" style="color:var(--accent)">GitHub &#8599;</a>`,
      explorer && `<a href="${escapeHtml(explorer)}" target="_blank" rel="noopener" style="color:var(--accent)">Explorer &#8599;</a>`,
    ].filter(Boolean);

    const linksHtml = linkItems.length ? `
      <div class="info-section">
        <h4>Links</h4>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">${linkItems.join('')}</div>
      </div>` : '';

    // Categories
    const cats = detail.categories?.filter(Boolean).slice(0, 8) || [];
    const catsHtml = cats.length ? `
      <div class="info-section">
        <h4>Categories</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${cats.map(c => `<span class="badge">${escapeHtml(c)}</span>`).join('')}
        </div>
      </div>` : '';

    // Community
    const cd = detail.community_data;
    const communityRows = [
      cd?.twitter_followers      && { label: 'Twitter Followers',  value: cd.twitter_followers.toLocaleString() },
      cd?.reddit_subscribers     && { label: 'Reddit Subscribers', value: cd.reddit_subscribers.toLocaleString() },
      cd?.reddit_active_accounts && { label: 'Reddit Active',      value: cd.reddit_active_accounts.toLocaleString() },
    ].filter(Boolean);

    const communityHtml = communityRows.length ? `
      <div class="info-section">
        <h4>Community</h4>
        <div class="info-rows">
          ${communityRows.map(r => `<div class="info-row"><span class="info-label">${r.label}</span><span class="info-value">${r.value}</span></div>`).join('')}
        </div>
      </div>` : '';

    container.innerHTML = descHtml + linksHtml + catsHtml + communityHtml;

    // Read more toggle
    const readMoreBtn = document.getElementById('readMoreBtn');
    if (readMoreBtn) {
      readMoreBtn.addEventListener('click', () => {
        const descEl = document.getElementById('coinDesc');
        if (descEl) {
          descEl.textContent = desc;
          descEl.style.webkitLineClamp = 'unset';
          readMoreBtn.remove();
        }
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Technical Analysis Tab                                                */
  /* ------------------------------------------------------------------ */

  async function loadTechnicalAnalysis() {
    const taLoading = document.getElementById('taLoading');
    const taContent = document.getElementById('taContent');
    taLoading.classList.remove('hidden');
    taContent.classList.add('hidden');

    try {
      const coinId = state.modal.coinId;
      if (!state.modal.ohlcData) {
        state.modal.ohlcData = await API.getOHLC(coinId, state.currency, 90);
      }
      const ohlc    = state.modal.ohlcData;
      const current = state.modal.coinDetail?.market_data?.current_price?.[state.currency]
        || ohlc.at(-1)?.[4];

      const analysis = TA.analyze(ohlc, current);

      // Update signal card
      fillSignalCard(analysis);

      // Render TA grid (main indicators)
      renderTAGrid(analysis.indicators);

      // Render MA and Oscillator tables
      const maInds  = analysis.indicators.filter(i => i.name.includes('SMA') || i.name.includes('EMA'));
      const oscInds = analysis.indicators.filter(i => ['RSI (14)', 'MACD (12/26/9)', 'Bollinger Bands', 'Stochastic (14,3)'].includes(i.name));

      renderIndicatorTable('maTable', maInds);
      renderIndicatorTable('oscTable', oscInds);

      taLoading.classList.add('hidden');
      taContent.classList.remove('hidden');
    } catch (e) {
      taLoading.innerHTML = `<p class="error-icon">&#9888;</p><p style="color:var(--text-secondary)">${e.message}</p>`;
    }
  }

  function renderTAGrid(indicators) {
    const grid = document.getElementById('taGrid');
    const primary = indicators.filter(i => ['RSI (14)', 'MACD (12/26/9)', 'Bollinger Bands', 'Stochastic (14,3)', 'ATR (14)'].includes(i.name));
    grid.innerHTML = primary.map(ind => `
      <div class="ta-card">
        <div class="ta-card-name">${escapeHtml(ind.name)}</div>
        <div class="ta-card-value ${ind.signal}">${escapeHtml(ind.displayValue)}</div>
        <div class="ta-card-signal ${ind.signal}">${ind.signal.toUpperCase()}</div>
      </div>
    `).join('');
  }

  function renderIndicatorTable(containerId, indicators) {
    const el = document.getElementById(containerId);
    if (!indicators.length) { el.innerHTML = '<p class="text-muted" style="padding:8px;">No data</p>'; return; }
    el.innerHTML = indicators.map(ind => `
      <div class="indicator-row">
        <span class="ind-name">${escapeHtml(ind.name)}</span>
        <span class="ind-value">${escapeHtml(ind.displayValue)}</span>
        <span class="ind-signal ${ind.signal}">${ind.signal.toUpperCase()}</span>
      </div>
    `).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Chart Tab                                                             */
  /* ------------------------------------------------------------------ */

  async function loadChart(days) {
    state.modal.chartDays = days;
    const chartLoading = document.getElementById('chartLoading');
    const chartWrap    = document.getElementById('chartWrap');
    const volWrap      = document.getElementById('volumeChartWrap');

    chartLoading.classList.remove('hidden');
    chartWrap.classList.add('hidden');
    volWrap.classList.add('hidden');
    Charts.destroyAll();

    try {
      const data = await API.getMarketChart(state.modal.coinId, state.currency, days);
      state.modal.chartData = {
        timestamps: data.prices.map(p => p[0]),
        prices:     data.prices.map(p => p[1]),
        volumes:    data.total_volumes.map(v => v[1]),
      };
      chartLoading.classList.add('hidden');
      renderChart();
    } catch (e) {
      chartLoading.innerHTML = `<p class="error-icon">&#9888;</p><p style="color:var(--text-secondary)">${e.message}</p>`;
    }
  }

  function renderChart() {
    const cd = state.modal.chartData;
    if (!cd) return;
    const toggles = {
      sma20: document.getElementById('toggleSMA20')?.checked,
      sma50: document.getElementById('toggleSMA50')?.checked,
      ema12: document.getElementById('toggleEMA12')?.checked,
      bb:    document.getElementById('toggleBB')?.checked,
    };
    Charts.renderPriceChart(cd.timestamps, cd.prices, cd.volumes, toggles, state.currency);
  }

  /* ------------------------------------------------------------------ */
  /* Modal Tab Switching                                                   */
  /* ------------------------------------------------------------------ */

  function activateModalTab(tabName) {
    state.modal.activeTab = tabName;
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));

    if (tabName === 'technical' && !document.getElementById('taContent').querySelector('.ta-card')) {
      loadTechnicalAnalysis();
    }
    if (tabName === 'chart' && !state.modal.chartData) {
      loadChart(state.modal.chartDays);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Search                                                                */
  /* ------------------------------------------------------------------ */

  let searchTimeout = null;

  function initSearch() {
    const input    = document.getElementById('searchInput');
    const dropdown = document.getElementById('searchDropdown');

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim();
      if (q.length < 2) { dropdown.classList.add('hidden'); return; }

      searchTimeout = setTimeout(async () => {
        try {
          const results = await API.search(q);
          const coins   = results.coins?.slice(0, 8) || [];
          if (!coins.length) { dropdown.classList.add('hidden'); return; }

          dropdown.innerHTML = coins.map(c => `
            <div class="search-result-item" data-coinid="${c.id}">
              <img src="${c.thumb}" alt="${c.symbol}" onerror="this.style.display='none'" />
              <span class="search-result-name">${escapeHtml(c.name)}</span>
              <span class="search-result-symbol">${(c.symbol || '').toUpperCase()}</span>
            </div>
          `).join('');

          dropdown.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
              dropdown.classList.add('hidden');
              input.value = '';
              openModal(item.dataset.coinid);
            });
          });

          dropdown.classList.remove('hidden');
        } catch (e) {
          dropdown.classList.add('hidden');
        }
      }, 300);
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Event Delegation                                                      */
  /* ------------------------------------------------------------------ */

  function initEvents() {
    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigate(link.dataset.page);
      });
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      const btn = document.getElementById('refreshBtn');
      btn.classList.add('spinning');
      await Promise.all([loadGlobalStats(), loadMarkets()]);
      btn.classList.remove('spinning');
      toast('Data refreshed', 'success');
    });

    // Currency select
    document.getElementById('currencySelect').addEventListener('change', e => {
      state.currency = e.target.value;
      state.currentPage = 1;
      loadMarkets();
    });

    // Per-page select
    document.getElementById('perPageSelect').addEventListener('change', e => {
      state.perPage = parseInt(e.target.value);
      state.currentPage = 1;
      loadMarkets();
    });

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.filter;
        renderMarketsTable();
      });
    });

    // Sortable column headers
    document.querySelectorAll('.table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = key === 'rank' ? 'asc' : 'desc';
        }
        document.querySelectorAll('.table th.sortable').forEach(h => {
          h.classList.remove('sorted-asc', 'sorted-desc');
        });
        th.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        renderMarketsTable();
      });
    });

    // Pagination
    document.getElementById('prevPage').addEventListener('click', () => {
      if (state.currentPage > 1) { state.currentPage--; loadMarkets(); }
    });
    document.getElementById('nextPage').addEventListener('click', () => {
      state.currentPage++;
      loadMarkets();
    });

    // Markets table — delegate clicks on star and action buttons
    document.getElementById('marketsBody').addEventListener('click', e => {
      const starBtn   = e.target.closest('.star-btn');
      const actionBtn = e.target.closest('.action-btn');
      if (starBtn)   toggleWatchlist(starBtn.dataset.coinid);
      if (actionBtn) openModal(actionBtn.dataset.coinid);
    });

    // Watchlist table delegate
    document.getElementById('watchlistBody').addEventListener('click', e => {
      const actionBtn = e.target.closest('.action-btn[data-coinid]');
      const removeBtn = e.target.closest('.action-btn[data-remove]');
      if (actionBtn) openModal(actionBtn.dataset.coinid);
      if (removeBtn) { toggleWatchlist(removeBtn.dataset.remove); renderWatchlist(); }
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalBackdrop').addEventListener('click', closeModal);

    // Modal tabs
    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => activateModalTab(tab.dataset.tab));
    });

    // Chart timeframe buttons
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadChart(parseInt(btn.dataset.days));
      });
    });

    // Chart overlay toggles
    ['toggleSMA20', 'toggleSMA50', 'toggleEMA12', 'toggleBB'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => renderChart());
    });

    // Keyboard ESC to close modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('coinModal').classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Security helper                                                       */
  /* ------------------------------------------------------------------ */

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Make escapeHtml available globally within this module scope
  window.escapeHtml = escapeHtml;

  /* ------------------------------------------------------------------ */
  /* Init                                                                  */
  /* ------------------------------------------------------------------ */

  async function init() {
    initEvents();
    initSearch();
    await Promise.all([loadGlobalStats(), loadMarkets()]);

    // Auto-refresh every 90 seconds
    setInterval(() => {
      loadGlobalStats();
      if (state.activePage === 'markets') loadMarkets();
    }, 90_000);
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { loadMarkets, loadGlobalStats, openModal };
})();
