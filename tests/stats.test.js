// Pruebas de las funciones estadísticas frente a valores de referencia publicados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EA, close } = require('./helpers');
const S = EA.stats;

// Cuarteto de Anscombe (1973). Valores de referencia: salida de lm() en R para el conjunto I.
const x = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
const y1 = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68];
const y2 = [9.14, 8.14, 8.74, 8.77, 9.26, 8.10, 6.13, 3.10, 9.13, 7.26, 4.74];
const y3 = [7.46, 6.77, 12.74, 7.11, 7.81, 8.84, 6.08, 5.39, 8.15, 6.42, 5.73];

test('Regresión lineal: Anscombe I coincide con R (lm)', () => {
  const m = S.linearRegression(x, y1);
  assert.ok(m.ok);
  assert.ok(close(m.slope, 0.5000909, 1e-6));
  assert.ok(close(m.intercept, 3.0000909, 1e-6));
  assert.ok(close(m.r2, 0.666542, 1e-5));
  assert.ok(close(m.r2adj, 0.629492, 1e-5));
  assert.ok(close(m.s, 1.236603, 1e-5));        // Residual standard error
  assert.ok(close(m.seSlope, 0.117906, 1e-5));
  assert.ok(close(m.seIntercept, 1.124747, 1e-5));
  assert.ok(close(m.tSlope, 4.241455, 1e-5));
  assert.ok(close(m.pSlope, 0.00217, 2e-3));       // R: 0.00217
  assert.ok(close(m.pIntercept, 0.02573, 2e-3));   // R: 0.02573
  assert.ok(close(m.F, 17.98994, 1e-5));
  assert.equal(m.df, 9);
});

test('Anscombe I, II y III comparten pendiente, intercepto y R² (propiedad conocida)', () => {
  const ms = [y1, y2, y3].map(y => S.linearRegression(x, y));
  ms.forEach(m => { assert.ok(Math.abs(m.slope - 0.500) < 1e-3); assert.ok(Math.abs(m.intercept - 3.00) < 3e-3); assert.ok(Math.abs(m.r2 - 0.666) < 2e-3); });
});

test('Distribución t: cuantiles y CDF de referencia', () => {
  assert.ok(close(S.tCrit2(0.05, 15), 2.131450, 1e-6)); // qt(0.975, 15)
  assert.ok(close(S.tCrit2(0.05, 10), 2.228139, 1e-6));
  assert.ok(close(S.tCrit2(0.05, 1), 12.706205, 1e-6));
  assert.ok(close(S.tCrit2(0.05, 120), 1.979930, 1e-6));
  assert.ok(close(S.tCdf(2, 10), 0.9633060, 1e-6));   // pt(2, 10)
  assert.ok(close(S.tPValue2(2.5, 20), 0.02119, 1e-3)); // 2*pt(-2.5, 20)
  assert.equal(S.tCdf(0, 5), 0.5);
});

test('Distribución F: p-value de referencia', () => {
  assert.ok(close(S.fPValue(4.96, 1, 10), 0.0500, 5e-3)); // F crítico 0,05 con (1,10) ≈ 4,96
  assert.ok(close(S.fPValue(17.98994, 1, 9), 0.002170, 2e-3));
});

test('Descriptivos: desviación estándar muestral y poblacional', () => {
  const a = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.ok(close(S.sdPopulation(a), 2));
  assert.ok(close(S.sdSample(a), 2.138090, 1e-6));
  assert.equal(S.median(a), 4.5);
  assert.ok(close(S.quantile([1, 2, 3, 4], 0.25), 1.75)); // PERCENTIL.INC
});

test('Regresión: casos no estimables devuelven motivo, no números', () => {
  assert.equal(S.linearRegression([1, 2], [3, 4]).ok, false);
  const r = S.linearRegression([5, 5, 5, 5], [1, 2, 3, 4]);
  assert.equal(r.ok, false); assert.match(r.reason, /no varía/);
});

test('Regresión: ajuste perfecto, residuos suman cero e intervalo de predicción', () => {
  const xs = [1, 2, 3, 4, 5], ys = xs.map(v => 10 + 3 * v);
  const m = S.linearRegression(xs, ys);
  assert.ok(close(m.slope, 3)); assert.ok(close(m.intercept, 10)); assert.ok(m.perfect); assert.equal(m.pSlope, 0);
  const n = S.linearRegression([1, 2, 3, 4, 5, 6], [2.1, 3.9, 6.2, 7.8, 10.1, 12.2]);
  assert.ok(Math.abs(S.sum(n.residuals)) < 1e-10);
  const pi = n.predictionInterval(3.5), ci = n.confidenceInterval(3.5);
  assert.ok(pi[1] - pi[0] > ci[1] - ci[0]);
});

test('Durbin-Watson', () => {
  assert.ok(close(S.durbinWatson([1, -1, 1, -1]), 3));
  assert.ok(close(S.durbinWatson([1, 1, 1, 1]), 0));
});
