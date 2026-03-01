// =============================================================================
// Transform Clarity Checks — Dictionaries & Reference Data
//
// Business term conflict groups, type precision rankings, aggregation
// functions, and unit-bearing column patterns used across transform checks.
// =============================================================================

// ---------------------------------------------------------------------------
// Business Term Conflict Groups (SD-1: Alias Misalignment)
//
// Each group contains terms that are semantically related but NOT synonyms.
// Using them interchangeably in transformations silently changes meaning.
// ---------------------------------------------------------------------------

export interface TermConflictGroup {
  label: string;
  terms: string[];
}

export const TERM_CONFLICT_GROUPS: TermConflictGroup[] = [
  {
    label: 'Revenue vs Income vs Sales',
    terms: ['revenue', 'income', 'sales', 'turnover', 'proceeds', 'receipts'],
  },
  {
    label: 'Cost vs Expense vs Charge',
    terms: ['cost', 'expense', 'charge', 'fee', 'price', 'rate', 'spend'],
  },
  {
    label: 'Customer vs Client vs Account',
    terms: ['customer', 'client', 'account', 'buyer', 'patron', 'consumer'],
  },
  {
    label: 'Employee vs Staff vs Worker',
    terms: ['employee', 'staff', 'worker', 'personnel', 'headcount', 'fte'],
  },
  {
    label: 'Site vs Location vs Facility vs Plant',
    terms: ['site', 'location', 'facility', 'plant', 'premises', 'venue', 'campus'],
  },
  {
    label: 'Quantity vs Amount vs Volume',
    terms: ['quantity', 'amount', 'volume', 'count', 'total', 'sum', 'number'],
  },
  {
    label: 'Date vs Timestamp vs Period',
    terms: ['date', 'timestamp', 'datetime', 'period', 'interval', 'time'],
  },
  {
    label: 'Emission vs Discharge vs Release',
    terms: ['emission', 'discharge', 'release', 'output', 'effluent'],
  },
  {
    label: 'Concentration vs Level vs Reading',
    terms: ['concentration', 'level', 'reading', 'measurement', 'value', 'result'],
  },
  {
    label: 'Approved vs Authorised vs Validated',
    terms: ['approved', 'authorised', 'authorized', 'validated', 'verified', 'confirmed', 'certified'],
  },
  {
    label: 'ID vs Code vs Key vs Ref',
    terms: ['id', 'code', 'key', 'ref', 'reference', 'identifier', 'number'],
  },
  {
    label: 'Active vs Enabled vs Open',
    terms: ['active', 'enabled', 'open', 'live', 'current', 'valid'],
  },
];

// ---------------------------------------------------------------------------
// Type Precision Ranking (SD-2: Type Coercion Risk)
//
// Higher rank = more precise. Casting from higher to lower loses information.
// ---------------------------------------------------------------------------

export const TYPE_PRECISION_RANK: Record<string, number> = {
  // High precision
  'timestamp': 10,
  'timestamptz': 10,
  'datetime': 10,
  'datetime2': 10,
  'timestamp with time zone': 10,
  'timestamp without time zone': 10,

  'date': 8,

  'numeric': 7,
  'decimal': 7,
  'money': 7,

  'double': 6,
  'double precision': 6,
  'float8': 6,
  'float': 5,
  'real': 5,
  'float4': 5,

  'bigint': 4,
  'int8': 4,
  'long': 4,

  'integer': 3,
  'int': 3,
  'int4': 3,
  'mediumint': 3,

  'smallint': 2,
  'int2': 2,
  'tinyint': 2,

  'boolean': 1,
  'bool': 1,
  'bit': 1,

  // String types — considered "low precision" for numeric coercion
  'varchar': 0,
  'char': 0,
  'text': 0,
  'nvarchar': 0,
  'nchar': 0,
  'ntext': 0,
  'string': 0,
  'clob': 0,
};

/**
 * Normalise a database type name to a lookup key.
 * Strips length/precision suffixes: VARCHAR(255) → varchar, NUMERIC(10,2) → numeric
 */
export function normaliseTypeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if casting from sourceType to targetType loses precision.
 */
export function isLossyCast(sourceType: string, targetType: string): boolean {
  const srcRank = TYPE_PRECISION_RANK[normaliseTypeName(sourceType)];
  const tgtRank = TYPE_PRECISION_RANK[normaliseTypeName(targetType)];
  if (srcRank === undefined || tgtRank === undefined) return false;
  return srcRank > tgtRank;
}

// ---------------------------------------------------------------------------
// Aggregation Functions (SD-3: Undocumented Aggregation)
//
// Transform rules that reduce cardinality. If these appear in the rule but
// the notes/description field is empty, the aggregation is undocumented.
// ---------------------------------------------------------------------------

export const AGGREGATION_FUNCTIONS = [
  'sum', 'avg', 'average', 'mean',
  'count', 'count_distinct', 'countdistinct',
  'min', 'max',
  'group_by', 'groupby', 'group by',
  'rollup', 'cube',
  'listagg', 'string_agg', 'group_concat',
  'median', 'percentile', 'mode',
  'variance', 'var', 'stddev', 'stdev',
  'first', 'last', 'any_value',
  'pivot', 'unpivot',
  'window', 'over', 'partition by',
];

/**
 * Returns true if the transform rule contains an aggregation function.
 */
export function containsAggregation(rule: string): boolean {
  const lower = rule.toLowerCase();
  return AGGREGATION_FUNCTIONS.some((fn) => lower.includes(fn));
}

// ---------------------------------------------------------------------------
// Unit-Bearing Column Patterns (SD-4: Unit Conversion Gap)
//
// Patterns that suggest a column carries unit-specific data (e.g. weight_kg,
// temp_celsius, distance_miles). When source and target column names contain
// different unit suffixes, there is a potential conversion gap.
// ---------------------------------------------------------------------------

export interface UnitPattern {
  unit: string;
  patterns: RegExp[];
  family: string;       // e.g. 'mass', 'length', 'temperature', 'energy', 'volume'
}

export const UNIT_PATTERNS: UnitPattern[] = [
  // Mass
  { unit: 'kg', patterns: [/_kg$/i, /_kilograms?$/i], family: 'mass' },
  { unit: 'g', patterns: [/_g$/i, /_grams?$/i], family: 'mass' },
  { unit: 'lb', patterns: [/_lb$/i, /_lbs$/i, /_pounds?$/i], family: 'mass' },
  { unit: 'oz', patterns: [/_oz$/i, /_ounces?$/i], family: 'mass' },
  { unit: 'tonne', patterns: [/_tonnes?$/i, /_t$/i, /_mt$/i], family: 'mass' },
  { unit: 'ton', patterns: [/_tons?$/i], family: 'mass' },

  // Length / Distance
  { unit: 'km', patterns: [/_km$/i, /_kilometers?$/i, /_kilometres?$/i], family: 'length' },
  { unit: 'm', patterns: [/_m$/i, /_meters?$/i, /_metres?$/i], family: 'length' },
  { unit: 'cm', patterns: [/_cm$/i, /_centimeters?$/i, /_centimetres?$/i], family: 'length' },
  { unit: 'mm', patterns: [/_mm$/i, /_millimeters?$/i, /_millimetres?$/i], family: 'length' },
  { unit: 'mi', patterns: [/_mi$/i, /_miles?$/i], family: 'length' },
  { unit: 'ft', patterns: [/_ft$/i, /_feet$/i, /_foot$/i], family: 'length' },
  { unit: 'in', patterns: [/_in$/i, /_inches?$/i], family: 'length' },

  // Temperature
  { unit: 'celsius', patterns: [/_celsius$/i, /_c$/i, /_degc$/i], family: 'temperature' },
  { unit: 'fahrenheit', patterns: [/_fahrenheit$/i, /_f$/i, /_degf$/i], family: 'temperature' },
  { unit: 'kelvin', patterns: [/_kelvin$/i, /_k$/i], family: 'temperature' },

  // Energy
  { unit: 'kwh', patterns: [/_kwh$/i, /_kilowatt_hours?$/i], family: 'energy' },
  { unit: 'mwh', patterns: [/_mwh$/i, /_megawatt_hours?$/i], family: 'energy' },
  { unit: 'gj', patterns: [/_gj$/i, /_gigajoules?$/i], family: 'energy' },
  { unit: 'btu', patterns: [/_btu$/i], family: 'energy' },
  { unit: 'joule', patterns: [/_j$/i, /_joules?$/i], family: 'energy' },

  // Volume
  { unit: 'l', patterns: [/_l$/i, /_litres?$/i, /_liters?$/i], family: 'volume' },
  { unit: 'ml', patterns: [/_ml$/i, /_millilitres?$/i, /_milliliters?$/i], family: 'volume' },
  { unit: 'gal', patterns: [/_gal$/i, /_gallons?$/i], family: 'volume' },
  { unit: 'm3', patterns: [/_m3$/i, /_cubic_meters?$/i, /_cubic_metres?$/i], family: 'volume' },

  // Concentration
  { unit: 'ppm', patterns: [/_ppm$/i], family: 'concentration' },
  { unit: 'ppb', patterns: [/_ppb$/i], family: 'concentration' },
  { unit: 'mg_l', patterns: [/_mg_l$/i, /_mgl$/i, /_mg_per_l$/i], family: 'concentration' },
  { unit: 'ug_l', patterns: [/_ug_l$/i, /_ugl$/i], family: 'concentration' },

  // Currency
  { unit: 'aud', patterns: [/_aud$/i], family: 'currency' },
  { unit: 'usd', patterns: [/_usd$/i], family: 'currency' },
  { unit: 'eur', patterns: [/_eur$/i], family: 'currency' },
  { unit: 'gbp', patterns: [/_gbp$/i], family: 'currency' },

  // Emissions
  { unit: 'tco2e', patterns: [/_tco2e$/i, /_co2e$/i, /_co2_equiv$/i], family: 'emissions' },
  { unit: 'kgco2e', patterns: [/_kgco2e$/i, /_kg_co2e$/i], family: 'emissions' },
];

/**
 * Detect the unit from a column name. Returns the UnitPattern or undefined.
 */
export function detectUnit(columnName: string): UnitPattern | undefined {
  for (const up of UNIT_PATTERNS) {
    for (const re of up.patterns) {
      if (re.test(columnName)) return up;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Null-Masking Patterns (SD-5: Null Masking)
//
// Transform rules that replace NULL with sentinel values, hiding missing data.
// ---------------------------------------------------------------------------

export const NULL_MASKING_PATTERNS = [
  /coalesce\s*\(/i,
  /ifnull\s*\(/i,
  /isnull\s*\(/i,
  /nvl\s*\(/i,
  /nvl2\s*\(/i,
  /nullif\s*\(/i,
  /zeroifnull/i,
  /case\s+when\s+.*\s+is\s+null/i,
  /iif\s*\(.*null/i,
  /default\s*\(/i,
];

/**
 * Returns true if the transform rule masks NULL values.
 */
export function containsNullMasking(rule: string): boolean {
  return NULL_MASKING_PATTERNS.some((re) => re.test(rule));
}
