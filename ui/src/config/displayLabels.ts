/**
 * Display Labels — Technical vs Executive mode
 *
 * Maps internal/technical terminology to plain-English executive labels.
 * Numbers stay identical — only labels change.
 */

export type DisplayMode = 'technical' | 'executive';

export interface LabelPair {
  technical: string;
  executive: string;
}

/**
 * All label pairs keyed by a stable identifier.
 * Use the key to look up the pair, then select .technical or .executive
 * based on the current display mode.
 */
export const LABELS = {
  // Engine layers
  shannonEntropy:        { technical: 'Shannon Entropy',            executive: 'Data Disorder Score' },
  baseCostModel:         { technical: 'Base Cost Model',            executive: 'Direct Cost Estimate' },
  findingsAdjustment:    { technical: 'Findings Adjustment',        executive: 'Issue-Based Adjustment' },
  leontiefAmplification: { technical: 'Leontief Amplification',     executive: 'Dependency Cascade Model' },
  fiveYearProjection:    { technical: '5-Year Projection',          executive: '5-Year Cost Outlook' },

  // Metrics
  disorderScore:         { technical: 'Disorder Score',             executive: 'Data Disorder Index' },
  entropyScore:          { technical: 'Entropy Score',              executive: 'Disorder Score' },
  spectralRadius:        { technical: 'Spectral Radius',            executive: 'System Coupling Strength' },
  amplificationRatio:    { technical: 'Amplification Ratio',        executive: 'Cascade Multiplier' },
  adjustedMaturity:      { technical: 'Adjusted Maturity',          executive: 'Architecture Maturity' },
  baseMaturity:          { technical: 'Base Maturity',              executive: 'Starting Maturity' },
  overallMaturity:       { technical: 'Overall Maturity',           executive: 'Overall Maturity' },

  // Cost labels
  amplifiedCost:         { technical: 'Amplified Cost',             executive: 'Total Estimated Cost' },
  baseCost:              { technical: 'Base Cost (Pre-Amplification)', executive: 'Direct Costs Only' },
  amplifiedTotal:        { technical: 'Amplified Total',            executive: 'Total Annual Cost' },

  // Cost categories
  firefighting:          { technical: 'Engineering Firefighting',   executive: 'Unplanned Rework' },
  dataQuality:           { technical: 'Data Quality',               executive: 'Data Quality Issues' },
  integration:           { technical: 'Failed Integration',         executive: 'Integration Failures' },
  productivity:          { technical: 'Productivity Drain',         executive: 'Lost Productivity' },
  regulatory:            { technical: 'Regulatory Exposure',        executive: 'Compliance Risk' },

  // Report sections
  propertyMaturity:      { technical: 'Property Maturity Assessment', executive: 'Architecture Health Assessment' },
  costBreakdown:         { technical: 'Cost Breakdown',             executive: 'Cost Breakdown' },
  canonicalInvestment:   { technical: 'Canonical Investment',       executive: 'Recommended Investment' },
  paybackPeriod:         { technical: 'Payback Period',             executive: 'Payback Period' },
} as const satisfies Record<string, LabelPair>;

export type LabelKey = keyof typeof LABELS;

/**
 * Get a label for the given key in the specified mode.
 */
export function getLabel(key: LabelKey, mode: DisplayMode): string {
  return LABELS[key][mode];
}

/**
 * Get all cost category labels for the specified mode.
 * Drop-in replacement for COST_CATEGORY_LABELS in utils.ts.
 */
export function getCostCategoryLabels(mode: DisplayMode): Record<string, string> {
  return {
    firefighting: LABELS.firefighting[mode],
    dataQuality: LABELS.dataQuality[mode],
    integration: LABELS.integration[mode],
    productivity: LABELS.productivity[mode],
    regulatory: LABELS.regulatory[mode],
  };
}
