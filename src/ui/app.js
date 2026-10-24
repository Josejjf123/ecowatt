/*
 * app.js — Controlador de la interfaz.
 * Maneja un espacio de trabajo con varias empresas. Por empresa: 1) Empresa y unidades, 2) Datos (reales y
 * presupuesto en una sola tabla, con validación en vivo), 3) Resultados, 4) Exportar. Entre empresas:
 * 5) Tablero comparativo (% de la meta consumido y zona) y 6) Ranking (ahorro y factor de emisión).
 * Toda la lógica de cálculo vive en src/core; aquí solo se capturan datos y se presentan resultados.
 */
(function () {
  'use strict';
  const { units: U, format: F, dataset: D, analysis: A, importer: IM, views: V, report: REP, exporter: EX, demo: DEMO, benchmark: BM, benchmarkViews: BV } = window.EA;
  const esc = F.escapeHtml;
  const STORE_KEY = 'gestion-energetica:espacio:v3';
  const LEGACY_KEY = 'gestion-energetica:proyecto:v2';
  const THEME_KEY = 'gestion-energetica:tema';

  const STEPS = [
    { id: 1, label: 'Empresa y unidades', group: 'empresa' }, { id: 2, label: 'Datos reales y presupuesto', group: 'empresa' },
    { id: 3, label: 'Resultados', group: 'empresa' }, { id: 4, label: 'Exportar', group: 'empresa' },
    { id: 5, label: 'Tablero comparativo', group: 'todas' }, { id: 6, label: 'Ranking', group: 'todas' }
  ];
  const TABS = [
    ['resumen', 'Resumen'], ['descriptiva', 'Descriptiva e IC'], ['linea_base', 'Línea base'], ['linea_meta', 'Línea meta'],
    ['indicadores', 'Indicadores base 100'], ['seguimiento', 'Seguimiento'], ['presupuesto', 'Presupuesto'],
    ['huella', 'Huella ecológica'], ['oportunidades', 'Oportunidades'], ['calidad', 'Calidad de datos'], ['metodologia', 'Metodología']
  ];

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const view = $('#view');
  const ui = { step: 1, tab: 'resumen', cache: new Map(), bench: null, benchKey: null };
  let ws = loadWorkspace();
  let project = active();

  // ---------------- Espacio de trabajo y persistencia ----------------
  function newCompany() { const p = D.newProject(); p.id = D.uid('emp'); p.real = []; p.budget = []; return p; }
  function normalizeProject(p) {
    const out = Object.assign(D.newProject(), p || {});
    out.id = (p && p.id) || D.uid('emp');
    out.company = Object.assign(D.newProject().company, (p && p.company) || {});
    out.config = Object.assign(D.defaultConfig(), (p && p.config) || {});
    ['emissionFactor', 'footprintFactor', 'emissionFactorMass', 'emissionFactorPer'].forEach(k => { if (out.config[k] == null) out.config[k] = D.DEFAULT_FACTORS[k]; });
    out.config.corporateTarget = Object.assign({ type: 'none', value: '', description: '' }, out.config.corporateTarget || {});
    const real = Array.isArray(out.real) ? out.real.map(r => Object.assign(D.newRealRow(), r)) : [];
    const budget = Array.isArray(out.budget) ? out.budget : [];
    out.real = budget.length ? D.mergeBudgetIntoRows(real, budget) : real; // una sola tabla con Eb/Pb
    out.budget = [];
    return out;
  }
  function loadWorkspace() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { const w = JSON.parse(raw); if (w && Array.isArray(w.companies) && w.companies.length) { w.companies = w.companies.map(normalizeProject); if (!w.companies.some(c => c.id === w.activeId)) w.activeId = w.companies[0].id; return w; } }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) { const p = normalizeProject(JSON.parse(legacy)); return { schema: 'gestion-energetica-espacio/1', activeId: p.id, companies: [p] }; }
    } catch (e) { /* almacenamiento no disponible */ }
    const p = newCompany(); return { schema: 'gestion-energetica-espacio/1', activeId: p.id, companies: [p] };
  }
  function active() { return ws.companies.find(c => c.id === ws.activeId) || ws.companies[0]; }
  function setActive(id) { ws.activeId = id; project = active(); renderCompanyBar(); }
  let saveTimer = null;
  function changed() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      project.updatedAt = new Date().toISOString();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(ws)); $('#save-state').textContent = 'Guardado en este navegador'; }
      catch (e) { $('#save-state').textContent = '⚠ No se pudo guardar en el navegador; use «Guardar»'; }
    }, 350);
    renderStepper(); renderCompanyBar();
  }

  // ---------------- Utilidades ----------------
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3400); }
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function slug(s) { return String(s || 'empresa').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'empresa'; }
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach(k => { if (o[k] == null) o[k] = {}; o = o[k]; }); o[ks[ks.length - 1]] = val; }
  function cfg() { return project.config; }
  function eLabel() { return U.unitLabel(D.energyUnit(cfg())); }
  function pLabel() { return U.unitLabel(D.productionUnit(cfg())); }
  function hasData(p) { return (p || project).real.some(r => r.month || r.E !== '' || r.P !== ''); }
  function opt(v, label, sel) { return `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(label)}</option>`; }
  function keyOf(p) { return JSON.stringify([p.real, p.config, p.company]); }
  function results(p) {
    p = p || project; const k = keyOf(p); const c = ui.cache.get(p.id);
    if (c && c.key === k) return c.R;
    const R = A.runAnalysis(p); ui.cache.set(p.id, { key: k, R }); return R;
  }
  function bench() {
    const k = JSON.stringify(ws.companies.map(keyOf));
    if (!ui.bench || ui.benchKey !== k) { ui.bench = BM.compare(ws.companies); ui.benchKey = k; }
    return ui.bench;
  }
  function analysisProject() { return D.toAnalysisProject(project); }

  // ---------------- Barra de empresas y pasos ----------------
  function renderCompanyBar() {
    const sel = $('#company-select');
    sel.innerHTML = ws.companies.map((c, i) => opt(c.id, `${i + 1}. ${c.company.name || 'Empresa sin nombre'}`, ws.activeId)).join('');
    $('#btn-del-company').disabled = ws.companies.length < 2 && !hasData(ws.companies[0]) && !ws.companies[0].company.name;
    $('#company-count').textContent = `${ws.companies.length} empresa${ws.companies.length === 1 ? '' : 's'}`;
  }
  function renderStepper() {
    const nav = $('#stepper');
    const done = { 1: !!project.company.name, 2: hasData() };
    const btn = s => `<button class="step-btn${ui.step === s.id ? ' active' : ''}${done[s.id] && ui.step !== s.id ? ' done' : ''}" data-step="${s.id}" ${ui.step === s.id ? 'aria-current="step"' : ''}><span class="num">${done[s.id] && ui.step !== s.id ? '✓' : s.id}</span><span>${esc(s.label)}</span></button>`;
    nav.innerHTML = STEPS.filter(s => s.group === 'empresa').map(btn).join('') + '<span class="step-sep" aria-hidden="true"></span>' + STEPS.filter(s => s.group === 'todas').map(btn).join('');
  }
  function go(step) {
    ui.step = step; renderStepper(); render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const a = $('.step-btn.active'); if (a) a.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function navFooter(prev, next, nextLabel) {
    return `<div class="nav-footer">${prev ? `<button class="btn" data-go="${prev}">← Anterior</button>` : '<span></span>'}${next ? `<button class="btn btn-primary" data-go="${next}">${esc(nextLabel || 'Siguiente')} →</button>` : ''}</div>`;
  }
  function render() {
    hideTip();
    view.innerHTML = ({ 1: renderCompany, 2: renderData, 3: renderResults, 4: renderExport, 5: renderDashboard, 6: renderRanking })[ui.step]();
    if (ui.step === 2) updateStatus();
  }

  // ---------------- Demostraciones ----------------
  function demoCard() {
    return `<div class="card"><h3>¿Quiere probar la herramienta primero?</h3><p class="muted">Datos de demostración ficticios. Las opciones de una empresa reemplazan los datos de la empresa activa; «4 empresas» reemplaza todas las empresas.</p><div class="demo-list">${DEMO.list.map(d => `<button class="demo-item" data-demo="${d.id}"><b>${esc(d.label)}</b><span>${esc(d.desc)}</span></button>`).join('')}</div></div>`;
  }
  function loadDemo(id) {
    const def = DEMO.list.find(d => d.id === id);
    if (def.multi) {
      if (ws.companies.some(c => hasData(c)) && !confirm('Se reemplazarán TODAS las empresas por 4 empresas de demostración. ¿Continuar?')) return;
      const cs = DEMO.buildCompanies().map(normalizeProject);
      ws = { schema: ws.schema, activeId: cs[0].id, companies: cs }; project = active(); ui.cache.clear(); changed();
      toast('4 empresas de demostración cargadas (ficticias).'); go(5); return;
    }
    if (hasData() && !confirm('Se reemplazarán los datos de la empresa activa por el conjunto de demostración. ¿Continuar?')) return;
    const p = normalizeProject(DEMO.build(id)); p.id = project.id;
    const i = ws.companies.findIndex(c => c.id === project.id); ws.companies[i] = p; project = p; changed();
    toast('Datos de demostración cargados (ficticios).'); go(2);
  }

  // ---------------- Paso 1: empresa y unidades ----------------
  function renderCompany() {
    const k = cfg();
    const types = Object.entries(U.ENERGY_TYPES).map(([id, t]) => opt(id, t.label, k.energyType)).join('');
    const eUnits = (U.ENERGY_TYPES[k.energyType] || { units: [] }).units;
    const field = (label, inner, hint, req) => `<div class="field"><label>${label}${req ? ' <span class="req" title="Obligatorio">*</span>' : ''}</label>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    const inp = (path, ph) => `<input data-path="${path}" value="${esc(getPath(project, path) == null ? '' : F.plain(getPath(project, path), ','))}" placeholder="${esc(ph || '')}">`;
    const projU = D.energyUnit(k);
    const perOpts = ['kWh', 'MWh', 'GJ'].filter(u => U.compatible(u, projU));
    if (!perOpts.includes(projU)) perOpts.push('project');
    const feUnit = `<div class="inline-pair"><select data-path="config.emissionFactorMass" aria-label="Masa">${opt('t', 't CO₂', k.emissionFactorMass)}${opt('kg', 'kg CO₂', k.emissionFactorMass)}</select><span>por</span><select data-path="config.emissionFactorPer" aria-label="Unidad de energía del factor">${perOpts.map(u => opt(u, u === 'project' ? U.unitLabel(projU) : U.unitLabel(u), k.emissionFactorPer)).join('')}</select></div>`;
    const isDefault = Number(k.emissionFactor) === D.DEFAULT_FACTORS.emissionFactor && Number(k.footprintFactor) === D.DEFAULT_FACTORS.footprintFactor && k.emissionFactorMass === 't' && k.emissionFactorPer === 'kWh';
    return `<div class="page-head"><div><h2>1. Empresa y configuración de unidades</h2><p>Empresa activa: <b>${esc(project.company.name || 'sin nombre')}</b>. Los campos con <span class="req">*</span> son obligatorios. Para comparar varias empresas use <b>＋ Empresa</b> en la barra superior.</p></div></div>
      ${!hasData() ? demoCard() : ''}
      <div class="card"><h3>Identificación de la empresa</h3><div class="form-grid">
        ${field('Nombre o razón social', inp('company.name', 'Ej.: Embotelladora del Caribe S.A.S.'), '', true)}
        ${field('NIT <span class="opt-tag">opcional</span>', inp('company.nit', '900.123.456-7'))}
        ${field('Sede o planta <span class="opt-tag">opcional</span>', inp('company.site', 'Planta Barranquilla'))}
        ${field('Sector <span class="opt-tag">opcional</span>', inp('company.sector', 'Bebidas, alimentos, plásticos…'))}
        ${field('Responsable del análisis <span class="opt-tag">opcional</span>', inp('company.responsible', 'Nombre y cargo'))}
      </div></div>
      <div class="card"><h3>Energético y unidades</h3>
        <p class="muted">Analice un solo energético a la vez. No mezcle, por ejemplo, electricidad y gas sin convertirlos antes a una unidad común (en ese caso elija «Energía total»).</p>
        <div class="form-grid">
          ${field('Tipo de energía', `<select data-path="config.energyType">${types}</select>`, '', true)}
          ${k.energyType === 'otro' ? field('Unidad del consumo', inp('config.energyUnitCustom', 'Ej.: kg de GLP'), 'Escriba la unidad exacta de sus mediciones.', true) : field('Unidad del consumo', `<select data-path="config.energyUnit">${eUnits.map(u => opt(u, U.unitLabel(u), k.energyUnit)).join('')}</select>`, '', true)}
          ${field('Unidad de producción', `<select data-path="config.productionUnit">${U.PRODUCTION_UNITS.map(u => opt(u, U.unitLabel(u), k.productionUnit)).join('')}${opt('custom', 'Otra (escribir)…', k.productionUnit)}</select>`, '', true)}
          ${k.productionUnit === 'custom' ? field('Nombre de la unidad de producción', inp('config.productionUnitCustom', 'Ej.: pacas, piezas'), '', true) : ''}
          ${field('Descripción de la producción <span class="opt-tag">opcional</span>', inp('config.productionLabel', 'Ej.: bebida envasada'))}
          ${field('Separador decimal al escribir datos', `<select data-path="config.decimalSep">${opt(',', 'Coma (1.234,5) — Colombia', k.decimalSep)}${opt('.', 'Punto (1,234.5)', k.decimalSep)}</select>`, 'Se usa para interpretar lo que escribe o pega.')}
        </div>
        <p class="muted" style="margin-top:10px">Índice de consumo resultante: <b>${esc(D.icUnit(k))}</b></p>
      </div>
      <div class="card"><h3>Factores ambientales <span class="opt-tag">opcional</span></h3>
        <p class="muted">Se usan para la huella de carbono (consumo × factor de emisión) y la huella ecológica (huella de carbono × factor de huella). Por defecto se cargan los valores del Excel de referencia; puede modificarlos.</p>
        <div class="form-grid">
          ${field('Factor de emisión', inp('config.emissionFactor', String(D.DEFAULT_FACTORS.emissionFactor).replace('.', ',')), 'Valor por defecto del Excel: 0,4341667 t CO₂/kWh.')}
          ${field('Unidad del factor de emisión', feUnit)}
          ${field('Factor de huella (ha/t CO₂)', inp('config.footprintFactor', String(D.DEFAULT_FACTORS.footprintFactor).replace('.', ',')), 'Valor por defecto del Excel: 0,000383 ha/t CO₂.')}
        </div>
        ${isDefault ? '<p class="muted">Usando los valores por defecto del Excel.</p>' : '<button class="btn btn-sm" data-act="reset-factors" style="margin-top:8px">Restablecer valores del Excel</button>'}
      </div>
      ${navFooter(null, 2, 'Datos reales y presupuesto')}`;
  }

  // ---------------- Paso 2: datos reales y presupuesto (una sola tabla) ----------------
  function cellVal(v) { return F.plain(v, cfg().decimalSep); }
  function dataTable() {
    const rows = project.real;
    if (!rows.length) return `<div class="table-wrap"><div class="empty-state"><div class="big" aria-hidden="true">📋</div><p><b>Aún no hay meses registrados.</b></p><p>Agregue meses manualmente, importe un archivo CSV/Excel, pegue datos desde Excel o cargue un ejemplo.</p></div></div>`;
    const showUnits = rows.some(r => r.eUnit || r.pUnit);
    const num = (r, f, i, lbl) => `<td${f === 'Eb' || f === 'Pb' ? ' class="bud"' : ''}><input class="num" data-f="${f}" value="${esc(cellVal(r[f]))}" inputmode="decimal" aria-label="${lbl} fila ${i + 1}"></td>`;
    return `<div class="table-wrap"><table class="edit" id="tbl-data"><thead>
      <tr class="grp"><th colspan="2"></th><th colspan="2">Datos reales <span class="req">*</span></th><th colspan="2" class="bud">Presupuesto <span class="opt-tag">opcional</span></th><th colspan="${showUnits ? 7 : 5}"></th></tr>
      <tr><th>#</th><th>Mes <span class="req">*</span></th><th>Consumo (${esc(eLabel())})</th><th>Producción (${esc(pLabel())})</th><th class="bud">Consumo (${esc(eLabel())})</th><th class="bud">Producción (${esc(pLabel())})</th>${showUnits ? '<th>Unidad consumo</th><th>Unidad producción</th>' : ''}<th title="Base: construye la línea base. Seguimiento: meses posteriores a una intervención">Periodo</th><th title="Desmarque para excluir el mes del análisis (registre el motivo)">Incluir</th><th>Observación</th><th>Estado</th><th><span class="sr-only">Eliminar</span></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr data-id="${r.id}"><td class="idx">${i + 1}</td>
        <td><input data-f="month" value="${esc(r.month)}" placeholder="AAAA-MM" aria-label="Mes fila ${i + 1}" style="width:96px"></td>
        ${num(r, 'E', i, 'Consumo real')}${num(r, 'P', i, 'Producción real')}${num(r, 'Eb', i, 'Consumo presupuestado')}${num(r, 'Pb', i, 'Producción presupuestada')}
        ${showUnits ? `<td><input data-f="eUnit" value="${esc(r.eUnit)}" placeholder="${esc(eLabel())}" style="width:80px"></td><td><input data-f="pUnit" value="${esc(r.pUnit)}" placeholder="${esc(pLabel())}" style="width:80px"></td>` : ''}
        <td><select data-f="period" aria-label="Periodo fila ${i + 1}">${opt('base', 'Base', r.period)}${opt('seguimiento', 'Seguimiento', r.period)}</select></td>
        <td style="text-align:center"><input type="checkbox" data-f="include" ${r.include !== false ? 'checked' : ''} aria-label="Incluir fila ${i + 1}"></td>
        <td><input data-f="note" value="${esc(r.note)}" placeholder="${r.include === false ? 'Motivo de la exclusión' : ''}" aria-label="Observación fila ${i + 1}"></td>
        <td class="st"></td><td><button class="icon-btn" data-del="${r.id}" title="Eliminar fila" aria-label="Eliminar fila ${i + 1}">🗑</button></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function formatHelp() {
    const ex = `Mes;Consumo real (kWh);Producción real (L);Consumo presupuestado (kWh);Producción presupuestada (L)\n2023-01;484455;8172100;480000;8100000\n2023-02;474504;8348700;;\n(ene-2023 · 01/2023 · enero 2023 · fechas de Excel también se aceptan)`;
    return `<details class="card"><summary><b>Formato esperado y ejemplos</b></summary><p class="muted">Una fila por mes. Las columnas de presupuesto son opcionales. La primera fila puede tener encabezados (se detectan automáticamente y podrá ajustar la asignación de columnas). Se aceptan CSV (separado por ; , o tabulador), Excel .xlsx y texto copiado de Excel. Las celdas vacías se dejan vacías: no se reemplazan por cero.</p><pre class="example">${esc(ex)}</pre><button class="btn btn-sm" data-act="template">Descargar plantilla CSV</button></details>`;
  }
  function renderData() {
    return `<div class="page-head"><div><h2>2. Datos mensuales reales y presupuesto</h2><p>Empresa: <b>${esc(project.company.name || 'sin nombre')}</b>. Registre por mes el consumo y la producción medidos (obligatorios) y, si los tiene, los valores presupuestados (opcionales). Puede usar 12, 17, 24, 36 o más meses. Marque como <b>seguimiento</b> los meses posteriores a una mejora para medir su ahorro.</p></div></div>
      ${!hasData() ? demoCard() : ''}
      <div class="card">
        <div class="toolbar">
          <button class="btn btn-primary" data-act="add-1">＋ Agregar mes</button>
          <button class="btn" data-act="add-12">＋ 12 meses</button>
          <button class="btn" data-act="import">⬆ Importar CSV / Excel</button>
          <button class="btn" data-act="paste">📋 Pegar desde Excel</button>
          <span class="spacer"></span>
          <button class="btn btn-sm" data-act="sort">Ordenar por mes</button>
          <button class="btn btn-sm btn-danger" data-act="clear" ${project.real.length ? '' : 'disabled'}>Eliminar todo</button>
        </div>
        <div class="status-line" id="status-line"></div>
        ${dataTable()}
      </div>
      <div class="card" id="validation-panel"></div>
      ${formatHelp()}
      ${navFooter(1, 3, 'Ver resultados')}`;
  }
  function statusBadge(r, b) {
    let h = '';
    if (r) {
      if (r.status === 'duplicate') h = V.badge('bad', 'Duplicado');
      else if (r.status === 'invalid') h = `<span title="${esc(r.reasons.join('; '))}">${V.badge('bad', r.reasons[0] || 'Inválido')}</span>`;
      else if (r.status === 'incomplete') h = `<span title="Se excluye de los cálculos; no se reemplaza por cero">${V.badge('warn', r.reasons[0] || 'Incompleto')}</span>`;
      else if (r.raw.include === false) h = V.badge('neutral', 'Excluido');
      else if (r.status === 'ok') h = V.badge('good', 'Válido');
    } else if (b) h = V.badge('neutral', 'Solo presupuesto');
    if (b && (b.status === 'invalid' || b.status === 'duplicate')) h += ' ' + `<span title="${esc(b.reasons.join('; '))}">${V.badge('bad', 'Presupuesto: ' + (b.reasons[0] || 'inválido'))}</span>`;
    else if (b && b.status === 'partial') h += ' ' + V.badge('warn', 'Presupuesto parcial');
    return h;
  }
  function updateStatus() {
    const v = D.validateProject(project);
    const tbl = $('#tbl-data');
    if (tbl) {
      const real = new Map(v.real.parsed.map(r => [r.rowId, r]));
      const bud = new Map(v.budget ? v.budget.parsed.map(r => [String(r.rowId).replace(/:b$/, ''), r]) : []);
      $$('tbody tr', tbl).forEach(tr => {
        const r = real.get(tr.dataset.id), b = bud.get(tr.dataset.id);
        tr.className = r ? 'st-' + r.status + (r.raw.include === false ? ' st-excluded' : '') : '';
        $('.st', tr).innerHTML = statusBadge(r, b);
      });
    }
    const c = v.counts, cov = v.real.coverage;
    const line = $('#status-line');
    if (line) line.innerHTML = project.real.length ? `<span><b>${c.realEntered}</b> meses introducidos</span><span><b>${c.realUsed}</b> observaciones utilizables</span>${c.realIncomplete ? `<span>${V.badge('warn', c.realIncomplete + ' incompleta(s)')}</span>` : ''}${c.realInvalid ? `<span>${V.badge('bad', c.realInvalid + ' con error')}</span>` : ''}${c.realExcludedByUser ? `<span>${c.realExcludedByUser} excluida(s)</span>` : ''}${cov ? `<span>Periodo: <b>${esc(D.formatMonth(cov.start))} – ${esc(D.formatMonth(cov.end))}</b> (${cov.spanMonths} meses)</span><span>${cov.missing.length ? V.badge('warn', 'Faltan: ' + cov.missing.map(m => D.formatMonth(m)).join(', ')) : 'Sin meses faltantes'}</span>` : ''}${c.realFollowup ? `<span>${c.realBase} base · ${c.realFollowup} seguimiento</span>` : ''}${v.hasBudget ? `<span>Presupuesto: <b>${c.budgetUsable}</b> meses</span>` : ''}` : '';
    const panel = $('#validation-panel');
    if (panel) panel.innerHTML = validationPanel(v);
  }
  function validationPanel(v) {
    if (!project.real.length) return '<h3>Validación</h3><p class="muted">La validación aparecerá aquí a medida que registre datos.</p>';
    const lv = { error: [], warning: [], info: [] }; v.issues.forEach(i => lv[i.level].push(i));
    const minB = Number(D.parseNumber(cfg().minObsBaseline, ',').value) || 6;
    const c = v.counts;
    const st = [
      ['Estadística descriptiva e índice de consumo', c.realUsed, c.realUsed > 0],
      ['Línea base (regresión)', c.realBase, c.realBase >= minB, c.realBase < minB ? `Se requieren al menos ${minB} meses en el periodo base` : ''],
      ['Seguimiento (ahorro medido)', c.realFollowup, null, c.realFollowup ? '' : 'Sin meses de seguimiento (opcional)'],
      ['Comparación presupuestal', v.budget ? v.budget.usable.filter(b => v.real.usable.some(r => r.month === b.month)).length : 0, v.hasBudget ? true : null, v.hasBudget ? '' : 'Sin presupuesto (opcional)']
    ];
    const ic = s => s === true ? '✅' : s === null ? '➖' : '⚠️';
    return `<h3>Validación ${v.blocking.length ? V.badge('bad', 'Corrija antes de analizar') : V.badge('good', 'Lista para analizar')}</h3>
      ${v.blocking.length ? V.callout('error', '<b>No es posible analizar:</b><ul>' + v.blocking.map(b => `<li>${esc(b.message)}</li>`).join('') + '</ul>') : ''}
      <ul class="trace">${st.map(x => `<li><span class="ic">${ic(x[2])}</span><span class="what"><b>${esc(x[0])}</b><span class="muted">${esc(x[3] || '')}</span></span><span class="cnt">${x[1]} obs.</span></li>`).join('')}</ul>
      ${lv.error.filter(i => !v.blocking.includes(i)).map(i => V.callout('error', esc(i.message))).join('')}
      ${lv.warning.map(i => V.callout('warning', esc(i.message))).join('')}
      ${lv.info.length ? `<details><summary class="muted">Información (${lv.info.length})</summary>${lv.info.map(i => V.callout('info', esc(i.message))).join('')}</details>` : ''}
      ${!lv.error.length && !lv.warning.length ? V.callout('ok', 'No se encontraron problemas en los datos.') : ''}`;
  }
  function lastMonth(rows) { const ms = rows.map(r => D.parseMonth(r.month)).filter(Boolean).sort((a, b) => D.monthIndex(a) - D.monthIndex(b)); return ms.length ? ms[ms.length - 1] : null; }
  function addMonths(k) {
    const last = lastMonth(project.real) || `${new Date().getFullYear() - 2}-12`;
    for (let i = 1; i <= k; i++) project.real.push(D.newRealRow(D.addMonths(last, i)));
    changed(); render();
    const inp = $('#tbl-data tbody tr:last-child input[data-f="E"]'); if (inp) inp.focus();
  }
  function sortRows(rows) { rows.sort((a, b) => { const ma = D.parseMonth(a.month), mb = D.parseMonth(b.month); if (!ma && !mb) return 0; if (!ma) return 1; if (!mb) return -1; return D.monthIndex(ma) - D.monthIndex(mb); }); }
  function onTableInput(e) {
    const inp = e.target; const tr = inp.closest('tr[data-id]'); if (!tr) return;
    const row = project.real.find(r => r.id === tr.dataset.id); if (!row) return;
    const f = inp.dataset.f;
    if (f === 'include') row.include = inp.checked;
    else if (['E', 'P', 'Eb', 'Pb'].includes(f)) { const p = D.parseNumber(inp.value, cfg().decimalSep); row[f] = p.value != null ? p.value : (p.empty ? '' : inp.value); }
    else if (f === 'month') { row.month = e.type === 'change' ? (D.parseMonth(inp.value) || inp.value.trim()) : inp.value; if (e.type === 'change') inp.value = row.month; }
    else row[f] = inp.value;
    if (f === 'include') { const note = $('input[data-f="note"]', tr); if (note) note.placeholder = inp.checked ? '' : 'Motivo de la exclusión'; if (!inp.checked && note && !note.value) note.focus(); }
    changed(); updateStatus();
  }

  // ---------------- Importación ----------------
  const imp = { table: null, an: null, sheetIdx: 0, mapping: null, decimalSep: ',', mode: 'replace' };
  function openImport(pasteMode) {
    imp.table = null; imp.an = null;
    const dlg = $('#dlg-import');
    dlg.innerHTML = `<div class="dlg-head"><h3 id="dlg-import-title">${pasteMode ? 'Pegar datos desde Excel' : 'Importar datos'} — ${esc(project.company.name || 'empresa activa')}</h3><span style="flex:1"></span><button class="icon-btn" data-imp="close" aria-label="Cerrar">✕</button></div>
      <div class="dlg-body" id="imp-body">
        ${pasteMode ? '' : `<label class="dropzone" id="imp-drop"><input type="file" id="imp-file" accept=".csv,.txt,.tsv,.xlsx,.xlsm" hidden><div style="font-size:28px" aria-hidden="true">⬆</div><b>Arrastre aquí un archivo o haga clic para elegirlo</b><div class="muted">CSV, TXT o Excel (.xlsx). Los archivos .xls antiguos deben guardarse como .xlsx.</div></label><p class="muted" style="text-align:center">— o —</p>`}
        <div class="field"><label for="imp-text">Pegue aquí las celdas copiadas de Excel (incluya la fila de encabezados si la tiene)</label><textarea id="imp-text" placeholder="Mes&#9;Consumo (kWh)&#9;Producción (L)&#9;Consumo presupuestado (kWh)&#9;Producción presupuestada (L)&#10;2023-01&#9;484455&#9;8172100&#9;480000&#9;8100000"></textarea></div>
        <div style="margin-top:8px"><button class="btn btn-primary" data-imp="parse-text">Analizar texto pegado</button></div>
      </div>
      <div class="dlg-foot"><button class="btn" data-imp="close">Cancelar</button></div>`;
    dlg.showModal();
    const file = $('#imp-file'), drop = $('#imp-drop');
    if (file) {
      file.addEventListener('change', () => file.files[0] && handleFile(file.files[0]));
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
      drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    } else setTimeout(() => $('#imp-text').focus(), 30);
  }
  async function handleFile(file) {
    try { imp.table = await IM.readFile(file); imp.fileName = file.name; imp.sheetIdx = 0; analyzeImport(); }
    catch (e) { toast('No se pudo leer el archivo: ' + e.message); }
  }
  function analyzeImport() {
    const sh = imp.table.sheets[imp.sheetIdx];
    if (!sh || !sh.rows.length) { $('#imp-body').insertAdjacentHTML('afterbegin', V.callout('error', 'La hoja está vacía.')); return; }
    imp.an = IM.analyze(sh.rows); imp.mapping = Object.assign({}, imp.an.mapping);
    imp.decimalSep = imp.an.decimalSep || cfg().decimalSep;
    renderImportMapping();
  }
  function importBuild() {
    return IM.build(imp.an, imp.mapping, { decimalSep: imp.decimalSep, projectEnergyUnit: D.energyUnit(cfg()), projectProductionUnit: D.productionUnit(cfg()) });
  }
  function renderImportMapping() {
    const an = imp.an, sheets = imp.table.sheets;
    const cols = Array.from({ length: an.ncol }, (_, i) => i);
    const colName = i => an.headerRow >= 0 && an.headers[i] ? `${window.EA.xlsx.colName(i)} · ${an.headers[i]}` : `Columna ${window.EA.xlsx.colName(i)}`;
    const built = importBuild();
    const prev = built.real.slice(0, 8);
    const vs = D.validateSeries(built.real, cfg(), 'real');
    const units = Object.entries(an.units).map(([k, u]) => `${IM.FIELDS.find(f => f.key === k).label}: ${U.unitLabel(u)}`).join(' · ');
    $('#imp-body').innerHTML = `
      ${sheets.length > 1 ? `<div class="field" style="max-width:340px"><label>Hoja del libro</label><select id="imp-sheet">${sheets.map((s, i) => opt(i, s.name, imp.sheetIdx)).join('')}</select></div>` : ''}
      <p class="muted">${imp.fileName ? `Archivo: <b>${esc(imp.fileName)}</b> · ` : ''}${an.headerRow >= 0 ? `Encabezados en la fila ${an.headerRow + 1}` : 'Sin fila de encabezados (se asume: mes, consumo, producción, consumo presupuestado, producción presupuestada)'} · ${an.dataRows.length} filas de datos.${units ? ' Unidades detectadas en encabezados: ' + esc(units) + '.' : ''}</p>
      <h4>Asignación de columnas</h4>
      <div class="map-grid">${IM.FIELDS.map(f => `<div class="field"><label>${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label><select data-map="${f.key}">${opt(-1, '— No importar —', imp.mapping[f.key])}${cols.map(i => opt(i, colName(i), imp.mapping[f.key])).join('')}</select></div>`).join('')}
        <div class="field"><label>Separador decimal en el archivo</label><select id="imp-dec">${opt(',', 'Coma (1.234,5)', imp.decimalSep)}${opt('.', 'Punto (1,234.5)', imp.decimalSep)}</select><span class="hint">${an.decimalSep ? 'Detectado automáticamente: ' + (an.decimalSep === ',' ? 'coma' : 'punto') : 'Sin evidencia en el archivo; se usa la configuración.'}</span></div>
        <div class="field"><label>Modo de importación</label><select id="imp-mode">${opt('replace', 'Reemplazar los datos de la empresa activa', imp.mode)}${opt('merge', 'Combinar: actualizar meses existentes y agregar nuevos', imp.mode)}${opt('new', 'Crear una empresa nueva con estos datos', imp.mode)}</select></div>
      </div>
      <h4>Vista previa (primeras ${prev.length} filas interpretadas)</h4>
      ${V.table(['Mes', 'Consumo', 'Producción', 'Unidades'], prev.map(r => [D.formatMonth(D.parseMonth(r.month)) || String(r.month), { t: typeof r.E === 'number' ? F.auto(r.E) : String(r.E || '—'), num: true }, { t: typeof r.P === 'number' ? F.auto(r.P) : String(r.P || '—'), num: true }, [r.eUnit, r.pUnit].filter(Boolean).join(' / ')]), { compact: true })}
      <p>${V.badge(vs.usable.length ? 'good' : 'bad', `${vs.usable.length} fila(s) reales válidas`)} ${built.budget.length ? V.badge('neutral', `${built.budget.length} fila(s) con presupuesto`) : ''} ${vs.issues.filter(i => i.level === 'error').length ? V.badge('warn', vs.issues.filter(i => i.level === 'error').length + ' problema(s): podrá corregirlos en la tabla') : ''}</p>
      ${built.notes.length ? `<p class="muted">${built.notes.map(esc).join(' ')}</p>` : ''}`;
    $('#dlg-import .dlg-foot').innerHTML = `<button class="btn" data-imp="close">Cancelar</button><button class="btn btn-primary" data-imp="do">Importar</button>`;
  }
  /** Convierte el presupuesto importado a las unidades del proyecto (la tabla única no guarda unidades de presupuesto). */
  function budgetToProjectUnits(b, warn) {
    const conv = (v, from, to) => { if (typeof v !== 'number' || !from) return v; const f = U.factor(U.normalizeUnit(from), to); if (f == null) { warn.push(`${b.month}: unidad "${from}" del presupuesto no convertible`); return v; } return v * f; };
    return { month: b.month, E: conv(b.E, b.eUnit, D.energyUnit(cfg())), P: conv(b.P, b.pUnit, D.productionUnit(cfg())) };
  }
  function doImport() {
    const built = importBuild();
    if (!built.real.length && !built.budget.length) { toast('No hay filas para importar. Revise la asignación de columnas.'); return; }
    const warn = [];
    const budget = built.budget.map(b => budgetToProjectUnits(b, warn));
    if (imp.mode === 'new') {
      const p = newCompany(); p.config = JSON.parse(JSON.stringify(cfg())); p.company.name = (imp.fileName || 'Empresa importada').replace(/\.[^.]+$/, '');
      p.real = D.mergeBudgetIntoRows(built.real, budget);
      ws.companies.push(p); setActive(p.id);
    } else if (imp.mode === 'replace') project.real = D.mergeBudgetIntoRows(built.real, budget);
    else {
      const byMonth = new Map(project.real.map(r => [D.parseMonth(r.month) || r.month, r]));
      built.real.forEach(n => { const k = D.parseMonth(n.month) || n.month; const ex = byMonth.get(k); if (ex) { ['E', 'P', 'eUnit', 'pUnit', 'note'].forEach(f => { if (n[f] !== '' && n[f] != null) ex[f] = n[f]; }); if (n.period === 'seguimiento') ex.period = n.period; } else { project.real.push(n); byMonth.set(k, n); } });
      project.real = D.mergeBudgetIntoRows(project.real, budget);
    }
    sortRows(project.real);
    $('#dlg-import').close(); changed(); render();
    toast(`Importación completada: ${built.real.length} fila(s) reales${budget.length ? ' y ' + budget.length + ' con presupuesto' : ''}.${warn.length ? ' Atención: ' + warn.join('; ') : ''}`);
  }
  $('#dlg-import').addEventListener('click', e => {
    const a = e.target.closest('[data-imp]'); if (!a) return;
    const k = a.dataset.imp;
    if (k === 'close') $('#dlg-import').close();
    if (k === 'parse-text') { const t = $('#imp-text').value; if (!t.trim()) { toast('Pegue primero los datos.'); return; } imp.table = IM.fromText(t); imp.fileName = null; imp.sheetIdx = 0; analyzeImport(); }
    if (k === 'do') doImport();
  });
  $('#dlg-import').addEventListener('change', e => {
    if (e.target.matches('[data-map]')) { imp.mapping[e.target.dataset.map] = Number(e.target.value); renderImportMapping(); }
    if (e.target.id === 'imp-dec') { imp.decimalSep = e.target.value; renderImportMapping(); }
    if (e.target.id === 'imp-mode') imp.mode = e.target.value;
    if (e.target.id === 'imp-sheet') { imp.sheetIdx = Number(e.target.value); analyzeImport(); }
  });

  // ---------------- Paso 3: resultados ----------------
  function chartWidth() {
    const w = Math.min(view.clientWidth - 32, 1288);
    const full = Math.max(320, w - 26);
    return { half: w >= 960 ? Math.floor(w / 2 - 40) : full, full };
  }
  function renderResults() {
    if (!hasData()) return `<div class="page-head"><h2>3. Resultados</h2></div>${V.callout('info', 'Primero registre datos reales (paso 2).')}${navFooter(2, null)}`;
    const R = results();
    if (!R.ok) return `<div class="page-head"><h2>3. Resultados</h2></div>${V.callout('error', 'Corrija los errores bloqueantes en el paso 2: ' + R.blocking.map(b => esc(b.message)).join(' '))}${navFooter(2, null)}`;
    const fn = { resumen: V.summary, descriptiva: V.descriptive, linea_base: V.baseline, linea_meta: V.target, indicadores: V.indicators, seguimiento: V.followup, presupuesto: V.budget, huella: V.footprint, oportunidades: V.opportunities, calidad: V.quality, metodologia: V.methodology }[ui.tab];
    return `<div class="page-head"><div><h2>3. Resultados — ${esc(project.company.name || 'Empresa sin nombre')}</h2><p>${esc(D.formatMonth(R.period.start, true))} – ${esc(D.formatMonth(R.period.end, true))} · ${R.counts.used} observaciones · unidades: ${esc(R.units.energy)}, ${esc(R.units.production)}</p></div><span class="spacer"></span><button class="btn" data-go="4">Exportar informe →</button></div>
      <div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button class="tab${ui.tab === id ? ' active' : ''}" role="tab" aria-selected="${ui.tab === id}" data-tab="${id}">${esc(l)}</button>`).join('')}</div>
      <div id="tab-body" role="tabpanel">${fn(R, project, chartWidth())}</div>
      ${navFooter(2, 4, 'Exportar')}`;
  }

  // ---------------- Paso 4: exportar ----------------
  function renderExport() {
    const ok = hasData() && results().ok, dis = ok ? '' : 'disabled';
    return `<div class="page-head"><div><h2>4. Exportar — ${esc(project.company.name || 'Empresa sin nombre')}</h2><p>El informe incluye identificación, periodo, datos y unidades, metodología, fórmulas, resultados, gráficas, indicadores, desviaciones, huella, oportunidades, limitaciones y advertencias.</p></div></div>
      ${ok ? '' : V.callout('warning', 'Complete y valide los datos para habilitar la exportación de resultados.')}
      <div class="card-row">
        <div class="card"><h3>📄 Informe técnico</h3><p class="muted">Documento HTML autónomo. Ábralo y use «Imprimir / Guardar como PDF» para obtener un PDF.</p><div class="toolbar"><button class="btn btn-primary" data-act="report-open" ${dis}>Abrir informe</button><button class="btn" data-act="report-dl" ${dis}>Descargar (.html)</button></div></div>
        <div class="card"><h3>📊 Libro de Excel</h3><p class="muted">Datos, resultados mensuales, huella, advertencias y hojas de <b>verificación con fórmulas de Excel</b> (PENDIENTE, INTERSECCION.EJE, COEFICIENTE.R2, DISTR.T) para que un tercero recalcule la línea base y la línea meta.</p><div class="toolbar"><button class="btn btn-primary" data-act="xlsx" ${dis}>Descargar .xlsx</button></div></div>
        <div class="card"><h3>🧾 CSV</h3><p class="muted">Separado por punto y coma, con coma decimal (abre directamente en Excel en español). El CSV de datos puede volver a importarse.</p><div class="toolbar"><button class="btn" data-act="csv-results" ${dis}>Resultados mensuales</button><button class="btn" data-act="csv-data" ${project.real.length ? '' : 'disabled'}>Datos de entrada</button></div></div>
        <div class="card"><h3>💾 Proyecto</h3><p class="muted">Archivo .json para reabrir el análisis en otro equipo o navegador.</p><div class="toolbar"><button class="btn" data-act="save-company">Esta empresa</button><button class="btn" data-act="save-ws">Todas las empresas</button></div></div>
      </div>
      ${navFooter(3, 5, 'Tablero comparativo')}`;
  }
  function fileBase(p) { return 'analisis_energetico_' + slug((p || project).company.name) + '_' + new Date().toISOString().slice(0, 10); }

  // ---------------- Paso 5 y 6: tablero y ranking ----------------
  function renderDashboard() {
    const B = bench();
    return `<div class="page-head"><div><h2>5. Tablero comparativo entre empresas</h2><p>Qué porcentaje de su meta energética consumió cada empresa y en qué zona quedó. ${ws.companies.length} empresa(s) registradas.</p></div><span class="spacer"></span><button class="btn" data-act="add-company">＋ Agregar empresa</button></div>
      ${ws.companies.length < 2 ? V.callout('info', 'Para comparar, agregue más empresas con <b>＋ Empresa</b> (cada una con sus propios datos) o cargue la demostración de 4 empresas.') + demoCard() : ''}
      ${BV.dashboard(B, chartWidth())}
      ${navFooter(4, 6, 'Ranking')}`;
  }
  function renderRanking() {
    const B = bench();
    return `<div class="page-head"><div><h2>6. Ranking de empresas</h2><p>Empresas con consumos registrados, ordenadas por ahorro demostrado y por factor de emisión.</p></div></div>
      ${BV.ranking(B, chartWidth())}
      ${navFooter(5, null)}`;
  }

  // ---------------- Acciones ----------------
  function addCompany() {
    const p = newCompany();
    const base = project.config;['energyType', 'energyUnit', 'productionUnit', 'decimalSep', 'emissionFactor', 'emissionFactorMass', 'emissionFactorPer', 'footprintFactor'].forEach(k => { p.config[k] = base[k]; });
    ws.companies.push(p); setActive(p.id); changed(); toast('Empresa agregada. Complete su identificación y sus datos.'); go(1);
    setTimeout(() => { const i = $('input[data-path="company.name"]'); if (i) i.focus(); }, 50);
  }
  function deleteCompany() {
    const name = project.company.name || 'empresa sin nombre';
    if (!confirm(`¿Eliminar «${name}» y todos sus datos de este navegador?`)) return;
    ws.companies = ws.companies.filter(c => c.id !== project.id);
    if (!ws.companies.length) ws.companies.push(newCompany());
    ui.cache.delete(project.id); setActive(ws.companies[0].id); changed(); go(ui.step <= 4 ? 1 : ui.step);
  }
  function act(a) {
    const R = () => results();
    switch (a) {
      case 'add-1': addMonths(1); break;
      case 'add-12': addMonths(12); break;
      case 'sort': sortRows(project.real); changed(); render(); break;
      case 'clear': if (confirm('¿Eliminar todos los datos (reales y presupuesto) de esta empresa?')) { project.real = []; changed(); render(); } break;
      case 'import': openImport(false); break;
      case 'paste': openImport(true); break;
      case 'reset-factors': Object.assign(cfg(), { emissionFactor: D.DEFAULT_FACTORS.emissionFactor, emissionFactorMass: 't', emissionFactorPer: 'kWh', footprintFactor: D.DEFAULT_FACTORS.footprintFactor }); changed(); render(); break;
      case 'template': download('plantilla_datos_energeticos.csv', window.EA.csv.stringify([['Mes', `Consumo real (${eLabel()})`, `Producción real (${pLabel()})`, 'Tipo de periodo', 'Incluir', 'Observaciones', `Consumo presupuestado (${eLabel()})`, `Producción presupuestada (${pLabel()})`], ['2024-01', '', '', 'base', 'sí', '', '', ''], ['2024-02', '', '', 'base', 'sí', '', '', '']]), 'text/csv;charset=utf-8'); break;
      case 'report-open': {
        const html = REP.build(project, R());
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const w = window.open(url, '_blank'); if (!w) { toast('El navegador bloqueó la ventana; se descargará el informe.'); download(fileBase() + '_informe.html', html, 'text/html;charset=utf-8'); }
        setTimeout(() => URL.revokeObjectURL(url), 60000); break;
      }
      case 'report-dl': download(fileBase() + '_informe.html', REP.build(project, R()), 'text/html;charset=utf-8'); break;
      case 'xlsx': download(fileBase() + '.xlsx', new Blob([EX.workbook(project, R())], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); break;
      case 'csv-results': download(fileBase() + '_resultados.csv', EX.resultsCSV(R()), 'text/csv;charset=utf-8'); break;
      case 'csv-data': download(fileBase() + '_datos.csv', EX.dataCSV(analysisProject()), 'text/csv;charset=utf-8'); break;
      case 'save-company': download(fileBase() + '.json', EX.projectJSON(project), 'application/json'); break;
      case 'save-ws': download('espacio_empresas_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(Object.assign({}, ws, { exportedAt: new Date().toISOString() }), null, 2), 'application/json'); break;
      case 'add-company': addCompany(); break;
      case 'ranking-csv': download('ranking_empresas_' + new Date().toISOString().slice(0, 10) + '.csv', BV.rankingCSV(bench()), 'text/csv;charset=utf-8'); break;
    }
  }

  // ---------------- Eventos ----------------
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-step]'); if (s) { go(Number(s.dataset.step)); return; }
    const g = e.target.closest('[data-go]'); if (g && !g.disabled) { go(Number(g.dataset.go)); return; }
    const t = e.target.closest('[data-tab]'); if (t) { ui.tab = t.dataset.tab; render(); return; }
    const d = e.target.closest('[data-demo]'); if (d) { loadDemo(d.dataset.demo); return; }
    const oc = e.target.closest('[data-open-company]'); if (oc) { setActive(oc.dataset.openCompany); ui.tab = 'resumen'; go(hasData() ? 3 : 2); return; }
    const del = e.target.closest('[data-del]');
    if (del) { project.real = project.real.filter(r => r.id !== del.dataset.del); changed(); render(); return; }
    const a = e.target.closest('[data-act]'); if (a && !a.disabled) act(a.dataset.act);
    const tipEl = e.target.closest('[data-tip]'); if (tipEl && e.pointerType && e.pointerType !== 'mouse') showTip(tipEl, e);
  });
  view.addEventListener('input', e => {
    if (e.target.closest('table.edit')) { onTableInput(e); return; }
    const p = e.target.dataset.path; if (p && e.target.tagName === 'INPUT') {
      const numeric = /emissionFactor$|footprintFactor$/.test(p);
      if (numeric) { const r = D.parseNumber(e.target.value, ','); setPath(project, p, r.value != null ? r.value : (r.empty ? '' : e.target.value)); } else setPath(project, p, e.target.value);
      changed();
    }
  });
  view.addEventListener('change', e => {
    if (e.target.closest('table.edit')) { onTableInput(e); return; }
    const p = e.target.dataset.path;
    if (p && e.target.tagName === 'SELECT') {
      setPath(project, p, e.target.value);
      if (p === 'config.energyType') { const t = U.ENERGY_TYPES[e.target.value]; if (t && t.units.length && !t.units.includes(cfg().energyUnit)) cfg().energyUnit = t.units[0]; }
      if (p === 'config.energyType' || p === 'config.energyUnit') { const projU = D.energyUnit(cfg()); if (cfg().emissionFactorPer !== 'project' && !U.compatible(cfg().emissionFactorPer, projU)) cfg().emissionFactorPer = 'project'; }
      changed(); render();
    }
    if (e.target.dataset.path && e.target.tagName === 'INPUT' && /emissionFactor$|footprintFactor$/.test(e.target.dataset.path)) render();
  });
  view.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('table.edit input')) {
      e.preventDefault();
      const tr = e.target.closest('tr'), next = tr.nextElementSibling, f = e.target.dataset.f;
      if (next) { const n = $(`input[data-f="${f}"]`, next); if (n) n.focus(); }
      else { e.target.dispatchEvent(new Event('change', { bubbles: true })); addMonths(1); }
    }
  });

  // Tooltips de gráficos
  const tip = $('#tooltip');
  function showTip(el, e) {
    const txt = el.getAttribute('data-tip'); if (!txt) return;
    const [first, ...rest] = txt.split('\n');
    tip.innerHTML = `<span class="tt-title">${esc(first)}</span>${rest.map(esc).join('\n')}`;
    tip.style.display = 'block'; moveTip(e);
  }
  function moveTip(e) { const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight; let x = e.clientX + pad, y = e.clientY + pad; if (x + w > innerWidth - 8) x = e.clientX - w - pad; if (y + h > innerHeight - 8) y = e.clientY - h - pad; tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px'; }
  function hideTip() { tip.style.display = 'none'; }
  view.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el, e); });
  view.addEventListener('mousemove', e => { if (tip.style.display === 'block') moveTip(e); });
  view.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });
  let rz = null, lastW = innerWidth;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if ([3, 5, 6].includes(ui.step) && Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; render(); } }, 250); });

  // Barra superior
  $('#company-select').addEventListener('change', e => { setActive(e.target.value); changed(); render(); });
  $('#btn-add-company').addEventListener('click', addCompany);
  $('#btn-del-company').addEventListener('click', deleteCompany);
  $('#btn-save').addEventListener('click', () => act('save-ws'));
  $('#btn-open').addEventListener('click', () => $('#file-project').click());
  $('#file-project').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      let added = [];
      if (j && Array.isArray(j.companies)) added = j.companies.map(normalizeProject);
      else if (j && Array.isArray(j.real)) added = [normalizeProject(j)];
      else throw new Error('El archivo no es un proyecto de esta aplicación.');
      const onlyEmpty = ws.companies.length === 1 && !hasData(ws.companies[0]) && !ws.companies[0].company.name;
      added.forEach(p => { if (ws.companies.some(c => c.id === p.id)) p.id = D.uid('emp'); });
      ws.companies = onlyEmpty ? added : ws.companies.concat(added);
      setActive(added[0].id); changed(); toast(`${added.length} empresa(s) abiertas.`); go(added.length > 1 ? 5 : 3);
    } catch (err) { toast('No se pudo abrir: ' + err.message); }
    e.target.value = '';
  });
  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  let theme = null; try { theme = localStorage.getItem(THEME_KEY); } catch (e) { }
  applyTheme(theme);
  $('#btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nt = cur === 'dark' ? 'light' : 'dark'; applyTheme(nt); try { localStorage.setItem(THEME_KEY, nt); } catch (e) { }
  });

  // Inicio
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { $('#storage-note').textContent = '⚠ El almacenamiento local no está disponible (modo privado o bloqueado). Los datos se perderán al cerrar la página: use «Guardar» para conservar una copia.'; }
  ui.step = hasData() ? 2 : 1;
  // Enlace de demostración: index.html?demo=24&paso=3&pestana=linea_base  ·  ?demo=multi&paso=5
  const qs = new URLSearchParams(location.search);
  const dq = qs.get('demo');
  if (dq && DEMO.list.some(d => d.id === dq)) {
    if (dq === 'multi') { const cs = DEMO.buildCompanies().map(normalizeProject); ws = { schema: ws.schema, activeId: cs[0].id, companies: cs }; }
    else { const p = normalizeProject(DEMO.build(dq)); ws = { schema: ws.schema, activeId: p.id, companies: [p] }; }
    project = active(); changed(); ui.step = 2;
  }
  if (qs.get('paso')) ui.step = Math.min(6, Math.max(1, Number(qs.get('paso')) || ui.step));
  if (qs.get('pestana') && TABS.some(t => t[0] === qs.get('pestana'))) ui.tab = qs.get('pestana');
  renderCompanyBar(); renderStepper(); render();
})();
