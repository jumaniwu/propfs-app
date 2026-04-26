/**
 * CryptoAnalyst — Technical Analysis Engine
 *
 * All calculations operate on arrays of close prices (Numbers).
 * OHLC data format from CoinGecko: [[timestamp, open, high, low, close], …]
 *
 * Indicators implemented:
 *   - SMA  (Simple Moving Average)
 *   - EMA  (Exponential Moving Average)
 *   - RSI  (Relative Strength Index, 14)
 *   - MACD (12/26/9 EMA)
 *   - Bollinger Bands (20, 2σ)
 *   - ATR  (Average True Range, 14)
 *   - Stochastic Oscillator (14, 3)
 *   - Volume-weighted signals
 *
 * Outputs a composite BUY / SELL / HOLD verdict with individual indicator signals.
 */

const TA = (() => {

  /* ------------------------------------------------------------------ */
  /* Utility helpers                                                       */
  /* ------------------------------------------------------------------ */

  /** Extract close prices from CoinGecko OHLC array */
  function closes(ohlc) {
    return ohlc.map(c => c[4]);
  }

  /** Extract high prices */
  function highs(ohlc) {
    return ohlc.map(c => c[2]);
  }

  /** Extract low prices */
  function lows(ohlc) {
    return ohlc.map(c => c[3]);
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  function mean(arr) {
    return arr.length ? sum(arr) / arr.length : 0;
  }

  function stddev(arr) {
    const m = mean(arr);
    return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
  }

  /* ------------------------------------------------------------------ */
  /* Moving Averages                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Simple Moving Average — returns last value only.
   * @param {number[]} prices
   * @param {number}   period
   */
  function sma(prices, period) {
    if (prices.length < period) return null;
    return mean(prices.slice(-period));
  }

  /**
   * SMA series (full array aligned to prices).
   */
  function smaSeries(prices, period) {
    const result = new Array(prices.length).fill(null);
    for (let i = period - 1; i < prices.length; i++) {
      result[i] = mean(prices.slice(i - period + 1, i + 1));
    }
    return result;
  }

  /**
   * Exponential Moving Average — returns last value only.
   */
  function ema(prices, period) {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let val = mean(prices.slice(0, period));
    for (let i = period; i < prices.length; i++) {
      val = prices[i] * k + val * (1 - k);
    }
    return val;
  }

  /**
   * EMA series (full array aligned to prices).
   */
  function emaSeries(prices, period) {
    const result = new Array(prices.length).fill(null);
    if (prices.length < period) return result;
    const k = 2 / (period + 1);
    let val = mean(prices.slice(0, period));
    result[period - 1] = val;
    for (let i = period; i < prices.length; i++) {
      val = prices[i] * k + val * (1 - k);
      result[i] = val;
    }
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* RSI (Relative Strength Index)                                        */
  /* ------------------------------------------------------------------ */

  /**
   * RSI — Wilder's smoothed method.
   * @returns {{ value: number, signal: 'buy'|'sell'|'hold', interpretation: string }}
   */
  function rsi(prices, period = 14) {
    if (prices.length < period + 1) return null;

    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain  = gains  / period;
    let avgLoss  = losses / period;

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      avgGain  = (avgGain  * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss  = (avgLoss  * (period - 1) + Math.max(-diff, 0)) / period;
    }

    const rs    = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    let signal, interpretation;
    if (value < 30) {
      signal = 'buy';
      interpretation = `Oversold (${value.toFixed(1)}) — potential reversal up`;
    } else if (value > 70) {
      signal = 'sell';
      interpretation = `Overbought (${value.toFixed(1)}) — potential reversal down`;
    } else if (value < 45) {
      signal = 'hold';
      interpretation = `Bearish zone (${value.toFixed(1)})`;
    } else if (value > 55) {
      signal = 'hold';
      interpretation = `Bullish zone (${value.toFixed(1)})`;
    } else {
      signal = 'hold';
      interpretation = `Neutral (${value.toFixed(1)})`;
    }

    return { value, signal, interpretation };
  }

  /**
   * RSI series for chart overlay.
   */
  function rsiSeries(prices, period = 14) {
    const result = new Array(prices.length).fill(null);
    if (prices.length < period + 1) return result;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      avgGain  = (avgGain  * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss  = (avgLoss  * (period - 1) + Math.max(-diff, 0)) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    }
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* MACD (12/26/9)                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * MACD with histogram.
   * @returns {{ macd, signal, histogram, signalType }}
   */
  function macd(prices, fast = 12, slow = 26, signal = 9) {
    if (prices.length < slow + signal) return null;

    const fastSeries = emaSeries(prices, fast);
    const slowSeries = emaSeries(prices, slow);

    // MACD line = fast EMA − slow EMA (only where both exist)
    const macdLine = prices.map((_, i) =>
      fastSeries[i] !== null && slowSeries[i] !== null
        ? fastSeries[i] - slowSeries[i]
        : null
    );

    // Signal line = EMA(9) of MACD line (ignoring nulls)
    const validMacd = macdLine.filter(v => v !== null);
    const signalLineValue = ema(validMacd, signal);

    // Reconstruct signal series aligned to prices
    const signalSeries = new Array(prices.length).fill(null);
    let validCount = 0;
    const k = 2 / (signal + 1);
    let emaVal = null;

    for (let i = 0; i < prices.length; i++) {
      if (macdLine[i] === null) continue;
      validCount++;
      if (validCount < signal) {
        continue;
      } else if (validCount === signal) {
        // Seed with simple mean of first `signal` MACD values
        const seed = macdLine.filter(v => v !== null).slice(0, signal);
        emaVal = mean(seed);
        signalSeries[i] = emaVal;
      } else {
        emaVal = macdLine[i] * k + emaVal * (1 - k);
        signalSeries[i] = emaVal;
      }
    }

    const lastMacd   = macdLine.filter(v => v !== null).at(-1);
    const lastSignal = signalSeries.filter(v => v !== null).at(-1);
    const histogram  = lastMacd - lastSignal;

    // Signal: MACD crossing above/below signal line
    const prevMacd   = macdLine.filter(v => v !== null).at(-2);
    const prevSignalVal = signalSeries.filter(v => v !== null).at(-2);

    let signalType;
    const crossingUp   = prevMacd <= prevSignalVal && lastMacd > lastSignal;
    const crossingDown = prevMacd >= prevSignalVal && lastMacd < lastSignal;

    if (crossingUp)        signalType = 'buy';
    else if (crossingDown) signalType = 'sell';
    else if (lastMacd > lastSignal && lastMacd > 0) signalType = 'buy';
    else if (lastMacd < lastSignal && lastMacd < 0) signalType = 'sell';
    else signalType = 'hold';

    return {
      macd:      lastMacd,
      signal:    lastSignal,
      histogram,
      signalType,
      macdLine,
      signalSeries,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Bollinger Bands                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Bollinger Bands (20-period, 2σ).
   * @returns {{ upper, middle, lower, bandwidth, %b, signal }}
   */
  function bollingerBands(prices, period = 20, multiplier = 2) {
    if (prices.length < period) return null;

    const slice  = prices.slice(-period);
    const middle = mean(slice);
    const sd     = stddev(slice);
    const upper  = middle + multiplier * sd;
    const lower  = middle - multiplier * sd;
    const current = prices.at(-1);

    const bandwidth = ((upper - lower) / middle) * 100;
    const percentB  = (current - lower) / (upper - lower);

    let signal, interpretation;
    if (current > upper) {
      signal = 'sell';
      interpretation = 'Price above upper band — overbought';
    } else if (current < lower) {
      signal = 'buy';
      interpretation = 'Price below lower band — oversold';
    } else if (percentB > 0.8) {
      signal = 'sell';
      interpretation = 'Near upper band — bearish pressure';
    } else if (percentB < 0.2) {
      signal = 'buy';
      interpretation = 'Near lower band — bullish opportunity';
    } else {
      signal = 'hold';
      interpretation = 'Within bands — neutral';
    }

    return { upper, middle, lower, bandwidth, percentB, signal, interpretation };
  }

  /**
   * Full Bollinger Bands series (upper, middle, lower arrays).
   */
  function bollingerSeries(prices, period = 20, multiplier = 2) {
    const upper  = new Array(prices.length).fill(null);
    const middle = new Array(prices.length).fill(null);
    const lower  = new Array(prices.length).fill(null);

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const m     = mean(slice);
      const sd    = stddev(slice);
      middle[i] = m;
      upper[i]  = m + multiplier * sd;
      lower[i]  = m - multiplier * sd;
    }
    return { upper, middle, lower };
  }

  /* ------------------------------------------------------------------ */
  /* ATR (Average True Range)                                             */
  /* ------------------------------------------------------------------ */

  /**
   * ATR — measures volatility.
   * @param {number[]} highArr
   * @param {number[]} lowArr
   * @param {number[]} closeArr
   * @param {number}   period
   */
  function atr(highArr, lowArr, closeArr, period = 14) {
    if (closeArr.length < period + 1) return null;
    const trueRanges = [];
    for (let i = 1; i < closeArr.length; i++) {
      trueRanges.push(Math.max(
        highArr[i]  - lowArr[i],
        Math.abs(highArr[i]  - closeArr[i - 1]),
        Math.abs(lowArr[i]   - closeArr[i - 1])
      ));
    }
    // Wilder's smoothing
    let atrVal = mean(trueRanges.slice(0, period));
    for (let i = period; i < trueRanges.length; i++) {
      atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
    }
    return atrVal;
  }

  /* ------------------------------------------------------------------ */
  /* Stochastic Oscillator                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Stochastic %K and %D.
   * @returns {{ k, d, signal }}
   */
  function stochastic(highArr, lowArr, closeArr, kPeriod = 14, dPeriod = 3) {
    if (closeArr.length < kPeriod) return null;

    const kValues = [];
    for (let i = kPeriod - 1; i < closeArr.length; i++) {
      const sliceH = highArr.slice(i - kPeriod + 1, i + 1);
      const sliceL = lowArr.slice(i  - kPeriod + 1, i + 1);
      const high   = Math.max(...sliceH);
      const low    = Math.min(...sliceL);
      const k      = low === high ? 50 : ((closeArr[i] - low) / (high - low)) * 100;
      kValues.push(k);
    }

    const k = kValues.at(-1);
    const d = mean(kValues.slice(-dPeriod));

    let signal;
    if (k < 20 && d < 20)       signal = 'buy';
    else if (k > 80 && d > 80)  signal = 'sell';
    else if (k > d && k < 50)   signal = 'buy';
    else if (k < d && k > 50)   signal = 'sell';
    else                         signal = 'hold';

    return { k, d, signal };
  }

  /* ------------------------------------------------------------------ */
  /* Composite Signal Engine                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Run all indicators on OHLC data and produce a composite verdict.
   *
   * @param {Array}  ohlcData   — [[ts, open, high, low, close], …]
   * @param {number} currentPrice — latest price (for MA comparison)
   * @returns {{ verdict, score, indicators, reasons }}
   */
  function analyze(ohlcData, currentPrice) {
    if (!ohlcData || ohlcData.length < 30) {
      return { verdict: 'hold', score: 50, indicators: [], reasons: ['Insufficient data'] };
    }

    const closeArr = closes(ohlcData);
    const highArr  = highs(ohlcData);
    const lowArr   = lows(ohlcData);
    const price    = currentPrice || closeArr.at(-1);

    const indicators = [];
    let buyScore  = 0;
    let sellScore = 0;
    let totalWeight = 0;

    // ── Helper to push an indicator result ────────────────────────────
    function addIndicator(name, value, displayValue, signal, weight, note) {
      indicators.push({ name, value, displayValue, signal, weight, note });
      totalWeight += weight;
      if (signal === 'buy')  buyScore  += weight;
      if (signal === 'sell') sellScore += weight;
    }

    // ── RSI (weight: 2) ───────────────────────────────────────────────
    const rsiResult = rsi(closeArr, 14);
    if (rsiResult) {
      addIndicator(
        'RSI (14)', rsiResult.value, rsiResult.value.toFixed(2),
        rsiResult.signal, 2, rsiResult.interpretation
      );
    }

    // ── MACD (weight: 2) ──────────────────────────────────────────────
    const macdResult = macd(closeArr);
    if (macdResult) {
      const dir = macdResult.macd >= 0 ? 'positive' : 'negative';
      addIndicator(
        'MACD (12/26/9)', macdResult.macd, macdResult.macd.toFixed(4),
        macdResult.signalType, 2,
        `MACD ${macdResult.macd.toFixed(4)} vs Signal ${macdResult.signal.toFixed(4)} (histogram ${macdResult.histogram.toFixed(4)})`
      );
    }

    // ── Bollinger Bands (weight: 1.5) ─────────────────────────────────
    const bbResult = bollingerBands(closeArr);
    if (bbResult) {
      addIndicator(
        'Bollinger Bands', bbResult.percentB * 100, `%B ${(bbResult.percentB * 100).toFixed(1)}`,
        bbResult.signal, 1.5, bbResult.interpretation
      );
    }

    // ── SMA 20 vs Price (weight: 1) ───────────────────────────────────
    const sma20 = sma(closeArr, 20);
    if (sma20) {
      const aboveBelow = price > sma20 ? 'above' : 'below';
      const sig = price > sma20 ? 'buy' : 'sell';
      addIndicator(
        'SMA 20', sma20, sma20.toFixed(4),
        sig, 1,
        `Price ${aboveBelow} SMA20 (${sma20.toFixed(4)})`
      );
    }

    // ── SMA 50 vs Price (weight: 1.5) ────────────────────────────────
    const sma50 = sma(closeArr, 50);
    if (sma50) {
      const sig = price > sma50 ? 'buy' : 'sell';
      addIndicator(
        'SMA 50', sma50, sma50.toFixed(4),
        sig, 1.5,
        `Price ${price > sma50 ? 'above' : 'below'} SMA50 (${sma50.toFixed(4)})`
      );
    }

    // ── SMA 200 vs Price (weight: 2) ──────────────────────────────────
    const sma200 = sma(closeArr, 200);
    if (sma200) {
      const sig = price > sma200 ? 'buy' : 'sell';
      addIndicator(
        'SMA 200', sma200, sma200.toFixed(4),
        sig, 2,
        `Price ${price > sma200 ? 'above' : 'below'} SMA200 — ${price > sma200 ? 'long-term uptrend' : 'long-term downtrend'}`
      );
    }

    // ── EMA 12 vs EMA 26 (weight: 1.5) ───────────────────────────────
    const ema12 = ema(closeArr, 12);
    const ema26 = ema(closeArr, 26);
    if (ema12 && ema26) {
      const sig = ema12 > ema26 ? 'buy' : 'sell';
      addIndicator(
        'EMA 12 / 26', ema12, `${ema12.toFixed(4)} / ${ema26.toFixed(4)}`,
        sig, 1.5,
        `EMA12 ${ema12 > ema26 ? '>' : '<'} EMA26 — ${sig === 'buy' ? 'bullish' : 'bearish'} crossover zone`
      );
    }

    // ── Stochastic (weight: 1) ────────────────────────────────────────
    const stochResult = stochastic(highArr, lowArr, closeArr);
    if (stochResult) {
      addIndicator(
        'Stochastic (14,3)', stochResult.k, `%K ${stochResult.k.toFixed(1)} / %D ${stochResult.d.toFixed(1)}`,
        stochResult.signal, 1,
        stochResult.k < 20 ? 'Stochastic oversold'
          : stochResult.k > 80 ? 'Stochastic overbought'
          : 'Stochastic neutral'
      );
    }

    // ── ATR volatility note (no signal weight, informational) ─────────
    const atrVal = atr(highArr, lowArr, closeArr);
    if (atrVal) {
      const atrPct = (atrVal / price) * 100;
      indicators.push({
        name: 'ATR (14)', value: atrVal, displayValue: atrVal.toFixed(4),
        signal: 'hold', weight: 0,
        note: `Volatility ${atrPct.toFixed(2)}% of price`
      });
    }

    // ── Compute verdict ───────────────────────────────────────────────
    const buyRatio  = totalWeight > 0 ? buyScore  / totalWeight : 0;
    const sellRatio = totalWeight > 0 ? sellScore / totalWeight : 0;
    const score     = Math.round(buyRatio * 100);   // 0–100 (100 = full buy)

    let verdict;
    if      (buyRatio >= 0.60)  verdict = 'buy';
    else if (sellRatio >= 0.60) verdict = 'sell';
    else                        verdict = 'hold';

    // ── Collect human-readable reasons ────────────────────────────────
    const reasons = indicators
      .filter(ind => ind.weight > 0 && ind.note)
      .map(ind => ({ text: ind.note, type: ind.signal }));

    return { verdict, score, indicators, reasons };
  }

  /* ------------------------------------------------------------------ */
  /* Quick signal from price data only (no OHLC needed)                  */
  /* Used for the markets table where we only have close prices.         */
  /* ------------------------------------------------------------------ */
  function quickSignal(change24h, change7d) {
    const score = (change24h || 0) + (change7d || 0) * 0.5;
    if (score > 4)       return 'buy';
    if (score < -4)      return 'sell';
    return 'hold';
  }

  return {
    closes,
    highs,
    lows,
    sma,
    smaSeries,
    ema,
    emaSeries,
    rsi,
    rsiSeries,
    macd,
    bollingerBands,
    bollingerSeries,
    atr,
    stochastic,
    analyze,
    quickSignal,
  };
})();
