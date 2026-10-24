/*
 * analysis.js — Motor de caracterización y desempeño energético.
 *
 * Mantiene SEPARADOS:
 *   1. Análisis histórico (descriptivos, índice de consumo, línea base, línea meta, indicadores base 100, CUSUM).
 *   2. Seguimiento: ahorro medido en el periodo de seguimiento frente a la línea base.
 *   3. Comparación presupuestal (real vs presupuesto, ajustada por producción).
 *   4. Meta energética corporativa (presupuestada por la empresa), distinta de la línea meta estadística.
 *   5. Oportunidades de mejora (estimaciones, nunca presentadas como ahorros confirmados).
 *
 * Nomenclatura: E = consumo energético real, P = producción real, Ê = consumo estimado por la línea base,
 * Em = consumo según la línea meta, Ep / Pp = consumo / producción presupuestados.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const S = EA.stats || req('./stats.js');
  const U = EA.units || req('./units.js');
  const D = EA.dataset || req('./dataset.js');
  const F = EA.format || req('./format.js');

  const VERSION = '2.0.0';

  function num(v) { if (v === '' || v == null) return null; const r = D.parseNumber(v, ','); return r.value != null ? r.value : null; }
  function cfgNum(v, def) { const n = typeof v === 'number' ? v : num(v); return n == null || !isFinite(n) ? def : n; }
  function sumBy(a, f) { let s = 0; for (const x of a) s += f(x); return s; }

  function equationText(m, eu, pu) {
    if (!m || !m.ok) return '—';
    const b = m.intercept;
    return `E [${eu}] = ${F.auto(m.slope)} × P [${pu}] ${b >= 0 ? '+' : '−'} ${F.auto(Math.abs(b))}`;
  }

  /** Clasifica una desviación relativa con banda de tolerancia: 'favorable' | 'desfavorable' | 'en_linea' | null. */
  function classify(dev, ref, tolPct, lowerIsBetter) {
    if (dev == null || !isFinite(dev)) return null;
    if (ref != null && ref !== 0 && isFinite(ref)) {
      const rel = dev / Math.abs(ref) * 100;
      if (Math.abs(rel) <= tolPct) return 'en_linea';
    } else if (dev === 0) return 'en_linea';
    const better = lowerIsBetter ? dev < 0 : dev > 0;
    return better ? 'favorable' : 'desfavorable';
  }

  function runAnalysis(project, validation) {
    const cfg = Object.assign(D.defaultConfig(), project.config || {});
    const v = validation || D.validateProject(project);
    const eu = U.unitLabel(D.energyUnit(cfg)), pu = U.unitLabel(D.productionUnit(cfg)), icu = eu + '/' + pu;
    const alpha = cfgNum(cfg.alpha, 0.05), r2Thr = cfgNum(cfg.r2Threshold, 0.75);
    const minBase = Math.max(3, Math.round(cfgNum(cfg.minObsBaseline, 6))), minTarget = Math.max(3, Math.round(cfgNum(cfg.minObsTarget, 4)));
    const tol = cfgNum(cfg.tolerancePct, 3), icChg = cfgNum(cfg.icChangePct, 10);
    const price = cfgNum(cfg.energyPrice, null), ef = cfgNum(cfg.emissionFactor, null);
    const R = {
      version: VERSION, generatedAt: new Date().toISOString(), ok: true, units: { energy: eu, production: pu, ic: icu },
      settings: { alpha, r2Threshold: r2Thr, minObsBaseline: minBase, minObsTarget: minTarget, tolerancePct: tol, icChangePct: icChg, base100Convention: cfg.base100Convention, energyPrice: price, currency: cfg.currency, emissionFactor: ef },
      validation: v, quality: [], recommendations: []
    };
    const Q = (level, area, message) => R.quality.push({ level, area, message });
    if (v.blocking.length) { R.ok = false; R.blocking = v.blocking; return R; }

    const obs = v.real.usable.map(r => ({ month: r.month, E: r.E, P: r.P, period: r.period, rowId: r.rowId, note: r.note }));
    const baseObs = obs.filter(o => o.period === 'base');
    const segObs = obs.filter(o => o.period === 'seguimiento');
    R.counts = {
      monthsEntered: v.counts.realEntered, validObservations: v.counts.realValid, excludedByUser: v.counts.realExcludedByUser,
      incomplete: v.counts.realIncomplete, invalid: v.counts.realInvalid, used: obs.length,
      base: baseObs.length, followup: segObs.length
    };
    R.period = obs.length ? { start: obs[0].month, end: obs[obs.length - 1].month, coverage: v.real.coverage } : null;

    // ===== 1. Estadística descriptiva e índice de consumo =====
    R.descriptive = descriptive(obs, icChg);
    R.counts.descriptive = obs.length;
    R.counts.ic = R.descriptive.IC.n;
    if (segObs.length) R.descriptiveByPeriod = { base: descriptive(baseObs, icChg), seguimiento: descriptive(segObs, icChg) };
    if (R.descriptive.IC.zeroProduction) Q('warning', 'Índice de consumo', `${R.descriptive.IC.zeroProduction} mes(es) con producción 0: el índice de consumo no se calcula en esos meses.`);
    if (R.descriptive.IC.cv > 15) Q('info', 'Índice de consumo', `El índice de consumo varía bastante entre meses (CV = ${F.pct(R.descriptive.IC.cv)}). Revise cambios de mezcla de productos, paradas o problemas de medición antes de comparar periodos.`);

    // ===== 2. Línea base =====
    R.baseline = baseline(baseObs, obs, { alpha, r2Thr, minBase, eu, pu, Q });
    R.counts.baseline = R.baseline.n || 0;
    const lb = R.baseline.status === 'ok' ? R.baseline.model : null;

    // ===== 3. Línea meta =====
    R.target = targetLine(baseObs, obs, lb, { minTarget, eu, pu, Q, alpha });
    R.counts.target = R.target.n || 0;
    const tm = R.target.status === 'ok' ? R.target.model : null;

    // ===== 4. Indicadores base 100 y CUSUM =====
    R.indicators = indicators(obs, lb, tm, cfg.base100Convention);

    // ===== 5. Seguimiento (ahorro medido frente a línea base) =====
    R.followup = followup(segObs, lb, R.baseline, { alpha });
    R.counts.followupUsed = R.followup.n || 0;

    // ===== 6. Presupuesto =====
    R.budget = budgetAnalysis(v, obs, lb, R.baseline, { tol, eu, pu, icu });
    R.counts.budget = R.budget.n || 0;

    // ===== 7. Meta corporativa =====
    R.corporateTarget = corporateTarget(cfg.corporateTarget, obs, segObs, lb, { icu });

    // ===== 8. Huella de carbono y huella ecológica =====
    R.footprint = footprint(cfg, obs, segObs, R);

    // ===== 9. Oportunidades =====
    R.opportunities = opportunities(R, obs, baseObs, lb, tm, { price, kE: R.footprint.kE, fh: R.footprint.fh, icChg });

    recommendations(R);
    return R;
  }

  // ---------------------------------------------------------------------------
  function descriptive(obs, icChg) {
    const E = obs.map(o => o.E), P = obs.map(o => o.P);
    const dE = S.describe(E), dP = S.describe(P);
    const icRows = obs.filter(o => o.P > 0);
    const ICs = icRows.map(o => o.E / o.P);
    const dIC = S.describe(ICs);
    const sumE = sumBy(icRows, o => o.E), sumP = sumBy(icRows, o => o.P);
    const monthly = obs.map((o, i) => {
      const prev = i > 0 ? obs[i - 1] : null;
      const consecutive = prev && D.monthIndex(o.month) - D.monthIndex(prev.month) === 1;
      const ic = o.P > 0 ? o.E / o.P : null, icPrev = prev && prev.P > 0 ? prev.E / prev.P : null;
      return {
        month: o.month, period: o.period, E: o.E, P: o.P, IC: ic,
        prevMonth: prev ? prev.month : null, consecutive: !!consecutive,
        dE: prev && prev.E > 0 ? (o.E - prev.E) / prev.E * 100 : null,
        dP: prev && prev.P > 0 ? (o.P - prev.P) / prev.P * 100 : null,
        dIC: ic != null && icPrev ? (ic - icPrev) / icPrev * 100 : null
      };
    });
    const weighted = sumP > 0 ? sumE / sumP : null;
    const notable = [];
    monthly.forEach(m => {
      if (m.IC != null && weighted) {
        const dev = (m.IC - weighted) / weighted * 100;
        m.icVsMean = dev;
        if (Math.abs(dev) > icChg) notable.push({ month: m.month, type: 'ic_vs_promedio', value: dev, text: `IC ${dev > 0 ? 'superior' : 'inferior'} en ${F.pct(Math.abs(dev))} al IC ponderado del periodo` });
      }
      if (m.dIC != null && Math.abs(m.dIC) > icChg) notable.push({ month: m.month, type: 'cambio_ic', value: m.dIC, text: `IC cambió ${F.signedPct(m.dIC)} respecto a ${D.formatMonth(m.prevMonth)}${m.consecutive ? '' : ' (meses no consecutivos)'}` });
    });
    return {
      n: obs.length, E: dE, P: dP,
      IC: Object.assign(dIC, { simpleMean: dIC.mean, weighted, sumE, sumP, zeroProduction: obs.length - icRows.length }),
      corrEP: obs.length >= 3 ? pearson(P, E) : null,
      monthly, notable
    };
  }
  function pearson(x, y) {
    const mx = S.mean(x), my = S.mean(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }

  // ---------------------------------------------------------------------------
  function baseline(baseObs, allObs, o) {
    const n = baseObs.length;
    const out = { n, status: 'ok', reasons: [] };
    if (n < 3) {
      out.status = 'insufficient';
      out.reasons.push(`Hay ${n} observación(es) válida(s) en el periodo base. Una regresión lineal necesita al menos 3 para estimarse y la aplicación exige ${o.minBase} para que el resultado sea defendible. Agregue más meses con consumo y producción medidos.`);
      return out;
    }
    if (n < o.minBase) {
      out.status = 'insufficient';
      out.reasons.push(`Hay ${n} observaciones en el periodo base; el mínimo configurado es ${o.minBase}. Con tan pocos puntos la pendiente y el R² son muy inestables. Agregue meses o reduzca el mínimo en la configuración bajo su responsabilidad.`);
      return out;
    }
    const xs = baseObs.map(b => b.P), ys = baseObs.map(b => b.E);
    const m = S.linearRegression(xs, ys, { alpha: o.alpha });
    if (!m.ok) { out.status = 'invalid'; out.reasons.push(m.reason); return out; }
    out.model = m;
    out.equation = equationText(m, o.eu, o.pu);
    // Evaluación de calidad
    const qa = out.assessment = {
      r2Ok: m.r2 >= o.r2Thr, slopeSignificant: m.pSlope < o.alpha, slopePositive: m.slope > 0,
      interceptPositive: m.intercept > 0, interceptSignificant: m.pIntercept < o.alpha,
      annualCycle: n >= 12, cvP: S.describe(xs).cv
    };
    if (m.perfect) o.Q('warning', 'Línea base', 'El ajuste es perfecto (residuos nulos). Esto suele indicar datos calculados en lugar de medidos; verifique el origen de la información.');
    if (!qa.slopePositive) o.Q('error', 'Línea base', 'La pendiente es negativa o nula: el consumo no aumenta con la producción. El modelo no es físicamente coherente como línea base; revise los datos o la variable de producción elegida.');
    if (!qa.slopeSignificant) o.Q('warning', 'Línea base', `La pendiente no es estadísticamente significativa (p ${F.pEq(m.pSlope)} ≥ ${F.num(o.alpha, 2)}). No hay evidencia suficiente de que la producción explique el consumo; las estimaciones basadas en el modelo son poco confiables.`);
    if (!qa.r2Ok) o.Q('warning', 'Línea base', `R² = ${F.num(m.r2, 3)} es inferior al umbral de referencia configurado (${F.num(o.r2Thr, 2)}). La producción explica una parte limitada de la variación del consumo; considere otras variables (clima, mezcla de productos, horas de operación) o separar por áreas.`);
    if (qa.r2Ok && qa.slopeSignificant) o.Q('info', 'Línea base', `La regresión explica el ${F.pct(m.r2 * 100)} de la variación del consumo (R²) y la pendiente es significativa (p ${F.pEq(m.pSlope)}). Recuerde: un p-value bajo indica relación estadística, no garantiza capacidad predictiva fuera del rango de datos.`);
    if (!qa.annualCycle) o.Q('warning', 'Línea base', `El periodo base tiene ${n} meses (< 12): no cubre un ciclo anual completo y puede omitir efectos estacionales.`);
    if (qa.cvP < 5) o.Q('warning', 'Línea base', `La producción varía poco en el periodo base (CV = ${F.pct(qa.cvP)}). Con un rango estrecho la pendiente se estima con mucha incertidumbre.`);
    if (m.cvrmse > 15) o.Q('info', 'Línea base', `CV(RMSE) = ${F.pct(m.cvrmse)}. Como referencia, ASHRAE Guideline 14 sugiere ≤ 15 % para modelos mensuales usados en medición y verificación.`);
    // Diagnóstico de residuos (no se elimina ninguna observación)
    const out2 = [], lev = [], infl = [];
    m.stdResiduals.forEach((r, i) => { if (Math.abs(r) > 2) out2.push({ month: baseObs[i].month, r }); });
    m.leverage.forEach((h, i) => { if (h > 4 / n) lev.push({ month: baseObs[i].month, h }); });
    m.cooks.forEach((c, i) => { if (c > 4 / n) infl.push({ month: baseObs[i].month, c }); });
    out.diagnostics = { outliers: out2, highLeverage: lev, influential: infl };
    if (out2.length) o.Q('warning', 'Residuos', `Meses con residuo estandarizado |r| > 2: ${out2.map(x => `${D.formatMonth(x.month)} (${F.num(x.r, 2)})`).join(', ')}. Investigue la causa; NO se eliminan automáticamente.`);
    if (infl.length) o.Q('info', 'Residuos', `Meses con influencia alta en la recta (distancia de Cook > 4/n): ${infl.map(x => D.formatMonth(x.month)).join(', ')}. Compruebe que sean representativos.`);
    // Durbin-Watson (solo informativo; requiere orden temporal)
    const gaps = baseObs.some((b, i) => i > 0 && D.monthIndex(b.month) - D.monthIndex(baseObs[i - 1].month) !== 1);
    out.durbinWatson = S.durbinWatson(m.residuals);
    out.dwHasGaps = gaps;
    if (n >= 10 && (out.durbinWatson < 1 || out.durbinWatson > 3)) o.Q('warning', 'Residuos', `Durbin-Watson = ${F.num(out.durbinWatson, 2)}: posible autocorrelación de los residuos (tendencia o cambio estructural). Los p-values e intervalos pueden ser optimistas; revise el gráfico CUSUM.`);
    // Consumo no asociado a la producción (intercepto)
    const meanE = S.mean(ys);
    const extrap = m.xMin > 0 ? m.xMin / (m.xMax - m.xMin) : 0;
    out.nonProduction = {
      E0: m.intercept, sharePct: meanE > 0 ? m.intercept / meanE * 100 : null,
      interpretable: m.intercept > 0 && m.pIntercept < o.alpha && m.slope > 0,
      extrapolationRatio: extrap,
      note: m.intercept <= 0
        ? 'El intercepto es negativo o nulo; no puede interpretarse como consumo no asociado a la producción (probable efecto de extrapolación o de relación no lineal).'
        : m.pIntercept >= o.alpha
          ? 'El intercepto no es estadísticamente distinto de cero; la estimación del consumo no asociado a la producción es incierta.'
          : `Estimación del consumo que se mantendría sin producción (cargas fijas: iluminación, servicios auxiliares, refrigeración, fugas). ${extrap > 1 ? 'Atención: P = 0 está lejos del rango de datos observado, por lo que este valor es una extrapolación.' : ''}`
    };
    // Valores mensuales para todas las observaciones (base y seguimiento)
    const idxBase = new Map(baseObs.map((b, i) => [b.month, i]));
    out.monthly = allObs.map(ob => {
      const est = m.predict(ob.P), pi = m.predictionInterval(ob.P), i = idxBase.get(ob.month);
      const inBase = ob.period === 'base' && i != null;
      return {
        month: ob.month, period: ob.period, E: ob.E, P: ob.P, Eest: est, resid: ob.E - est,
        residPct: est !== 0 ? (ob.E - est) / est * 100 : null, piLow: pi[0], piHigh: pi[1],
        outsidePI: ob.E < pi[0] ? 'debajo' : ob.E > pi[1] ? 'encima' : null,
        inRange: ob.P >= m.xMin && ob.P <= m.xMax,
        stdResid: inBase ? m.stdResiduals[i] : null, leverage: inBase ? m.leverage[i] : null, cooks: inBase ? m.cooks[i] : null
      };
    });
    out.valid = qa.slopePositive && qa.slopeSignificant;
    return out;
  }

  // ---------------------------------------------------------------------------
  function targetLine(baseObs, allObs, lb, o) {
    const out = { status: 'ok', reasons: [], criterion: 'E_real < Ê_línea base (meses del periodo base por debajo de la línea base)' };
    if (!lb) { out.status = 'no_baseline'; out.reasons.push('La línea meta se obtiene a partir de la línea base; sin una línea base calculada no puede construirse.'); return out; }
    const sel = baseObs.map(b => ({ month: b.month, E: b.E, P: b.P, Eest: lb.predict(b.P) })).map(x => Object.assign(x, { selected: x.E < x.Eest }));
    out.selection = sel;
    const pts = sel.filter(x => x.selected);
    out.n = pts.length;
    if (pts.length < o.minTarget) {
      out.status = 'insufficient';
      out.reasons.push(`Solo ${pts.length} mes(es) del periodo base quedaron por debajo de la línea base; se requieren al menos ${o.minTarget} para ajustar la línea meta. Se necesitan más meses históricos (idealmente ≥ 12 en el periodo base, de modo que unos 6 queden por debajo de la línea base).`);
      return out;
    }
    const m = S.linearRegression(pts.map(p => p.P), pts.map(p => p.E), { alpha: o.alpha });
    if (!m.ok) { out.status = 'invalid'; out.reasons.push(m.reason); return out; }
    out.model = m;
    out.equation = equationText(m, o.eu, o.pu);
    if (pts.length < 6) o.Q('warning', 'Línea meta', `La línea meta se ajustó con solo ${pts.length} puntos; sus coeficientes son muy sensibles a cada dato.`);
    if (m.slope <= 0) { o.Q('error', 'Línea meta', 'La pendiente de la línea meta es negativa o nula; no es una referencia coherente. Se muestra solo con fines de diagnóstico.'); out.coherent = false; } else out.coherent = true;
    // ¿Queda por debajo de la línea base en todo el rango observado?
    const xa = lb.xMin, xb = lb.xMax;
    const gapA = lb.predict(xa) - m.predict(xa), gapB = lb.predict(xb) - m.predict(xb);
    out.belowBaselineInRange = gapA >= 0 && gapB >= 0;
    if (!out.belowBaselineInRange) o.Q('warning', 'Línea meta', 'La línea meta cruza la línea base dentro del rango de producción observado; en parte del rango la "meta" sería mayor que la línea base. Interprete con cuidado.');
    o.Q('info', 'Línea meta', 'El R² de la línea meta es descriptivo: los puntos se seleccionaron según su consumo (por debajo de la línea base), por lo que no se reportan p-values inferenciales para este modelo.');
    out.monthly = allObs.map(ob => { const em = m.predict(ob.P); return { month: ob.month, period: ob.period, E: ob.E, P: ob.P, Emeta: em, diff: ob.E - em, diffPct: em !== 0 ? (ob.E - em) / em * 100 : null }; });
    return out;
  }

  // ---------------------------------------------------------------------------
  /**
   * Índice de eficiencia base 100.
   *  Convención 'ref_sobre_real' (predeterminada): IEB100 = E_referencia / E_real × 100 → > 100 es favorable.
   *  Convención 'real_sobre_ref':                   IDEn100 = E_real / E_referencia × 100 → < 100 es favorable.
   */
  function indicators(obs, lb, tm, convention) {
    const conv = convention === 'real_sobre_ref' ? 'real_sobre_ref' : 'ref_sobre_real';
    const idx = (ref, real) => {
      if (ref == null || real == null) return null;
      if (conv === 'ref_sobre_real') return real > 0 ? ref / real * 100 : null;
      return ref > 0 ? real / ref * 100 : null;
    };
    const fav = (i) => i == null ? null : conv === 'ref_sobre_real' ? i >= 100 : i <= 100;
    const out = {
      convention: conv,
      formulaLB: conv === 'ref_sobre_real' ? 'IEB100_LB = Ê_línea base(P) / E_real × 100' : 'IDEn_LB = E_real / Ê_línea base(P) × 100',
      formulaMeta: conv === 'ref_sobre_real' ? 'IEB100_meta = E_meta(P) / E_real × 100' : 'IDEn_meta = E_real / E_meta(P) × 100',
      favorableText: conv === 'ref_sobre_real' ? 'Valores ≥ 100 indican que el consumo real fue igual o menor que la referencia (desempeño favorable); < 100, consumo mayor que la referencia.' : 'Valores ≤ 100 indican que el consumo real fue igual o menor que la referencia (desempeño favorable); > 100, consumo mayor que la referencia.',
      available: !!lb, monthly: [], cusum: []
    };
    if (!lb) return out;
    let cus = 0;
    obs.forEach((o, i) => {
      const est = lb.predict(o.P), em = tm ? tm.predict(o.P) : null;
      const iLB = idx(est, o.E), iM = em != null ? idx(em, o.E) : null;
      cus += o.E - est;
      const gap = i > 0 && D.monthIndex(o.month) - D.monthIndex(obs[i - 1].month) !== 1;
      out.monthly.push({ month: o.month, period: o.period, E: o.E, Eest: est, Emeta: em, iLB, iMeta: iM, favLB: fav(iLB), favMeta: fav(iM) });
      out.cusum.push({ month: o.month, period: o.period, diff: o.E - est, cusum: cus, afterGap: gap });
    });
    const sE = sumBy(obs, o => o.E), sLB = sumBy(obs, o => lb.predict(o.P));
    out.summary = {
      monthsLB: out.monthly.filter(m => m.iLB != null).length,
      favorableLB: out.monthly.filter(m => m.favLB === true).length,
      favorableMeta: tm ? out.monthly.filter(m => m.favMeta === true).length : null,
      aggregateLB: idx(sLB, sE), aggregateMeta: tm ? idx(sumBy(obs, o => tm.predict(o.P)), sE) : null
    };
    return out;
  }

  // ---------------------------------------------------------------------------
  function followup(segObs, lb, baseRes, o) {
    const out = { n: segObs.length, status: 'ok', reasons: [] };
    if (!segObs.length) { out.status = 'none'; out.reasons.push('No hay meses marcados como "seguimiento". Para medir ahorros, marque como seguimiento los meses posteriores a una intervención; la línea base se ajusta solo con el periodo base.'); return out; }
    if (!lb) { out.status = 'no_baseline'; out.reasons.push('No hay línea base calculada; no es posible estimar el consumo esperado del periodo de seguimiento.'); return out; }
    if (!baseRes.valid) out.reasons.push('Advertencia: la línea base no es estadísticamente adecuada (pendiente no significativa o no positiva); el ahorro calculado es poco confiable.');
    out.monthly = segObs.map(s => { const est = lb.predict(s.P); const pi = lb.predictionInterval(s.P); return { month: s.month, E: s.E, P: s.P, Eest: est, saving: est - s.E, savingPct: est > 0 ? (est - s.E) / est * 100 : null, piLow: pi[0], piHigh: pi[1], inRange: s.P >= lb.xMin && s.P <= lb.xMax }; });
    const total = sumBy(out.monthly, m => m.saving), estTot = sumBy(out.monthly, m => m.Eest);
    const se = lb.seOfSumOfNewDifferences(segObs.map(s => s.P));
    const half = lb.tCrit * se;
    out.total = { saving: total, expected: estTot, real: sumBy(segObs, s => s.E), pct: estTot > 0 ? total / estTot * 100 : null, se, ci: [total - half, total + half], significant: Math.abs(total) > half, level: 1 - o.alpha };
    out.outOfRange = out.monthly.filter(m => !m.inRange).map(m => m.month);
    if (out.outOfRange.length) out.reasons.push(`En ${out.outOfRange.length} mes(es) la producción está fuera del rango del periodo base (${out.outOfRange.map(m => D.formatMonth(m)).join(', ')}): el consumo esperado es una extrapolación.`);
    return out;
  }

  // ---------------------------------------------------------------------------
  function budgetAnalysis(v, obs, lb, baseRes, o) {
    const out = { status: 'ok', reasons: [], n: 0 };
    if (!v.hasBudget) { out.status = 'none'; out.reasons.push('No se registraron datos presupuestados. El análisis energético se ejecuta igual con los datos reales.'); return out; }
    if (!v.budgetUnitsOk || !v.budget) { out.status = 'units'; out.reasons.push('Las unidades del presupuesto no son compatibles con las de los datos reales; corrija la configuración de unidades.'); return out; }
    if (v.budget.duplicates.length) { out.status = 'duplicates'; out.reasons.push('Hay meses duplicados en el presupuesto; corríjalos para ejecutar la comparación.'); return out; }
    const bmap = new Map(v.budget.usable.map(b => [b.month, b]));
    const useModel = !!(lb && baseRes.valid);
    out.method = useModel ? 'linea_base' : 'ic_presupuesto';
    out.methodText = useModel
      ? 'El consumo esperado para la producción real se calcula con la línea base (Ê = m·P_real + E0). El presupuesto ajustado a la producción real es Ep + m·(P_real − Pp).'
      : 'Sin línea base válida, el ajuste por producción usa el índice de consumo presupuestado (Ep/Pp × P_real), que supone consumo proporcional a la producción (ignora el consumo fijo).';
    if (!useModel) out.reasons.push('No hay una línea base estadísticamente válida; el ajuste por producción se hace con el índice de consumo presupuestado y es menos preciso.');
    const rows = [];
    obs.forEach(ob => {
      const b = bmap.get(ob.month); if (!b) return;
      const Ep = b.E, Pp = b.P;
      const r = { month: ob.month, period: ob.period, E: ob.E, P: ob.P, Ep, Pp };
      r.dE = Ep != null ? ob.E - Ep : null;
      r.dEpct = Ep != null && Ep > 0 ? r.dE / Ep * 100 : null;
      r.dP = Pp != null ? ob.P - Pp : null;
      r.dPpct = Pp != null && Pp > 0 ? r.dP / Pp * 100 : null;
      r.IC = ob.P > 0 ? ob.E / ob.P : null;
      r.ICp = Ep != null && Pp != null && Pp > 0 ? Ep / Pp : null;
      r.dIC = r.IC != null && r.ICp != null ? r.IC - r.ICp : null;
      r.dICpct = r.dIC != null && r.ICp > 0 ? r.dIC / r.ICp * 100 : null;
      if (useModel) {
        r.Eexp = lb.predict(ob.P);
        r.performance = ob.E - r.Eexp; // efecto desempeño: real vs esperado a la producción real
        if (Ep != null && Pp != null) {
          r.productionEffect = lb.slope * (ob.P - Pp); // efecto volumen según la línea base
          r.budgetVsModel = lb.predict(Pp) - Ep; // diferencia entre lo que el modelo predice para Pp y lo presupuestado
          r.Eflex = Ep + lb.slope * (ob.P - Pp);
        }
      } else if (r.ICp != null) {
        r.Eflex = r.ICp * ob.P;
        r.productionEffect = r.ICp * (ob.P - Pp);
        r.performance = (r.IC - r.ICp) * ob.P; // efecto intensidad
        r.budgetVsModel = 0;
      }
      r.dFlex = r.Eflex != null ? ob.E - r.Eflex : null;
      r.dFlexPct = r.Eflex > 0 ? r.dFlex / r.Eflex * 100 : null;
      r.classRaw = Ep != null ? classify(r.dE, Ep, o.tol, true) : null;
      r.classAdj = r.Eflex != null ? classify(r.dFlex, r.Eflex, o.tol, true) : null;
      r.classIC = r.dIC != null ? classify(r.dIC, r.ICp, o.tol, true) : null;
      r.classPerf = r.performance != null && useModel ? classify(r.performance, r.Eexp, o.tol, true) : null;
      r.explanation = explainBudget(r, o, useModel);
      rows.push(r);
    });
    out.monthly = rows;
    out.n = rows.length;
    if (!rows.length) { out.status = 'no_overlap'; out.reasons.push('Ningún mes tiene a la vez datos reales válidos y presupuesto. Verifique que los meses coincidan (AAAA-MM).'); return out; }
    const both = rows.filter(r => r.Ep != null && r.Pp != null);
    const tot = out.totals = {
      months: rows.length, monthsBoth: both.length,
      E: sumBy(rows.filter(r => r.Ep != null), r => r.E), Ep: sumBy(rows.filter(r => r.Ep != null), r => r.Ep),
      P: sumBy(rows.filter(r => r.Pp != null), r => r.P), Pp: sumBy(rows.filter(r => r.Pp != null), r => r.Pp)
    };
    tot.dE = tot.E - tot.Ep; tot.dEpct = tot.Ep > 0 ? tot.dE / tot.Ep * 100 : null;
    tot.dP = tot.P - tot.Pp; tot.dPpct = tot.Pp > 0 ? tot.dP / tot.Pp * 100 : null;
    const bE = sumBy(both, r => r.E), bP = sumBy(both, r => r.P), bEp = sumBy(both, r => r.Ep), bPp = sumBy(both, r => r.Pp);
    tot.IC = bP > 0 ? bE / bP : null; tot.ICp = bPp > 0 ? bEp / bPp : null;
    tot.dICpct = tot.IC != null && tot.ICp ? (tot.IC - tot.ICp) / tot.ICp * 100 : null;
    if (both.length) {
      tot.decomposition = {
        months: both.length, total: bE - bEp,
        productionEffect: sumBy(both, r => r.productionEffect || 0),
        performance: sumBy(both, r => r.performance || 0),
        budgetVsModel: sumBy(both, r => r.budgetVsModel || 0)
      };
      tot.Eflex = sumBy(both, r => r.Eflex); tot.dFlex = bE - tot.Eflex; tot.dFlexPct = tot.Eflex > 0 ? tot.dFlex / tot.Eflex * 100 : null;
    }
    out.counts = {
      favorableAdj: rows.filter(r => r.classAdj === 'favorable').length, unfavorableAdj: rows.filter(r => r.classAdj === 'desfavorable').length,
      favorableRaw: rows.filter(r => r.classRaw === 'favorable').length, unfavorableRaw: rows.filter(r => r.classRaw === 'desfavorable').length
    };
    // Si el presupuesto cubre los mismos meses con los que se ajustó la línea base, el efecto desempeño total es ≈ 0 por construcción
    out.overlapBase = useModel ? both.filter(r => r.period === 'base').length : 0;
    if (useModel && out.overlapBase > 0) out.reasons.push(`${out.overlapBase} de los ${both.length} meses comparados pertenecen al periodo base con el que se ajustó la línea base. En esos meses la suma del "efecto desempeño" es ≈ 0 por construcción (los residuos de mínimos cuadrados suman cero); los valores mensuales sí son informativos. Para evaluar el desempeño del año presupuestado sin este efecto, marque esos meses como seguimiento y construya la línea base con un periodo anterior.`);
    out.misleading = rows.filter(r => r.classRaw && r.classAdj && r.classRaw !== r.classAdj && r.classRaw !== 'en_linea' && r.classAdj !== 'en_linea').map(r => r.month);
    return out;
  }

  function explainBudget(r, o, useModel) {
    const parts = [];
    const eu = o.eu, pu = o.pu;
    if (r.dE != null) {
      parts.push(r.dE > 0 ? `El consumo superó el presupuesto en ${F.num(r.dE, 0)} ${eu}${r.dEpct != null ? ` (${F.signedPct(r.dEpct)})` : ''}.` : r.dE < 0 ? `El consumo fue ${F.num(-r.dE, 0)} ${eu} menor que el presupuesto${r.dEpct != null ? ` (${F.signedPct(r.dEpct)})` : ''}.` : 'El consumo coincidió con el presupuesto.');
    }
    if (r.dP != null) {
      parts.push(r.dP > 0 ? `La producción superó lo presupuestado en ${F.num(r.dP, 0)} ${pu}${r.dPpct != null ? ` (${F.signedPct(r.dPpct)})` : ''}.` : r.dP < 0 ? `La producción quedó ${F.num(-r.dP, 0)} ${pu} por debajo de lo presupuestado${r.dPpct != null ? ` (${F.signedPct(r.dPpct)})` : ''}.` : 'La producción coincidió con lo presupuestado.');
    }
    if (r.productionEffect != null && r.dE != null && r.dP != null && r.dP !== 0) {
      parts.push(`${useModel ? 'Según la línea base' : 'Con el índice presupuestado'}, esa diferencia de producción explica ${F.signed(r.productionEffect, 0)} ${eu} de consumo.`);
    }
    if (r.dFlex != null) {
      const adjTxt = Math.abs(r.dFlexPct || 0) <= o.tol
        ? `Ajustado por la producción real, el consumo está en línea con el presupuesto (${F.signedPct(r.dFlexPct)}, dentro de ±${F.num(o.tol, 1)} %).`
        : r.dFlex > 0 ? `Ajustado por la producción real, el consumo quedó ${F.num(r.dFlex, 0)} ${eu} por encima de lo previsto (${F.signedPct(r.dFlexPct)}).`
          : `Ajustado por la producción real, el consumo quedó ${F.num(-r.dFlex, 0)} ${eu} por debajo de lo previsto (${F.signedPct(r.dFlexPct)}).`;
      parts.push(adjTxt);
      // Conclusión
      if (r.dE != null && r.dE > 0 && r.dFlex <= 0) parts.push('Conclusión: el mayor consumo se relaciona con el mayor nivel de producción, no con un peor desempeño energético.');
      else if (r.dE != null && r.dE < 0 && r.dFlex > 0 && Math.abs(r.dFlexPct) > o.tol) parts.push('Conclusión: aunque el consumo quedó bajo el presupuesto, fue mayor de lo esperado para la producción alcanzada; el menor consumo se debe a la menor producción.');
      else if (r.dFlex > 0 && Math.abs(r.dFlexPct) > o.tol) parts.push('Conclusión: hay una desviación desfavorable que no se explica por el volumen de producción; conviene revisar la operación de ese mes (la causa no está verificada).');
      else if (r.dFlex < 0 && Math.abs(r.dFlexPct) > o.tol) parts.push('Conclusión: el desempeño energético fue mejor que el previsto para el volumen producido.');
    }
    if (useModel && r.budgetVsModel != null && r.Ep > 0 && Math.abs(r.budgetVsModel / r.Ep * 100) > o.tol) {
      parts.push(`Nota: para la producción presupuestada, la línea base predice ${F.num(r.Ep + r.budgetVsModel, 0)} ${eu}; el presupuesto (${F.num(r.Ep, 0)} ${eu}) ${r.budgetVsModel > 0 ? 'supone un desempeño mejor que el histórico' : 'es menos exigente que el histórico'}.`);
    }
    return parts.join(' ');
  }

  // ---------------------------------------------------------------------------
  function corporateTarget(ct, obs, segObs, lb, o) {
    const out = { type: (ct && ct.type) || 'none', status: 'none', reasons: [] };
    if (!ct || ct.type === 'none' || ct.type == null) { out.reasons.push('No se definió una meta energética corporativa. (Es distinta de la línea meta estadística.)'); return out; }
    const val = cfgNum(ct.value, null);
    out.value = val; out.description = ct.description || '';
    if (val == null) { out.status = 'invalid'; out.reasons.push('Indique el valor numérico de la meta.'); return out; }
    const evalObs = segObs.length ? segObs : obs;
    out.scope = segObs.length ? 'seguimiento' : 'todo el periodo';
    if (ct.type === 'ic') {
      if (!(val > 0)) { out.status = 'invalid'; out.reasons.push('El índice de consumo objetivo debe ser mayor que 0.'); return out; }
      const rows = evalObs.filter(x => x.P > 0).map(x => ({ month: x.month, E: x.E, P: x.P, IC: x.E / x.P, target: val, Etarget: val * x.P, meets: x.E / x.P <= val }));
      const sE = sumBy(rows, r => r.E), sP = sumBy(rows, r => r.P);
      out.monthly = rows; out.status = 'ok';
      out.summary = { months: rows.length, meets: rows.filter(r => r.meets).length, IC: sP > 0 ? sE / sP : null, target: val, gapEnergy: sE - val * sP, achieved: sP > 0 && sE / sP <= val };
      out.text = `Meta: índice de consumo ≤ ${F.auto(val)} ${o.icu}.`;
    } else if (ct.type === 'reduccion') {
      if (!lb) { out.status = 'no_baseline'; out.reasons.push('Una meta de reducción respecto a la línea base requiere una línea base calculada.'); return out; }
      const f = 1 - val / 100;
      const rows = evalObs.map(x => { const est = lb.predict(x.P); return { month: x.month, E: x.E, P: x.P, Eest: est, Etarget: est * f, meets: x.E <= est * f, reduction: est > 0 ? (est - x.E) / est * 100 : null }; });
      const sE = sumBy(rows, r => r.E), sT = sumBy(rows, r => r.Etarget), sEst = sumBy(rows, r => r.Eest);
      out.monthly = rows; out.status = 'ok';
      out.summary = { months: rows.length, meets: rows.filter(r => r.meets).length, reductionAchieved: sEst > 0 ? (sEst - sE) / sEst * 100 : null, target: val, gapEnergy: sE - sT, achieved: sE <= sT };
      out.text = `Meta: reducir ${F.num(val, 1)} % el consumo respecto a la línea base.`;
      if (!segObs.length) out.reasons.push('No hay periodo de seguimiento: la meta se evalúa sobre los mismos meses usados para construir la línea base, donde la reducción promedio es 0 % por construcción. Marque meses de seguimiento para una evaluación significativa.');
    } else { out.status = 'invalid'; out.reasons.push('Tipo de meta no reconocido.'); }
    return out;
  }

  // ---------------------------------------------------------------------------
  /**
   * Huella de carbono [t CO₂] = E × factor de emisión (convertido a la unidad de energía del proyecto).
   * Huella ecológica [ha] = huella de carbono [t CO₂] × factor de huella [ha/t CO₂].
   */
  function footprint(cfg, obs, segObs, R) {
    const out = { status: 'ok', reasons: [], kE: null, fh: null };
    const fe = cfgNum(cfg.emissionFactor, null), fh = cfgNum(cfg.footprintFactor, null);
    const mass = cfg.emissionFactorMass === 'kg' ? 0.001 : 1;
    const projU = D.energyUnit(cfg);
    const perU = !cfg.emissionFactorPer || cfg.emissionFactorPer === 'project' ? projU : cfg.emissionFactorPer;
    out.fe = fe; out.fh = fh;
    out.feLabel = `${cfg.emissionFactorMass === 'kg' ? 'kg' : 't'} CO₂/${U.unitLabel(perU)}`;
    out.fhLabel = 'ha/t CO₂';
    if (fe == null) { out.status = 'none'; out.reasons.push('No se indicó factor de emisión; la huella de carbono y la huella ecológica no se calculan.'); return out; }
    if (fe < 0 || (fh != null && fh < 0)) { out.status = 'invalid'; out.reasons.push('Los factores de emisión y de huella no pueden ser negativos.'); return out; }
    const conv = U.factor(projU, perU);
    if (conv == null) { out.status = 'units'; out.reasons.push(`El factor de emisión está expresado por ${U.unitLabel(perU)} y el consumo en ${U.unitLabel(projU)}; no son convertibles. Indique un factor por ${U.unitLabel(projU)}.`); return out; }
    const kE = out.kE = conv * fe * mass; // t CO₂ por unidad de energía del proyecto
    const toKWh = U.factor(perU, 'kWh');
    out.feTPerKWh = toKWh != null ? fe * mass / toKWh : null; // factor normalizado a t CO₂/kWh (para comparar empresas)
    out.monthly = obs.map(o => { const t = o.E * kE; return { month: o.month, period: o.period, E: o.E, P: o.P, tco2: t, ha: fh != null ? t * fh : null, tco2PerP: o.P > 0 ? t / o.P : null, haPerP: fh != null && o.P > 0 ? t * fh / o.P : null }; });
    const tot = rows => { const t = sumBy(rows, r => r.tco2), p = sumBy(rows, r => r.P), e = sumBy(rows, r => r.E); return { months: rows.length, E: e, P: p, tco2: t, ha: fh != null ? t * fh : null, tco2PerP: p > 0 ? t / p : null, haPerP: fh != null && p > 0 ? t * fh / p : null, tco2Month: rows.length ? t / rows.length : null, haMonth: fh != null && rows.length ? t * fh / rows.length : null }; };
    out.total = tot(out.monthly);
    if (segObs.length) { out.base = tot(out.monthly.filter(m => m.period === 'base')); out.seguimiento = tot(out.monthly.filter(m => m.period === 'seguimiento')); }
    if (R.followup.status === 'ok') out.avoided = { tco2: R.followup.total.saving * kE, ha: fh != null ? R.followup.total.saving * kE * fh : null, ci: R.followup.total.ci.map(v => v * kE) };
    return out;
  }

  // ---------------------------------------------------------------------------
  function opportunities(R, obs, baseObs, lb, tm, o) {
    const out = { items: [], monthsAbove: [], icChanges: R.descriptive.notable.filter(n => n.type === 'cambio_ic') };
    const money = (e) => o.price != null && e != null ? e * o.price : null;
    const co2 = (e) => o.kE != null && e != null ? e * o.kE : null;
    const ha = (e) => o.kE != null && o.fh != null && e != null ? e * o.kE * o.fh : null;
    if (lb) {
      const rows = R.baseline.monthly;
      const above = rows.filter(r => r.resid > 0);
      const sig = rows.filter(r => r.outsidePI === 'encima');
      const ev = sumBy(above, r => r.resid);
      out.monthsAbove = above.slice().sort((a, b) => b.resid - a.resid).map(r => ({ month: r.month, period: r.period, excess: r.resid, excessPct: r.residPct, significant: r.outsidePI === 'encima' }));
      out.items.push({
        key: 'evitable_lb', title: 'Energía potencialmente evitable según la línea base', kind: 'estimación',
        energy: ev, months: above.length, money: money(ev), co2: co2(ev), ha: ha(ev), pctOfTotal: sumBy(obs, x => x.E) > 0 ? ev / sumBy(obs, x => x.E) * 100 : null,
        text: `Suma de los excesos de consumo sobre lo esperado en los ${above.length} meses que quedaron por encima de la línea base. ${sig.length} de ellos superan el intervalo de predicción del ${F.num((1 - R.settings.alpha) * 100, 0)} %, es decir, su exceso difícilmente se explica por la variabilidad normal. Es una estimación del modelo: en el periodo base, por construcción, los excesos se compensan con los meses por debajo de la línea.`
      });
    }
    if (tm) {
      const sE = sumBy(baseObs, x => x.E), sM = sumBy(baseObs, x => tm.predict(x.P));
      const pot = sE - sM;
      out.items.push({
        key: 'potencial_meta', title: 'Mejora potencial respecto a la línea meta', kind: 'estimación',
        energy: pot, pctOfTotal: sE > 0 ? pot / sE * 100 : null, months: baseObs.length, money: money(pot), co2: co2(pot), ha: ha(pot),
        text: `Diferencia entre el consumo real del periodo base y el que se habría tenido operando todos los meses como los mejores meses observados (línea meta). Representa un potencial de mejora de referencia, no un ahorro garantizado.`
      });
    }
    if (R.followup.status === 'ok') {
      const t = R.followup.total;
      out.items.push({
        key: 'ahorro_medido', title: 'Ahorro medido en el periodo de seguimiento', kind: 'medición frente a modelo',
        energy: t.saving, pctOfTotal: t.pct, months: R.followup.n, money: money(t.saving), co2: co2(t.saving), ha: ha(t.saving), ci: t.ci, significant: t.significant,
        text: `Consumo esperado por la línea base para la producción real del seguimiento menos el consumo medido. Intervalo del ${F.num(t.level * 100, 0)} %: ${F.num(t.ci[0], 0)} a ${F.num(t.ci[1], 0)} ${R.units.energy}. ${t.significant ? 'El ahorro es estadísticamente distinguible de cero.' : 'El resultado NO es estadísticamente distinguible de cero.'} Se basa en mediciones, pero solo puede considerarse "verificado" si se sigue un plan de medición y verificación (M&V) acordado y revisado por un tercero.`
      });
    }
    if (R.budget.status === 'ok' && R.budget.totals) {
      const t = R.budget.totals;
      out.items.push({
        key: 'desv_presupuesto', title: 'Desviación respecto al presupuesto', kind: 'comparación presupuestal',
        energy: t.dE, pctOfTotal: t.dEpct, months: t.months, money: money(t.dE), co2: co2(t.dE), ha: ha(t.dE), adjusted: t.dFlex, adjustedPct: t.dFlexPct,
        text: `Consumo real menos consumo presupuestado (desviación bruta). Ajustada por la producción real, la desviación es ${t.dFlex != null ? F.signed(t.dFlex, 0) + ' ' + R.units.energy : 'no calculable'}. Un valor positivo es mayor consumo que el presupuesto; no implica por sí solo ineficiencia.`
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  function recommendations(R) {
    const rec = R.recommendations;
    const b = R.baseline;
    if (R.counts.used < 12) rec.push({ priority: 'alta', text: `Amplíe la serie histórica: hay ${R.counts.used} meses válidos. Con al menos 12 (idealmente 24) meses se capturan los efectos estacionales y la línea base es más robusta.` });
    if (b.status !== 'ok') { rec.push({ priority: 'alta', text: 'Complete los datos del periodo base para poder construir la línea base energética.' }); return; }
    if (!b.assessment.r2Ok || !b.assessment.slopeSignificant) rec.push({ priority: 'alta', text: 'La producción por sí sola no explica bien el consumo. Hipótesis a verificar: influencia del clima, mezcla de productos, horas de operación o problemas de medición. Considere submedición por áreas o un modelo con más variables.' });
    if (b.nonProduction && b.nonProduction.interpretable && b.nonProduction.sharePct > 30) rec.push({ priority: 'media', text: `El consumo no asociado a la producción representa ≈ ${F.pct(b.nonProduction.sharePct, 0)} del consumo medio. Hipótesis a verificar: cargas base en paradas (aire comprimido y fugas, refrigeración, iluminación, servicios auxiliares).` });
    if (b.diagnostics && b.diagnostics.outliers.length) rec.push({ priority: 'media', text: `Investigue los meses con residuos altos (${b.diagnostics.outliers.map(x => D.formatMonth(x.month)).join(', ')}): confirme la medición y documente eventos operacionales. Excluya un mes solo si se demuestra que no es representativo, registrando el motivo.` });
    const top = R.opportunities.monthsAbove.filter(m => m.significant);
    if (top.length) rec.push({ priority: 'media', text: `Priorice el análisis de causas en los meses con consumo significativamente superior a la línea base: ${top.map(m => D.formatMonth(m.month)).join(', ')}.` });
    const pot = R.opportunities.items.find(i => i.key === 'potencial_meta');
    if (pot && pot.pctOfTotal > 0) rec.push({ priority: 'media', text: `Use la línea meta como referencia operativa: replicar las condiciones de los mejores meses sugiere un potencial de ≈ ${F.pct(pot.pctOfTotal)} del consumo del periodo base (estimación, a confirmar con un plan de acción y mediciones).` });
    if (R.budget.status === 'ok' && R.budget.misleading && R.budget.misleading.length) rec.push({ priority: 'media', text: `En ${R.budget.misleading.length} mes(es) la comparación bruta con el presupuesto y la ajustada por producción dan conclusiones opuestas. Evalúe el desempeño con la desviación ajustada, no con la bruta.` });
    if (R.followup.status === 'none') rec.push({ priority: 'baja', text: 'Cuando implemente medidas de ahorro, registre los meses posteriores como "seguimiento" para cuantificar el ahorro frente a la línea base.' });
    rec.push({ priority: 'baja', text: 'Actualice la línea base cuando cambien de forma estructural los equipos, procesos o productos (cambio de condiciones estáticas).' });
  }

  const api = { VERSION, runAnalysis, classify, equationText };
  EA.analysis = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
