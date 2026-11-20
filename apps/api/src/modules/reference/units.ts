export type Dimension = 'count' | 'mass' | 'volume' | 'length' | 'area' | 'time' | 'data' | 'service';

export const BASE_UNITS: Record<Dimension, string> = { count: 'pcs', mass: 'kg', volume: 'l', length: 'm', area: 'm2', time: 'day', data: 'tb', service: 'service' };
export const DIMENSIONS: Dimension[] = ['count', 'mass', 'volume', 'length', 'area', 'time', 'data', 'service'];

interface UnitDef {
  unit: string; // canonical unit code
  dimension: Dimension;
  factor: number; // multiply a quantity in this unit to get the dimension's base unit
  aliases: string[];
  /** base unit when it differs from the dimension's default (e.g. boxes are not converted to pieces) */
  base?: string;
}

const DEFS: UnitDef[] = [
  { unit: 'pcs', dimension: 'count', factor: 1, aliases: ['pc', 'pcs', 'piece', 'pieces', 'nos', 'no', 'number', 'unit', 'units', 'each', 'ea', 'qty'] },
  { unit: 'dozen', dimension: 'count', factor: 12, aliases: ['dozen', 'doz', 'dz', 'dzn'] },
  { unit: 'pair', dimension: 'count', factor: 2, aliases: ['pair', 'pairs', 'prs'] },
  { unit: 'gross', dimension: 'count', factor: 144, aliases: ['gross', 'grs'] },
  { unit: 'box', dimension: 'count', factor: 1, base: 'box', aliases: ['box', 'boxes', 'bx', 'carton', 'ctn'] },
  { unit: 'm2', dimension: 'area', factor: 1, aliases: ['m2', 'sqm', 'sq m', 'sq.m', 'square meter', 'square metre', 'square meters', 'square metres'] },
  { unit: 'sqft', dimension: 'area', factor: 0.09290304, aliases: ['sqft', 'sq ft', 'square foot', 'square feet'] },
  { unit: 'day', dimension: 'time', factor: 1, aliases: ['day', 'days', 'man-day', 'man day', 'person-day'] },
  { unit: 'hour', dimension: 'time', factor: 1 / 8, aliases: ['hour', 'hours', 'hr', 'hrs'] },
  { unit: 'tb', dimension: 'data', factor: 1, aliases: ['tb', 'terabyte', 'terabytes'] },
  { unit: 'gb', dimension: 'data', factor: 0.001, aliases: ['gb', 'gigabyte', 'gigabytes'] },
  { unit: 'shipment', dimension: 'service', factor: 1, base: 'shipment', aliases: ['shipment', 'shipments', 'consignment'] },
  { unit: 'campaign', dimension: 'service', factor: 1, base: 'campaign', aliases: ['campaign', 'campaigns'] },
  { unit: 'job', dimension: 'service', factor: 1, base: 'job', aliases: ['job', 'jobs', 'service', 'lot', 'ls', 'lump sum'] },
  { unit: 'kg', dimension: 'mass', factor: 1, aliases: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  { unit: 'g', dimension: 'mass', factor: 0.001, aliases: ['g', 'gm', 'gms', 'gram', 'grams'] },
  { unit: 'mg', dimension: 'mass', factor: 0.000001, aliases: ['mg', 'milligram', 'milligrams'] },
  { unit: 't', dimension: 'mass', factor: 1000, aliases: ['t', 'ton', 'tons', 'tonne', 'tonnes', 'mt'] },
  { unit: 'lb', dimension: 'mass', factor: 0.45359237, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  { unit: 'l', dimension: 'volume', factor: 1, aliases: ['l', 'ltr', 'ltrs', 'lt', 'liter', 'liters', 'litre', 'litres'] },
  { unit: 'ml', dimension: 'volume', factor: 0.001, aliases: ['ml', 'mls', 'milliliter', 'millilitre', 'milliliters', 'millilitres'] },
  { unit: 'gal', dimension: 'volume', factor: 3.785411784, aliases: ['gal', 'gallon', 'gallons'] },
  { unit: 'm', dimension: 'length', factor: 1, aliases: ['m', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres'] },
  { unit: 'cm', dimension: 'length', factor: 0.01, aliases: ['cm', 'centimeter', 'centimetre', 'centimeters', 'centimetres'] },
  { unit: 'mm', dimension: 'length', factor: 0.001, aliases: ['mm', 'millimeter', 'millimetre', 'millimeters', 'millimetres'] },
  { unit: 'km', dimension: 'length', factor: 1000, aliases: ['km', 'kilometer', 'kilometre', 'kilometers', 'kilometres'] },
  { unit: 'ft', dimension: 'length', factor: 0.3048, aliases: ['ft', 'feet', 'foot'] },
  { unit: 'in', dimension: 'length', factor: 0.0254, aliases: ['in', 'inch', 'inches'] },
];

const ALIAS_INDEX = new Map<string, UnitDef>();
for (const def of DEFS) for (const a of def.aliases) ALIAS_INDEX.set(a, def);

export interface NormalizedUnit {
  unit: string;
  dimension: Dimension;
  factor: number;
  baseUnit: string;
}

/** Maps free text ("Kgs", "L.", "Dozen") to a canonical unit; null if unknown. */
export function normalizeUnit(raw: unknown): NormalizedUnit | null {
  if (raw == null) return null;
  const key = String(raw).toLowerCase().trim().replace(/[.\s]+$/g, '').replace(/^[.\s]+/g, '');
  const def = ALIAS_INDEX.get(key);
  if (!def) return null;
  return { unit: def.unit, dimension: def.dimension, factor: def.factor, baseUnit: def.base ?? BASE_UNITS[def.dimension] };
}

export const listUnits = () =>
  DEFS.map((d) => ({ unit: d.unit, dimension: d.dimension, factorToBase: d.factor, baseUnit: d.base ?? BASE_UNITS[d.dimension], aliases: d.aliases }));
