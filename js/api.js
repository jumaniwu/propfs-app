/**
 * CryptoAnalyst — API Module
 * Wraps CoinGecko public API (v3) — no API key required for basic endpoints.
 * Rate limit: ~30 calls/min on the free tier.
 */

const API = (() => {
  const BASE = 'https://api.coingecko.com/api/v3';

  // Simple in-memory cache to avoid hammering the API
  const cache = new Map();
  const CACHE_TTL = 60_000; // 1 minute

  async function fetchJSON(url, bypassCache = false) {
    const now = Date.now();
    if (!bypassCache && cache.has(url)) {
      const { data, ts } = cache.get(url);
      if (now - ts < CACHE_TTL) return data;
    }

    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
      throw new Error(`API error ${res.status}: ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    cache.set(url, { data, ts: now });
    return data;
  }

  /**
   * Global market overview stats.
   */
  async function getGlobalStats() {
    return fetchJSON(`${BASE}/global`);
  }

  /**
   * Top coins by market cap.
   * @param {string} currency  — 'usd' | 'eur' | 'gbp' | 'btc'
   * @param {number} perPage   — 25 | 50 | 100
   * @param {number} page      — 1-based page number
   */
  async function getMarkets(currency = 'usd', perPage = 50, page = 1) {
    const url = `${BASE}/coins/markets`
      + `?vs_currency=${currency}`
      + `&order=market_cap_desc`
      + `&per_page=${perPage}`
      + `&page=${page}`
      + `&sparkline=false`
      + `&price_change_percentage=1h,24h,7d`;
    return fetchJSON(url);
  }

  /**
   * Full coin detail (market data, description, links, …)
   */
  async function getCoinDetail(coinId) {
    const url = `${BASE}/coins/${coinId}`
      + `?localization=false`
      + `&tickers=false`
      + `&market_data=true`
      + `&community_data=true`
      + `&developer_data=false`
      + `&sparkline=false`;
    return fetchJSON(url);
  }

  /**
   * OHLC data for technical analysis (Chart.js candles / TA)
   * @param {string} coinId
   * @param {string} currency
   * @param {number} days  — 1 | 7 | 14 | 30 | 90 | 180 | 365
   */
  async function getOHLC(coinId, currency = 'usd', days = 90) {
    const url = `${BASE}/coins/${coinId}/ohlc`
      + `?vs_currency=${currency}`
      + `&days=${days}`;
    return fetchJSON(url);
  }

  /**
   * Hourly / daily price history for line chart.
   * Returns { prices, market_caps, total_volumes } — each is [[timestamp, value], …]
   */
  async function getMarketChart(coinId, currency = 'usd', days = 30) {
    const url = `${BASE}/coins/${coinId}/market_chart`
      + `?vs_currency=${currency}`
      + `&days=${days}`;
    return fetchJSON(url);
  }

  /**
   * Search coins by query string.
   */
  async function search(query) {
    const url = `${BASE}/search?query=${encodeURIComponent(query)}`;
    return fetchJSON(url, true); // always fresh for search
  }

  /**
   * List of all supported coins (id + symbol + name).
   * Cached aggressively — changes rarely.
   */
  async function getCoinList() {
    return fetchJSON(`${BASE}/coins/list`);
  }

  /**
   * Trending coins (last 24h)
   */
  async function getTrending() {
    return fetchJSON(`${BASE}/search/trending`);
  }

  return {
    getGlobalStats,
    getMarkets,
    getCoinDetail,
    getOHLC,
    getMarketChart,
    search,
    getCoinList,
    getTrending,
  };
})();
