/*
 * units.js — Registro de unidades y conversiones.
 * Cada unidad pertenece a una "dimensión". Solo se convierte entre unidades de la misma dimensión
 * (por ejemplo kWh ↔ MWh ↔ GJ). Convertir entre dimensiones distintas (m³ de gas → kWh) requiere
 * un poder calorífico que la aplicación NO supone: se reporta como incompatibilidad.
 */
(function (global) {
  'use strict';
  const EA = global.EA || (global.EA = {});

  // factor = valor de 1 unidad expresado en la unidad de referencia de su dimensión
  const UNITS = {
    // Energía (referencia: kWh). 1 MJ = 1/3,6 kWh; 1 MMBTU = 293,07107 kWh (BTU internacional).
    'kWh': { dim: 'energia', factor: 1, label: 'kWh' },
    'MWh': { dim: 'energia', factor: 1000, label: 'MWh' },
    'GWh': { dim: 'energia', factor: 1e6, label: 'GWh' },
    'MJ': { dim: 'energia', factor: 1 / 3.6, label: 'MJ' },
    'GJ': { dim: 'energia', factor: 1000 / 3.6, label: 'GJ' },
    'MMBTU': { dim: 'energia', factor: 293.07107, label: 'MMBTU' },
    // Volumen de gas (referencia: m³). No se convierte a energía sin poder calorífico.
    'm³ gas': { dim: 'volumen_gas', factor: 1, label: 'm³ (gas)' },
    'kpc gas': { dim: 'volumen_gas', factor: 28.316846592, label: 'kpc (miles de pies³ de gas)' },
    // Masa de vapor (referencia: kg)
    'kg vapor': { dim: 'masa_vapor', factor: 1, label: 'kg de vapor' },
    't vapor': { dim: 'masa_vapor', factor: 1000, label: 't de vapor' },
    // Combustibles líquidos (referencia: L)
    'L comb': { dim: 'volumen_combustible', factor: 1, label: 'L (combustible)' },
    'gal comb': { dim: 'volumen_combustible', factor: 3.785411784, label: 'gal (combustible)' },
    // Combustibles sólidos (referencia: kg)
    'kg comb': { dim: 'masa_combustible', factor: 1, label: 'kg (combustible)' },
    't comb': { dim: 'masa_combustible', factor: 1000, label: 't (combustible)' },

    // Producción — volumen (referencia: L)
    'L': { dim: 'volumen', factor: 1, label: 'L' },
    'hL': { dim: 'volumen', factor: 100, label: 'hL' },
    'm³': { dim: 'volumen', factor: 1000, label: 'm³' },
    'gal': { dim: 'volumen', factor: 3.785411784, label: 'gal' },
    // Producción — masa (referencia: kg)
    'kg': { dim: 'masa', factor: 1, label: 'kg' },
    't': { dim: 'masa', factor: 1000, label: 't' },
    // Producción — conteo (referencia: unidad)
    'unidades': { dim: 'conteo', factor: 1, label: 'unidades' },
    'miles de unidades': { dim: 'conteo', factor: 1000, label: 'miles de unidades' },
    'cajas': { dim: 'cajas', factor: 1, label: 'cajas' },
    'cajas unitarias': { dim: 'cajas_unitarias', factor: 1, label: 'cajas unitarias' }
  };

  const ENERGY_TYPES = {
    electricidad: { label: 'Electricidad', units: ['kWh', 'MWh', 'GWh', 'MJ', 'GJ'] },
    gas_natural: { label: 'Gas natural', units: ['m³ gas', 'kpc gas', 'kWh', 'MWh', 'MJ', 'GJ', 'MMBTU'] },
    vapor: { label: 'Vapor', units: ['kg vapor', 't vapor', 'MJ', 'GJ', 'kWh'] },
    combustible_liquido: { label: 'Combustible líquido (diésel, fuelóleo, GLP)', units: ['L comb', 'gal comb', 'MJ', 'GJ', 'kWh'] },
    combustible_solido: { label: 'Combustible sólido (carbón, biomasa)', units: ['kg comb', 't comb', 'MJ', 'GJ', 'kWh'] },
    energia_total: { label: 'Energía total (ya convertida a una unidad común por la empresa)', units: ['kWh', 'MWh', 'MJ', 'GJ'] },
    otro: { label: 'Otro energético (unidad personalizada)', units: [] }
  };

  const PRODUCTION_UNITS = ['L', 'hL', 'm³', 'gal', 'kg', 't', 'unidades', 'miles de unidades', 'cajas', 'cajas unitarias'];

  // Alias aceptados al importar (en minúsculas y sin espacios repetidos)
  const ALIASES = {
    'kwh': 'kWh', 'kw-h': 'kWh', 'kw h': 'kWh', 'mwh': 'MWh', 'gwh': 'GWh', 'mj': 'MJ', 'gj': 'GJ', 'mmbtu': 'MMBTU',
    'm3 gas': 'm³ gas', 'm³ gas': 'm³ gas', 'm3 (gas)': 'm³ gas', 'm³ (gas)': 'm³ gas', 'kpc': 'kpc gas', 'kpc gas': 'kpc gas',
    'kg vapor': 'kg vapor', 't vapor': 't vapor', 'ton vapor': 't vapor',
    'l': 'L', 'lt': 'L', 'lts': 'L', 'litro': 'L', 'litros': 'L', 'hl': 'hL', 'hectolitros': 'hL', 'hectolitro': 'hL',
    'm3': 'm³', 'm³': 'm³', 'gal': 'gal', 'galones': 'gal', 'kg': 'kg', 'kilogramos': 'kg', 't': 't', 'ton': 't', 'tons': 't',
    'toneladas': 't', 'tonelada': 't', 'u': 'unidades', 'und': 'unidades', 'unds': 'unidades', 'unidad': 'unidades',
    'unidades': 'unidades', 'miles de unidades': 'miles de unidades', 'cajas': 'cajas', 'caja': 'cajas',
    'cajas unitarias': 'cajas unitarias', 'cu': 'cajas unitarias'
  };

  /** Normaliza un texto de unidad a un id registrado; si no se reconoce, devuelve "custom:<texto>". */
  function normalizeUnit(text) {
    if (text == null) return null;
    const raw = String(text).trim();
    if (!raw) return null;
    if (UNITS[raw]) return raw;
    const k = raw.toLowerCase().replace(/\s+/g, ' ');
    if (ALIASES[k]) return ALIASES[k];
    return 'custom:' + raw;
  }
  function unitInfo(id) {
    if (!id) return null;
    if (UNITS[id]) return Object.assign({ id }, UNITS[id]);
    const txt = String(id).replace(/^custom:/, '');
    return { id: 'custom:' + txt, dim: 'custom:' + txt.toLowerCase(), factor: 1, label: txt, custom: true };
  }
  function unitLabel(id) { const u = unitInfo(id); return u ? u.label : ''; }
  function compatible(a, b) { const ua = unitInfo(a), ub = unitInfo(b); return !!(ua && ub && ua.dim === ub.dim); }
  /** Factor multiplicativo para pasar de la unidad `from` a la unidad `to`; null si son incompatibles. */
  function factor(from, to) {
    const ua = unitInfo(from), ub = unitInfo(to);
    if (!ua || !ub || ua.dim !== ub.dim) return null;
    return ua.factor / ub.factor;
  }
  function convert(value, from, to) { const f = factor(from, to); return f == null ? null : value * f; }
  function isEnergyUnitAllowed(type, unit) {
    const t = ENERGY_TYPES[type]; if (!t) return false;
    if (type === 'otro') return true;
    return t.units.includes(unit);
  }

  const api = { UNITS, ENERGY_TYPES, PRODUCTION_UNITS, normalizeUnit, unitInfo, unitLabel, compatible, factor, convert, isEnergyUnitAllowed };
  EA.units = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
