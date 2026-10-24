/*
 * stats.js — Funciones estadísticas puras (sin dependencias).
 * Se usan tanto en el navegador (window.EA.stats) como en Node (require).
 *
 * Contenido:
 *  - Descriptivos: suma, media, desviación estándar muestral (n-1) y poblacional, mínimo, máximo, mediana.
 *  - Distribuciones: t de Student (CDF, p-value bilateral, cuantil) y F (p-value) a partir de la
 *    función beta incompleta regularizada (algoritmo de fracciones continuas de Lentz).
 *  - Regresión lineal simple por mínimos cuadrados ordinarios (MCO) con diagnóstico completo.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});

  // ---------- Descriptivos ----------
  function sum(a) { let s = 0; for (const v of a) s += v; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }
  /** Desviación estándar muestral (equivale a DESVEST.M / STDEV.S de Excel). */
  function sdSample(a) {
    if (a.length < 2) return NaN;
    const m = mean(a); let ss = 0; for (const v of a) ss += (v - m) * (v - m);
    return Math.sqrt(ss / (a.length - 1));
  }
  /** Desviación estándar poblacional (equivale a DESVEST.P / STDEV.P de Excel). */
  function sdPopulation(a) {
    if (a.length < 1) return NaN;
    const m = mean(a); let ss = 0; for (const v of a) ss += (v - m) * (v - m);
    return Math.sqrt(ss / a.length);
  }
  function median(a) {
    if (!a.length) return NaN;
    const s = a.slice().sort((x, y) => x - y); const k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }
  /** Cuantil con interpolación lineal (método 7, igual que PERCENTIL.INC de Excel). */
  function quantile(a, q) {
    if (!a.length) return NaN;
    const s = a.slice().sort((x, y) => x - y); const h = (s.length - 1) * q;
    const lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  }
  function argMin(a) { let k = -1; for (let i = 0; i < a.length; i++) if (k < 0 || a[i] < a[k]) k = i; return k; }
  function argMax(a) { let k = -1; for (let i = 0; i < a.length; i++) if (k < 0 || a[i] > a[k]) k = i; return k; }

  function describe(a) {
    const n = a.length;
    if (!n) return { n: 0 };
    const m = mean(a), sd = sdSample(a);
    const iMin = argMin(a), iMax = argMax(a);
    return {
      n, sum: sum(a), mean: m, sd, sdPop: sdPopulation(a), cv: (n > 1 && m !== 0) ? sd / Math.abs(m) * 100 : NaN,
      min: a[iMin], max: a[iMax], iMin, iMax, median: median(a), q1: quantile(a, 0.25), q3: quantile(a, 0.75)
    };
  }

  // ---------- Funciones especiales ----------
  /** ln Γ(x) por aproximación de Lanczos (g=7, n=9). Precisión ~1e-15. */
  function logGamma(x) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1; let a = c[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  /** Fracción continua para la beta incompleta (Lentz modificado). */
  function betacf(x, a, b) {
    const MAXIT = 300, EPS = 1e-15, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  /** Beta incompleta regularizada I_x(a,b). */
  function incBeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
    return 1 - bt * betacf(1 - x, b, a) / b;
  }

  // ---------- Distribuciones ----------
  /** CDF de la t de Student con df grados de libertad. */
  function tCdf(t, df) {
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    const x = df / (df + t * t);
    const tail = 0.5 * incBeta(x, df / 2, 0.5);
    return t >= 0 ? 1 - tail : tail;
  }
  /** p-value bilateral para un estadístico t (equivale a DISTR.T.2C / T.DIST.2T de Excel). */
  function tPValue2(t, df) {
    if (!isFinite(t)) return 0;
    return incBeta(df / (df + t * t), df / 2, 0.5);
  }
  /** Cuantil de la t: devuelve t tal que P(T <= t) = p. Bisección + Newton (tolerancia 1e-12). */
  function tInv(p, df) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    if (p === 0.5) return 0;
    if (p < 0.5) return -tInv(1 - p, df);
    let lo = 0, hi = 1;
    while (tCdf(hi, df) < p) { hi *= 2; if (hi > 1e8) break; }
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (tCdf(mid, df) < p) lo = mid; else hi = mid;
      if (hi - lo < 1e-13 * Math.max(1, hi)) break;
    }
    return (lo + hi) / 2;
  }
  /** Valor crítico bilateral: t_{1-alpha/2, df} (equivale a INV.T.2C / T.INV.2T de Excel). */
  function tCrit2(alpha, df) { return tInv(1 - alpha / 2, df); }
  /** p-value de la cola superior de la F(d1, d2). */
  function fPValue(F, d1, d2) {
    if (!isFinite(F)) return 0; if (F <= 0) return 1;
    return incBeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
  }

  // ---------- Regresión lineal simple ----------
  /**
   * Ajusta y = b0 + b1·x por MCO.
   * Devuelve { ok:false, reason } si no es estimable (n<3 o x constante).
   * Todos los estadísticos usan gl = n - 2 (dos parámetros estimados).
   */
  function linearRegression(xs, ys, opts) {
    const alpha = (opts && opts.alpha) || 0.05;
    const n = xs.length;
    if (n !== ys.length) return { ok: false, reason: 'Las series x e y tienen longitudes diferentes.' };
    if (n < 3) return { ok: false, reason: 'Se requieren al menos 3 observaciones para estimar la recta y su error (gl = n − 2 ≥ 1).', n };
    const xm = mean(xs), ym = mean(ys);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - xm, dy = ys[i] - ym; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (!(sxx > 0)) return { ok: false, reason: 'La variable independiente no varía (todas las producciones son iguales); la pendiente no es estimable.', n };
    const slope = sxy / sxx;
    const intercept = ym - slope * xm;
    const fitted = xs.map(x => intercept + slope * x);
    const residuals = ys.map((y, i) => y - fitted[i]);
    let sse = 0; for (const e of residuals) sse += e * e;
    const sst = syy, ssr = Math.max(0, sst - sse);
    const df = n - 2;
    const mse = sse / df;
    const s = Math.sqrt(mse); // error estándar de la regresión (= ERROR.TIPICO.XY / STEYX)
    const r2 = sst > 0 ? 1 - sse / sst : NaN;
    const r2adj = sst > 0 ? 1 - (1 - r2) * (n - 1) / df : NaN;
    const r = sst > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
    const seSlope = s / Math.sqrt(sxx);
    const seIntercept = s * Math.sqrt(1 / n + xm * xm / sxx);
    const perfect = sse <= 1e-18 * Math.max(1, sst);
    const tSlope = perfect ? (slope === 0 ? 0 : Infinity * Math.sign(slope)) : slope / seSlope;
    const tIntercept = perfect ? (intercept === 0 ? 0 : Infinity * Math.sign(intercept)) : intercept / seIntercept;
    const pSlope = tPValue2(tSlope, df);
    const pIntercept = tPValue2(tIntercept, df);
    const F = perfect ? Infinity : (ssr / 1) / mse;
    const pF = fPValue(F, 1, df);
    const tc = tCrit2(alpha, df);
    const leverage = xs.map(x => 1 / n + (x - xm) * (x - xm) / sxx);
    const stdResiduals = residuals.map((e, i) => (s > 0 && leverage[i] < 1) ? e / (s * Math.sqrt(1 - leverage[i])) : NaN);
    const cooks = stdResiduals.map((r_, i) => isFinite(r_) ? (r_ * r_ / 2) * leverage[i] / (1 - leverage[i]) : NaN);
    const rmse = Math.sqrt(sse / n);
    const cvrmse = ym !== 0 ? s / Math.abs(ym) * 100 : NaN; // CV(RMSE) con gl n-p (criterio ASHRAE Guideline 14)
    let mapeSum = 0, mapeN = 0; for (let i = 0; i < n; i++) if (ys[i] !== 0) { mapeSum += Math.abs(residuals[i] / ys[i]); mapeN++; }
    const xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);

    const model = {
      ok: true, n, df, alpha, slope, intercept, r, r2, r2adj, s, mse, sse, sst, ssr, sxx, sxy, xMean: xm, yMean: ym,
      seSlope, seIntercept, tSlope, tIntercept, pSlope, pIntercept, F, pF, tCrit: tc, perfect,
      ciSlope: [slope - tc * seSlope, slope + tc * seSlope],
      ciIntercept: [intercept - tc * seIntercept, intercept + tc * seIntercept],
      fitted, residuals, leverage, stdResiduals, cooks, rmse, cvrmse, mape: mapeN ? mapeSum / mapeN * 100 : NaN,
      xMin: xmin, xMax: xmax
    };
    model.predict = x => intercept + slope * x;
    /** Intervalo de predicción (1-alpha) para una nueva observación en x. */
    model.predictionInterval = function (x) {
      const yhat = intercept + slope * x;
      const half = tc * s * Math.sqrt(1 + 1 / n + (x - xm) * (x - xm) / sxx);
      return [yhat - half, yhat + half];
    };
    /** Intervalo de confianza (1-alpha) para la media de y en x. */
    model.confidenceInterval = function (x) {
      const yhat = intercept + slope * x;
      const half = tc * s * Math.sqrt(1 / n + (x - xm) * (x - xm) / sxx);
      return [yhat - half, yhat + half];
    };
    /**
     * Error estándar de la suma de m diferencias (ŷ_i − y_i) en observaciones nuevas e independientes:
     * Var = s²·[ m + m²/n + (Σ(x_i − x̄))² / Sxx ]. Supone residuos independientes (sin autocorrelación).
     */
    model.seOfSumOfNewDifferences = function (newXs) {
      const m = newXs.length; let sdx = 0; for (const x of newXs) sdx += (x - xm);
      return s * Math.sqrt(m + m * m / n + sdx * sdx / sxx);
    };
    return model;
  }

  /** Estadístico de Durbin-Watson sobre residuos en orden temporal. */
  function durbinWatson(res) {
    if (res.length < 3) return NaN;
    let num = 0, den = 0;
    for (let i = 0; i < res.length; i++) { den += res[i] * res[i]; if (i > 0) num += (res[i] - res[i - 1]) ** 2; }
    return den > 0 ? num / den : NaN;
  }

  const api = { sum, mean, sdSample, sdPopulation, median, quantile, argMin, argMax, describe, logGamma, incBeta,
    tCdf, tPValue2, tInv, tCrit2, fPValue, linearRegression, durbinWatson };
  EA.stats = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
