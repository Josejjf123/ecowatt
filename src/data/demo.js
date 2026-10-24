/*
 * demo.js — Conjuntos de datos de DEMOSTRACIÓN (ficticios).
 * Generados con una semilla fija para que sean reproducibles. NO son datos de ninguna empresa real.
 * Planta de bebidas ficticia: consumo eléctrico (kWh) frente a producción (L).
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});

  const d17 = [["2023-01",484455,8172100],["2023-02",474504,8348700],["2023-03",507228,8975300],["2023-04",534376,9692500],["2023-05",491445,8578300],["2023-06",524106,9585100],["2023-07",579447,10974200],["2023-08",530760,9370300],["2023-09",536608,9297800],["2023-10",545672,9933400],["2023-11",550975,10096700],["2023-12",610336,11836300],["2024-01",488960,8552500],["2024-02",514047,8883000],["2024-03",541926,9809100],["2024-04",536721,9950000],["2024-05",511425,9128200]];

  // [mes, E real, P real, P presupuestada, E presupuestado]
  const d24 = [["2023-01",502010,8493400,8084000,465899],["2023-02",481449,8549900,8297000,473372],["2023-03",514509,9225000,9173000,504106],["2023-04",499595,8837000,9485000,515052],["2023-05",512207,9171000,9037000,499334],["2023-06",533553,9693600,9827000,527050],["2023-07",565029,10415000,10143000,538137],["2023-08",538878,9717700,9597000,518981],["2023-09",507422,9219700,9048000,499720],["2023-10",530742,9688600,9461000,514210],["2023-11",541890,9872800,10069000,535541],["2023-12",582970,11232400,11458000,584272],["2024-01",503619,8988900,8375000,476109],["2024-02",505912,8721500,8595000,483827],["2024-03",528588,9617400,9501000,515613],["2024-04",557202,10354100,9823000,526910],["2024-05",527265,9491900,9359000,510631],["2024-06",580761,10517500,10176000,539295],["2024-07",589317,11176000,10502000,550732],["2024-08",534596,9453200,9936000,530875],["2024-09",529483,9289000,9366000,510877],["2024-10",558680,10256400,9792000,525823],["2024-11",555656,10523100,10421000,547890],["2024-12",614071,12051100,11857000,598271]];

  // [mes, E real, P real, P presupuestada, E presupuestado, periodo]. 2022-08 se omite a propósito (mes faltante).
  const d36 = [["2022-01",486402,8163300,8084000,465899,"base"],["2022-02",496698,8416500,8297000,473372,"base"],["2022-03",513897,9263200,9173000,504106,"base"],["2022-04",566121,10196200,9485000,515052,"base"],["2022-05",527167,9155300,9037000,499334,"base"],["2022-06",550422,9895200,9827000,527050,"base"],["2022-07",581780,10618500,10143000,538137,"base"],["2022-09",521225,9165900,9048000,499720,"base"],["2022-10",550259,9596900,9461000,514210,"base"],["2022-11",555820,10199300,10069000,535541,"base"],["2022-12",606687,11700000,11458000,584272,"base"],["2023-01",488779,8114100,8375000,476109,"base"],["2023-02",501595,8785000,8595000,483827,"base"],["2023-03",525751,9656200,9501000,515613,"base"],["2023-04",541944,9789000,9823000,526910,"base"],["2023-05",539339,9483600,9359000,510631,"base"],["2023-06",536068,9603200,10176000,539295,"base"],["2023-07",555757,10471100,10502000,550732,"base"],["2023-08",522732,9417600,9936000,530875,"base"],["2023-09",510496,9269300,9366000,510877,"base"],["2023-10",555729,10172600,9792000,525823,"base"],["2023-11",565604,10187200,10421000,547890,"base"],["2023-12",622882,11997400,11857000,598271,"base"],["2024-01",478577,8777100,8666000,486318,"seguimiento"],["2024-02",479344,8721400,8892000,494247,"seguimiento"],["2024-03",524232,10127400,9829000,527121,"seguimiento"],["2024-04",549516,10588100,10161000,538769,"seguimiento"],["2024-05",509779,9267800,9680000,521893,"seguimiento"],["2024-06",545438,10803100,10524000,551504,"seguimiento"],["2024-07",552614,10505700,10861000,563327,"seguimiento"],["2024-08",543464,10364400,10274000,542733,"seguimiento"],["2024-09",533735,10279700,9684000,522033,"seguimiento"],["2024-10",542506,10711300,10124000,537470,"seguimiento"],["2024-11",558771,10881400,10773000,560240,"seguimiento"],["2024-12",623522,13203200,12257000,612305,"seguimiento"]];

  function build(kind) {
    const D = EA.dataset || require('../core/dataset.js');
    const p = D.newProject();
    p.company = { name: 'Embotelladora Demo S.A.S. (datos ficticios)', nit: '000000000-0', site: 'Planta Barranquilla (ficticia)', sector: 'Bebidas', responsible: 'Equipo de gestión energética', notes: 'Datos de demostración generados con semilla fija. No corresponden a ninguna empresa real.' };
    Object.assign(p.config, { energyType: 'electricidad', energyUnit: 'kWh', productionUnit: 'L', productionLabel: 'Bebida envasada' });
    if (kind === '17') {
      p.real = d17.map(([m, E, P]) => Object.assign(D.newRealRow(m), { E, P }));
    } else if (kind === '24') {
      p.real = d24.map(([m, E, P]) => Object.assign(D.newRealRow(m), { E, P }));
      p.budget = d24.map(([m, , , Pb, Eb]) => Object.assign(D.newBudgetRow(m), { E: Eb, P: Pb }));
    } else {
      p.real = d36.map(([m, E, P, , , per]) => Object.assign(D.newRealRow(m), { E, P, period: per }));
      p.budget = d36.map(([m, , , Pb, Eb]) => Object.assign(D.newBudgetRow(m), { E: Eb, P: Pb }));
    }
    return p;
  }

  // ---------- Varias empresas (ficticias) para el tablero comparativo y los rankings ----------
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const SEASON = [0.88, 0.9, 0.98, 1.0, 0.96, 1.02, 1.05, 1.0, 0.95, 0.99, 1.04, 1.13];
  /**
   * Genera una empresa ficticia: E = E0 + m·P (+ ruido), con un cambio de desempeño en el seguimiento.
   * spec: { seed, name, sector, eu, pu, label, E0, m, P0, noise, months, follow, change, budget, start }
   */
  function synthCompany(spec) {
    const D = EA.dataset || require('../core/dataset.js');
    const r = rng(spec.seed), p = D.newProject();
    p.company = { name: spec.name, nit: '', site: spec.site || '', sector: spec.sector, responsible: '', notes: 'Empresa ficticia de demostración (datos generados con semilla fija).' };
    Object.assign(p.config, { energyType: spec.type || 'electricidad', energyUnit: spec.eu, productionUnit: spec.pu, productionLabel: spec.label });
    if (spec.eu === 'MWh') p.config.emissionFactorPer = 'kWh'; // el factor sigue por kWh; se convierte automáticamente
    const start = spec.start || '2022-01';
    for (let i = 0; i < spec.months; i++) {
      const m = D.addMonths(start, i), mon = Number(m.slice(5)) - 1;
      const P = Math.round(spec.P0 * SEASON[mon] * (1 + 0.035 * gauss(r)) * (1 + 0.003 * i));
      const follow = spec.follow && i >= spec.months - spec.follow;
      const f = follow ? 1 - spec.change : 1;
      const E = Math.round(((spec.E0 + spec.m * P) * f + spec.noise * gauss(r)) * 100) / 100;
      const row = Object.assign(D.newRealRow(m), { E, P, period: follow ? 'seguimiento' : 'base' });
      if (spec.budget && i >= spec.months - 12) { const Pb = Math.round(spec.P0 * SEASON[mon] * (1 + 0.003 * i)); row.Pb = Pb; row.Eb = Math.round((spec.E0 + spec.m * Pb) * (1 - spec.budget)); }
      p.real.push(row);
    }
    return p;
  }
  function buildCompanies() {
    const emb = build('36');
    const pla = synthCompany({ seed: 101, name: 'Plásticos del Caribe Demo (ficticia)', sector: 'Plásticos', site: 'Malambo', eu: 'kWh', pu: 'kg', label: 'Producto plástico', E0: 90000, m: 0.62, P0: 300000, noise: 4500, months: 36, follow: 12, change: 0.07, budget: 0.03 });
    const ali = synthCompany({ seed: 202, name: 'Alimentos Costa Demo (ficticia)', sector: 'Alimentos', site: 'Soledad', eu: 'MWh', pu: 't', label: 'Alimento procesado', E0: 120, m: 0.35, P0: 1100, noise: 6, months: 30, follow: 6, change: -0.025, budget: 0.02 });
    const tex = synthCompany({ seed: 303, name: 'Textiles Atlántico Demo (ficticia)', sector: 'Textil', site: 'Barranquilla', eu: 'kWh', pu: 'unidades', label: 'Prenda', E0: 40000, m: 0.9, P0: 75000, noise: 2600, months: 18, follow: 0, change: 0 });
    // Factores de emisión distintos (ficticios) para ilustrar el ranking; la empresa 1 usa los valores por defecto del Excel
    pla.config.emissionFactor = 0.39; pla.company.notes += ' Factor de emisión ficticio (autogeneración solar parcial).';
    tex.config.emissionFactor = 0.47; tex.company.notes += ' Factor de emisión ficticio.';
    return [emb, pla, ali, tex];
  }

  const api = {
    raw: { d17, d24, d36 },
    list: [
      { id: '17', label: '17 meses (estructura del estudio de referencia)', desc: 'Solo datos reales, ene 2023 – may 2024.' },
      { id: '24', label: '24 meses con presupuesto', desc: 'Datos reales y presupuesto mensual, ene 2023 – dic 2024.' },
      { id: '36', label: '36 meses: base + seguimiento', desc: '24 meses base + 12 de seguimiento con mejora, presupuesto y un mes faltante.' },
      { id: 'multi', label: '4 empresas para comparar', desc: 'Empresas ficticias de distintos sectores y unidades, para el tablero y los rankings.', multi: true }
    ],
    build, buildCompanies, synthCompany
  };
  EA.demo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
