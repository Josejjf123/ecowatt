/*
 * dataset.js — Modelo de proyecto, interpretación de meses y números, y validación de datos.
 * No reemplaza datos ausentes por cero ni inventa valores: los registros incompletos o inválidos
 * se excluyen de los cálculos y se informan al usuario.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});
  const U = EA.units || (typeof require !== 'undefined' ? require('./units.js') : null);
  const S = EA.stats || (typeof require !== 'undefined' ? require('./stats.js') : null);

  // ---------- Meses ----------
  const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONTH_TOKENS = {
    ene: 1, enero: 1, jan: 1, january: 1, feb: 2, febrero: 2, february: 2, mar: 3, marzo: 3, march: 3,
    abr: 4, abril: 4, apr: 4, april: 4, may: 5, mayo: 5, jun: 6, junio: 6, june: 6, jul: 7, julio: 7, july: 7,
    ago: 8, agosto: 8, aug: 8, august: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, september: 9,
    oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, dic: 12, diciembre: 12, dec: 12, december: 12
  };
  function pad2(n) { return String(n).padStart(2, '0'); }
  function mk(y, m) { return (y >= 1900 && y <= 2200 && m >= 1 && m <= 12) ? `${y}-${pad2(m)}` : null; }
  function fixYear(y) { y = Number(y); return y < 100 ? 2000 + y : y; }
  /** Convierte un número de serie de fecha de Excel (sistema 1900) en 'AAAA-MM'. */
  function excelSerialToMonth(serial) {
    const ms = Math.round((serial - 25569) * 86400000); // 25569 = 1970-01-01
    const d = new Date(ms); return mk(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  /**
   * Interpreta un mes en múltiples formatos: '2024-01', '2024/1', '01/2024', '1-2024', '15/01/2024',
   * 'ene-2024', 'enero 2024', 'Jan 24', '202401', objetos Date y números de serie de Excel.
   * Devuelve 'AAAA-MM' o null.
   */
  function parseMonth(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return mk(v.getFullYear(), v.getMonth() + 1);
    if (typeof v === 'number') {
      if (v >= 190001 && v <= 220012 && Number.isInteger(v)) return mk(Math.floor(v / 100), v % 100);
      if (v > 1000 && v < 100000) return excelSerialToMonth(v);
      return null;
    }
    let s = String(v).trim().toLowerCase().replace(/\.(?=\s|-|\/|$)/g, '').replace(/\s+de\s+/g, ' ');
    let m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?(?:[ t].*)?$/))) return mk(+m[1], +m[2]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) return mk(+m[3], +m[2]); // dd/mm/aaaa
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{4})$/))) return mk(+m[2], +m[1]);
    if ((m = s.match(/^(\d{4})(\d{2})$/))) return mk(+m[1], +m[2]);
    if ((m = s.match(/^([a-záéíóúñ]+)[\s\-\/.]*(\d{2}|\d{4})$/))) { const mm = MONTH_TOKENS[m[1]]; return mm ? mk(fixYear(m[2]), mm) : null; }
    if ((m = s.match(/^(\d{4})[\s\-\/.]*([a-záéíóúñ]+)$/))) { const mm = MONTH_TOKENS[m[2]]; return mm ? mk(+m[1], mm) : null; }
    if ((m = s.match(/^\d{1,2}[\s\-\/.]+([a-záéíóúñ]+)[\s\-\/.]+(\d{2}|\d{4})$/))) { const mm = MONTH_TOKENS[m[1]]; return mm ? mk(fixYear(m[2]), mm) : null; }
    if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 1000 && n < 100000) return excelSerialToMonth(n); }
    return null;
  }
  function monthIndex(ym) { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); }
  function monthFromIndex(i) { return `${Math.floor(i / 12)}-${pad2(i % 12 + 1)}`; }
  function addMonths(ym, k) { return monthFromIndex(monthIndex(ym) + k); }
  function formatMonth(ym, long) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return String(ym || '');
    const [y, m] = ym.split('-').map(Number);
    return (long ? MONTH_NAMES[m - 1] : MONTH_ABBR[m - 1]) + ' ' + y;
  }

  // ---------- Números ----------
  /**
   * Interpreta un número escrito por el usuario o importado.
   * decimalSep: ',' (convención es-CO, por defecto) o '.'.
   * Reglas: si aparecen ambos separadores, el último es el decimal. Si solo aparece uno, se interpreta
   * como separador de miles únicamente cuando forma grupos exactos de 3 dígitos y no coincide con el
   * separador decimal elegido; en otro caso es decimal.
   * Devuelve { value:number } o { error:string } o { empty:true }.
   */
  function parseNumber(v, decimalSep) {
    if (v == null) return { empty: true };
    if (typeof v === 'number') return isFinite(v) ? { value: v } : { error: 'Valor no numérico' };
    let s = String(v).trim().replace(/[\s  ]/g, '').replace(/^\$|COP$/i, '');
    if (s === '' || s === '-' ) return { empty: true };
    if (/^(n\/?a|nd|s\/d|null|nan|#n\/a|#¡valor!|#value!|-+)$/i.test(s)) return { empty: true, note: 'Marcado como no disponible' };
    const dec = decimalSep === '.' ? '.' : ',';
    const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
    s = s.replace(/^\(|\)$/g, '').replace(/^[-+]/, '');
    if (!/^[\d.,]+([eE][-+]?\d+)?$/.test(s)) return { error: `"${v}" no es un número válido` };
    const hasDot = s.includes('.'), hasComma = s.includes(',');
    let norm;
    if (hasDot && hasComma) {
      const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
      const decChar = s[last], thou = decChar === '.' ? ',' : '.';
      if (s.split(decChar).length > 2) return { error: `"${v}" tiene separadores ambiguos` };
      norm = s.split(thou).join('').replace(decChar, '.');
    } else if (hasDot || hasComma) {
      const ch = hasDot ? '.' : ',';
      const parts = s.split(ch);
      const grouping = parts.length >= 2 && /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every(p => /^\d{3}$/.test(p));
      if (parts.length > 2) {
        if (!grouping) return { error: `"${v}" tiene separadores ambiguos` };
        norm = parts.join('');
      } else if (grouping && ch !== dec) {
        norm = parts.join(''); // p. ej. "1.234" con decimal ',' → 1234
      } else {
        norm = parts[0] + '.' + parts[1];
      }
    } else norm = s;
    const n = Number(norm);
    if (!isFinite(n)) return { error: `"${v}" no es un número válido` };
    return { value: neg ? -n : n };
  }

  // ---------- Proyecto ----------
  let _id = 0;
  function uid(prefix) { _id++; return (prefix || 'r') + Date.now().toString(36) + _id.toString(36); }

  function defaultConfig() {
    return {
      energyType: 'electricidad', energyUnit: 'kWh', energyUnitCustom: '',
      productionUnit: 'L', productionUnitCustom: '', productionLabel: 'Producción',
      budgetEnergyUnit: '', budgetProductionUnit: '', // vacío = misma unidad que los datos reales
      decimalSep: ',',
      base100Convention: 'ref_sobre_real', // IEB100 = E_ref / E_real × 100 (>100 favorable); alternativa 'real_sobre_ref'
      r2Threshold: 0.75, alpha: 0.05, minObsBaseline: 6, minObsTarget: 4,
      tolerancePct: 3, icChangePct: 10,
      energyPrice: '', currency: 'COP',
      // Factores ambientales (valores por defecto del Excel de referencia; editables por el usuario)
      emissionFactor: DEFAULT_FACTORS.emissionFactor, emissionFactorMass: DEFAULT_FACTORS.emissionFactorMass, emissionFactorPer: DEFAULT_FACTORS.emissionFactorPer,
      footprintFactor: DEFAULT_FACTORS.footprintFactor,
      corporateTarget: { type: 'none', value: '', description: '' }
    };
  }
  /**
   * Factores por defecto tomados del Excel de referencia (pestaña de huella ecológica):
   *  - Factor de emisión: 0,4341667 t CO₂ por kWh.
   *  - Factor de huella: 0,000383 ha por t CO₂.
   * Huella de carbono [t CO₂] = Consumo × factor de emisión; huella ecológica [ha] = huella de carbono × factor de huella.
   */
  const DEFAULT_FACTORS = { emissionFactor: 0.4341667, emissionFactorMass: 't', emissionFactorPer: 'kWh', footprintFactor: 0.000383 };

  /**
   * Las filas de datos de la interfaz contienen en una sola tabla los valores reales (E, P) y presupuestados (Eb, Pb).
   * Esta función separa ambas series para el motor de cálculo (el presupuesto sigue siendo una serie temporal
   * independiente). Si el proyecto ya trae `budget` y las filas no tienen Eb/Pb (formato anterior), se respeta.
   */
  function toAnalysisProject(p) {
    const rows = p.real || [];
    const has = v => v !== '' && v != null;
    const merged = rows.some(r => has(r.Eb) || has(r.Pb));
    if (!merged) return p;
    const real = rows.filter(r => has(r.E) || has(r.P) || !(has(r.Eb) || has(r.Pb)));
    const budget = rows.filter(r => has(r.Eb) || has(r.Pb)).map(r => ({ id: r.id + ':b', month: r.month, E: has(r.Eb) ? r.Eb : '', P: has(r.Pb) ? r.Pb : '', eUnit: '', pUnit: '' }));
    return Object.assign({}, p, { real, budget: budget.concat((p.budget || []).filter(b => !rows.some(r => r.month === b.month))) });
  }
  /** Fusiona una serie de presupuesto separada dentro de las filas (formato de una sola tabla). */
  function mergeBudgetIntoRows(real, budget) {
    const rows = (real || []).map(r => Object.assign({ Eb: '', Pb: '' }, r));
    const byMonth = new Map(rows.map(r => [parseMonth(r.month) || r.month, r]));
    (budget || []).forEach(b => {
      const k = parseMonth(b.month) || b.month; let r = byMonth.get(k);
      if (!r) { r = Object.assign(newRealRow(b.month), { Eb: '', Pb: '' }); rows.push(r); byMonth.set(k, r); }
      if (b.E !== '' && b.E != null) r.Eb = b.E;
      if (b.P !== '' && b.P != null) r.Pb = b.P;
    });
    rows.sort((a, b) => { const ma = parseMonth(a.month), mb = parseMonth(b.month); if (!ma || !mb) return ma ? -1 : mb ? 1 : 0; return monthIndex(ma) - monthIndex(mb); });
    return rows;
  }
  function newProject() {
    return {
      schema: 'gestion-energetica/1',
      company: { name: '', nit: '', site: '', sector: '', responsible: '', notes: '' },
      config: defaultConfig(), real: [], budget: [], updatedAt: null
    };
  }
  function newRealRow(month) { return { id: uid('r'), month: month || '', E: '', P: '', Eb: '', Pb: '', eUnit: '', pUnit: '', period: 'base', include: true, note: '' }; }
  function newBudgetRow(month) { return { id: uid('b'), month: month || '', E: '', P: '', eUnit: '', pUnit: '' }; }

  /** Unidad efectiva de energía del proyecto (id del registro de unidades). */
  function energyUnit(cfg) { return cfg.energyType === 'otro' || cfg.energyUnit === 'custom' ? 'custom:' + (cfg.energyUnitCustom || 'unidad de energía') : cfg.energyUnit; }
  function productionUnit(cfg) { return cfg.productionUnit === 'custom' ? 'custom:' + (cfg.productionUnitCustom || 'unidad de producción') : cfg.productionUnit; }
  function budgetEnergyUnit(cfg) { return cfg.budgetEnergyUnit ? (cfg.budgetEnergyUnit === 'custom' ? energyUnit(cfg) : cfg.budgetEnergyUnit) : energyUnit(cfg); }
  function budgetProductionUnit(cfg) { return cfg.budgetProductionUnit ? (cfg.budgetProductionUnit === 'custom' ? productionUnit(cfg) : cfg.budgetProductionUnit) : productionUnit(cfg); }
  function icUnit(cfg) { return U.unitLabel(energyUnit(cfg)) + '/' + U.unitLabel(productionUnit(cfg)); }

  // ---------- Validación ----------
  function issue(level, code, message, extra) { return Object.assign({ level, code, message }, extra || {}); }

  /**
   * Valida una serie (real o presupuesto). Devuelve observaciones utilizables y la lista de incidencias.
   * kind: 'real' | 'budget'.
   */
  function validateSeries(rows, cfg, kind) {
    const issues = [];
    const label = kind === 'real' ? 'Datos reales' : 'Presupuesto';
    const targetE = kind === 'real' ? energyUnit(cfg) : budgetEnergyUnit(cfg);
    const targetP = kind === 'real' ? productionUnit(cfg) : budgetProductionUnit(cfg);
    const outE = energyUnit(cfg), outP = productionUnit(cfg); // todo se expresa finalmente en unidades reales
    const parsed = [];
    const byMonth = {};
    const nowIdx = (() => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); })();
    rows.forEach((row, i) => {
      const r = { rowId: row.id, line: i + 1, raw: row, status: 'ok', reasons: [] };
      const month = parseMonth(row.month);
      const emptyRow = (row.month === '' || row.month == null) && (row.E === '' || row.E == null) && (row.P === '' || row.P == null);
      if (emptyRow) { r.status = 'empty'; parsed.push(r); return; }
      if (!month) {
        r.status = 'invalid';
        r.reasons.push(row.month ? `Mes "${row.month}" no reconocido` : 'Falta el mes');
        issues.push(issue('error', row.month ? 'MONTH_INVALID' : 'MONTH_MISSING', `${label}, fila ${i + 1}: ${r.reasons[0]}. Use el formato AAAA-MM (p. ej. 2024-01).`, { rowId: row.id, kind }));
      } else {
        r.month = month;
        (byMonth[month] = byMonth[month] || []).push(r);
        if (monthIndex(month) > nowIdx) issues.push(issue('warning', 'FUTURE_MONTH', `${label}, ${formatMonth(month)}: el mes es posterior a la fecha actual.`, { rowId: row.id, kind, month }));
      }
      // Unidades por fila (opcionales, típicamente provienen de una importación)
      const ue = row.eUnit ? U.normalizeUnit(row.eUnit) : targetE;
      const up = row.pUnit ? U.normalizeUnit(row.pUnit) : targetP;
      const fE = U.factor(ue, outE), fP = U.factor(up, outP);
      if (fE == null) { r.status = 'invalid'; r.reasons.push(`Unidad de energía "${U.unitLabel(ue)}" incompatible con ${U.unitLabel(outE)}`); issues.push(issue('error', 'UNIT_INCOMPATIBLE', `${label}, ${month ? formatMonth(month) : 'fila ' + (i + 1)}: la unidad de energía "${U.unitLabel(ue)}" no es convertible a ${U.unitLabel(outE)} sin un factor (p. ej. poder calorífico). Corrija la unidad o convierta los datos.`, { rowId: row.id, kind, month })); }
      if (fP == null) { r.status = 'invalid'; r.reasons.push(`Unidad de producción "${U.unitLabel(up)}" incompatible con ${U.unitLabel(outP)}`); issues.push(issue('error', 'UNIT_INCOMPATIBLE', `${label}, ${month ? formatMonth(month) : 'fila ' + (i + 1)}: la unidad de producción "${U.unitLabel(up)}" no es convertible a ${U.unitLabel(outP)}.`, { rowId: row.id, kind, month })); }
      const pe = parseNumber(row.E, cfg.decimalSep), pp = parseNumber(row.P, cfg.decimalSep);
      const where = month ? formatMonth(month) : 'fila ' + (i + 1);
      if (pe.error) { r.status = 'invalid'; r.reasons.push('Consumo no numérico'); issues.push(issue('error', 'E_INVALID', `${label}, ${where}: consumo ${pe.error}.`, { rowId: row.id, kind, month })); }
      if (pp.error) { r.status = 'invalid'; r.reasons.push('Producción no numérica'); issues.push(issue('error', 'P_INVALID', `${label}, ${where}: producción ${pp.error}.`, { rowId: row.id, kind, month })); }
      r.E = pe.value != null && fE != null ? pe.value * fE : null;
      r.P = pp.value != null && fP != null ? pp.value * fP : null;
      if (fE != null && fE !== 1 && pe.value != null) issues.push(issue('info', 'UNIT_CONVERTED', `${label}, ${where}: consumo convertido de ${U.unitLabel(ue)} a ${U.unitLabel(outE)} (×${fE}).`, { rowId: row.id, kind, month }));
      if (fP != null && fP !== 1 && pp.value != null) issues.push(issue('info', 'UNIT_CONVERTED', `${label}, ${where}: producción convertida de ${U.unitLabel(up)} a ${U.unitLabel(outP)} (×${fP}).`, { rowId: row.id, kind, month }));
      if (r.E != null && r.E < 0) { r.status = 'invalid'; r.reasons.push('Consumo negativo'); issues.push(issue('error', 'NEGATIVE', `${label}, ${where}: el consumo no puede ser negativo.`, { rowId: row.id, kind, month })); }
      if (r.P != null && r.P < 0) { r.status = 'invalid'; r.reasons.push('Producción negativa'); issues.push(issue('error', 'NEGATIVE', `${label}, ${where}: la producción no puede ser negativa.`, { rowId: row.id, kind, month })); }
      if (kind === 'real') {
        if (r.status === 'ok' && r.E === 0 && r.P > 0) { r.status = 'invalid'; r.reasons.push('Consumo cero con producción'); issues.push(issue('error', 'E_ZERO_WITH_P', `${label}, ${where}: consumo 0 con producción mayor que 0 es físicamente improbable. Verifique la medición.`, { rowId: row.id, kind, month })); }
        if (r.status === 'ok' && r.E === 0 && r.P === 0) issues.push(issue('warning', 'NO_OPERATION', `${label}, ${where}: consumo y producción son 0 (¿planta detenida?). Este punto influye mucho en la línea base; excluya el mes si no es representativo.`, { rowId: row.id, kind, month }));
        if (r.status === 'ok' && r.P === 0 && r.E > 0) issues.push(issue('warning', 'P_ZERO', `${label}, ${where}: producción 0. Se usa en la regresión, pero el índice de consumo no se calcula (división por cero).`, { rowId: row.id, kind, month }));
      }
      const missingE = pe.empty, missingP = pp.empty;
      if (r.status === 'ok' && (missingE || missingP)) {
        if (kind === 'real') {
          r.status = 'incomplete';
          r.reasons.push(missingE && missingP ? 'Sin consumo ni producción' : missingE ? 'Falta el consumo' : 'Falta la producción');
          issues.push(issue('warning', 'INCOMPLETE', `${label}, ${where}: ${r.reasons[r.reasons.length - 1].toLowerCase()}. El mes se excluye de los cálculos (no se reemplaza por cero).`, { rowId: row.id, kind, month }));
        } else {
          r.status = (missingE && missingP) ? 'incomplete' : 'partial';
          if (missingE && missingP) r.reasons.push('Sin valores presupuestados');
        }
      }
      if (kind === 'real') { r.period = row.period === 'seguimiento' ? 'seguimiento' : 'base'; r.include = row.include !== false; r.note = row.note || ''; }
      parsed.push(r);
    });
    // Duplicados
    const duplicates = [];
    Object.keys(byMonth).forEach(m => {
      if (byMonth[m].length > 1) {
        duplicates.push(m);
        byMonth[m].forEach(r => { r.status = 'duplicate'; r.reasons.push('Mes duplicado'); });
        issues.push(issue('error', 'DUPLICATE', `${label}: el mes ${formatMonth(m)} aparece ${byMonth[m].length} veces (filas ${byMonth[m].map(r => r.line).join(', ')}). Elimine o corrija los duplicados.`, { kind, month: m, blocking: true }));
      }
    });
    const nonEmpty = parsed.filter(r => r.status !== 'empty');
    let usable = parsed.filter(r => r.status === 'ok' || r.status === 'partial');
    let excludedByUser = [];
    if (kind === 'real') {
      excludedByUser = usable.filter(r => !r.include);
      excludedByUser.forEach(r => issues.push(issue(r.note ? 'info' : 'warning', 'EXCLUDED_BY_USER', `Datos reales, ${formatMonth(r.month)}: excluido manualmente por el usuario${r.note ? ' — motivo: ' + r.note : '. Registre el motivo para la trazabilidad del informe.'}`, { rowId: r.rowId, kind, month: r.month })));
      usable = usable.filter(r => r.include);
    }
    usable.sort((a, b) => monthIndex(a.month) - monthIndex(b.month));

    // Cobertura del periodo
    const monthsAll = Object.keys(byMonth).sort((a, b) => monthIndex(a) - monthIndex(b));
    let coverage = null;
    if (monthsAll.length) {
      const i0 = monthIndex(monthsAll[0]), i1 = monthIndex(monthsAll[monthsAll.length - 1]);
      const present = new Set(monthsAll);
      const missing = []; for (let k = i0; k <= i1; k++) { const m = monthFromIndex(k); if (!present.has(m)) missing.push(m); }
      const usableSet = new Set(usable.map(r => r.month));
      const notUsable = monthsAll.filter(m => !usableSet.has(m));
      coverage = { start: monthsAll[0], end: monthsAll[monthsAll.length - 1], spanMonths: i1 - i0 + 1, missing, notUsable };
      if (missing.length) issues.push(issue(kind === 'real' ? 'warning' : 'info', 'MISSING_MONTHS', `${label}: faltan ${missing.length} mes(es) dentro del periodo ${formatMonth(monthsAll[0])} – ${formatMonth(monthsAll[monthsAll.length - 1])}: ${missing.map(m => formatMonth(m)).join(', ')}. No se imputan valores; los indicadores se calculan solo con los meses disponibles.`, { kind }));
    }
    // Valores extremos (descriptivo; NO se eliminan)
    if (kind === 'real' && usable.length >= 8) {
      ['E', 'P'].forEach(f => {
        const vals = usable.map(r => r[f]).filter(v => v != null);
        const q1 = S.quantile(vals, 0.25), q3 = S.quantile(vals, 0.75), iqr = q3 - q1;
        usable.forEach(r => {
          if (iqr > 0 && (r[f] < q1 - 3 * iqr || r[f] > q3 + 3 * iqr)) issues.push(issue('warning', 'EXTREME_VALUE', `Datos reales, ${formatMonth(r.month)}: ${f === 'E' ? 'el consumo' : 'la producción'} es un valor extremo (fuera de Q1 − 3·RIC / Q3 + 3·RIC). Verifique el dato; no se elimina automáticamente.`, { rowId: r.rowId, kind, month: r.month }));
        });
      });
    }
    return { kind, rowsEntered: nonEmpty.length, parsed, usable, duplicates, excludedByUser, coverage, issues };
  }

  /** Validación completa del proyecto. */
  function validateProject(project) {
    project = toAnalysisProject(project);
    const cfg = project.config;
    const issues = [];
    const eu = energyUnit(cfg), pu = productionUnit(cfg);
    if (cfg.energyType !== 'otro' && cfg.energyUnit !== 'custom' && !U.isEnergyUnitAllowed(cfg.energyType, cfg.energyUnit)) {
      issues.push(issue('error', 'UNIT_TYPE', `La unidad ${U.unitLabel(eu)} no corresponde al energético "${(U.ENERGY_TYPES[cfg.energyType] || {}).label}".`, { blocking: true }));
    }
    const real = validateSeries(project.real || [], cfg, 'real');
    issues.push(...real.issues);
    let budget = null, budgetUnitsOk = true;
    const hasBudget = (project.budget || []).some(r => (r.E !== '' && r.E != null) || (r.P !== '' && r.P != null));
    if (hasBudget) {
      const be = budgetEnergyUnit(cfg), bp = budgetProductionUnit(cfg);
      if (!U.compatible(be, eu)) { budgetUnitsOk = false; issues.push(issue('error', 'BUDGET_UNIT', `La unidad del consumo presupuestado (${U.unitLabel(be)}) no es compatible con la del consumo real (${U.unitLabel(eu)}). La comparación presupuestal no se ejecutará.`, { kind: 'budget' })); }
      if (!U.compatible(bp, pu)) { budgetUnitsOk = false; issues.push(issue('error', 'BUDGET_UNIT', `La unidad de la producción presupuestada (${U.unitLabel(bp)}) no es compatible con la de la producción real (${U.unitLabel(pu)}). La comparación presupuestal no se ejecutará.`, { kind: 'budget' })); }
      if (budgetUnitsOk) {
        budget = validateSeries(project.budget, cfg, 'budget');
        issues.push(...budget.issues);
        if (U.factor(be, eu) !== 1) issues.push(issue('info', 'BUDGET_CONVERTED', `El consumo presupuestado se convierte de ${U.unitLabel(be)} a ${U.unitLabel(eu)} (×${U.factor(be, eu)}).`, { kind: 'budget' }));
        if (U.factor(bp, pu) !== 1) issues.push(issue('info', 'BUDGET_CONVERTED', `La producción presupuestada se convierte de ${U.unitLabel(bp)} a ${U.unitLabel(pu)} (×${U.factor(bp, pu)}).`, { kind: 'budget' }));
        const realMonths = new Set(real.usable.map(r => r.month));
        const orphan = budget.usable.filter(b => !realMonths.has(b.month)).map(b => b.month);
        if (orphan.length) issues.push(issue('info', 'BUDGET_NO_REAL', `Presupuesto sin dato real válido para comparar en: ${orphan.map(m => formatMonth(m)).join(', ')}.`, { kind: 'budget' }));
      }
    }
    // Orden de periodos
    const base = real.usable.filter(r => r.period === 'base'), seg = real.usable.filter(r => r.period === 'seguimiento');
    if (base.length && seg.length) {
      const lastBase = Math.max(...base.map(r => monthIndex(r.month))), firstSeg = Math.min(...seg.map(r => monthIndex(r.month)));
      if (firstSeg <= lastBase) issues.push(issue('warning', 'PERIOD_ORDER', 'Hay meses de seguimiento anteriores o intercalados con el periodo base. Normalmente el periodo de seguimiento es posterior al periodo base.'));
    }
    if (!real.usable.length) issues.push(issue('error', 'NO_DATA', 'No hay observaciones reales válidas (mes, consumo y producción) para analizar.', { blocking: true }));
    const blocking = issues.filter(x => x.blocking || (x.code === 'DUPLICATE' && x.kind === 'real'));
    return {
      real, budget, hasBudget, budgetUnitsOk, issues, blocking,
      counts: {
        realEntered: real.rowsEntered, realValid: real.usable.length + real.excludedByUser.length, realUsed: real.usable.length,
        realExcludedByUser: real.excludedByUser.length, realBase: base.length, realFollowup: seg.length,
        realIncomplete: real.parsed.filter(r => r.status === 'incomplete').length,
        realInvalid: real.parsed.filter(r => r.status === 'invalid' || r.status === 'duplicate').length,
        budgetEntered: budget ? budget.rowsEntered : 0, budgetUsable: budget ? budget.usable.length : 0
      }
    };
  }

  const api = {
    MONTH_NAMES, MONTH_ABBR, parseMonth, monthIndex, monthFromIndex, addMonths, formatMonth, excelSerialToMonth,
    parseNumber, uid, defaultConfig, newProject, newRealRow, newBudgetRow, DEFAULT_FACTORS, toAnalysisProject, mergeBudgetIntoRows,
    energyUnit, productionUnit, budgetEnergyUnit, budgetProductionUnit, icUnit, validateSeries, validateProject
  };
  EA.dataset = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
