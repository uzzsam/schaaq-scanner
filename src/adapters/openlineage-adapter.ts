// =============================================================================
// OpenLineage Adapter — Parse OpenLineage RunEvent JSON into PipelineMapping
// =============================================================================

import type { PipelineMapping, ColumnMapping, TransformType } from '../types/pipeline';

// ---------------------------------------------------------------------------
// OpenLineage types (subset of the spec we consume)
// ---------------------------------------------------------------------------

interface OLDatasetField {
  name: string;
  type?: string;
}

interface OLInputField {
  namespace: string;
  name: string;          // dataset name
  field: string;         // field/column name
}

interface OLColumnLineageField {
  name: string;          // output field name
  inputFields: OLInputField[];
  transformationDescription?: string;
  transformationType?: string;   // 'IDENTITY' | 'INDIRECT' | 'DIRECT'
}

interface OLColumnLineageFacet {
  fields: OLColumnLineageField[];
}

interface OLDataset {
  namespace: string;
  name: string;
  facets?: {
    schema?: {
      fields?: OLDatasetField[];
    };
    columnLineage?: OLColumnLineageFacet;
    [key: string]: unknown;
  };
}

interface OLRunEvent {
  eventType: string;             // 'START' | 'RUNNING' | 'COMPLETE' | 'FAIL' | 'ABORT'
  eventTime?: string;
  job?: {
    namespace: string;
    name: string;
    facets?: Record<string, unknown>;
  };
  inputs?: OLDataset[];
  outputs?: OLDataset[];
  run?: {
    runId: string;
    facets?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Transform classification for OpenLineage
// ---------------------------------------------------------------------------

/**
 * Classify transform from OpenLineage transformation metadata.
 */
export function classifyFromOL(
  transformationType: string | undefined,
  transformationDescription: string | undefined,
  inputFieldCount: number,
): TransformType {
  // OpenLineage spec defines IDENTITY, INDIRECT, DIRECT
  if (transformationType) {
    const t = transformationType.toUpperCase();
    if (t === 'IDENTITY') return 'identity';
    if (t === 'INDIRECT') return 'derive';
  }

  // If description hints at aggregation
  if (transformationDescription) {
    const desc = transformationDescription.toLowerCase();
    if (/\b(sum|count|avg|average|min|max|group)\b/.test(desc)) return 'aggregate';
    if (/\b(case|when|if|coalesce)\b/.test(desc)) return 'conditional';
    if (/\b(cast|convert|to_date|to_number)\b/.test(desc)) return 'cast';
    if (/\b(concat|substr|trim|replace|upper|lower)\b/.test(desc)) return 'derive';
  }

  // Multiple input fields → likely a derive
  if (inputFieldCount > 1) return 'derive';

  return 'identity';
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Parse one or more OpenLineage RunEvent JSON documents into a PipelineMapping.
 * Accepts either a single RunEvent or an array of RunEvents.
 *
 * Only COMPLETE events are processed (they have final lineage information).
 */
export function parseOpenLineageEvents(buffer: Buffer): PipelineMapping {
  let raw: unknown;
  try {
    raw = JSON.parse(buffer.toString('utf-8'));
  } catch {
    throw new Error('Invalid OpenLineage JSON: not valid JSON');
  }

  // Normalise to array
  const events: OLRunEvent[] = Array.isArray(raw) ? raw : [raw];

  // Filter to COMPLETE events only
  const completeEvents = events.filter(e => e.eventType === 'COMPLETE');
  if (completeEvents.length === 0 && events.length > 0) {
    // If no COMPLETE events but there are events, use all of them as fallback
    completeEvents.push(...events);
  }

  if (completeEvents.length === 0) {
    throw new Error('No OpenLineage RunEvents found in input');
  }

  const allMappings: ColumnMapping[] = [];
  const jobNames = new Set<string>();

  for (const event of completeEvents) {
    const jobName = event.job?.name ?? null;
    if (jobName) jobNames.add(jobName);

    const outputs = event.outputs ?? [];
    const inputs = event.inputs ?? [];

    // Build input dataset → schema lookup
    const inputSchemaMap = new Map<string, Map<string, OLDatasetField>>();
    for (const input of inputs) {
      const key = `${input.namespace}/${input.name}`;
      const fields = new Map<string, OLDatasetField>();
      if (input.facets?.schema?.fields) {
        for (const f of input.facets.schema.fields) {
          fields.set(f.name.toLowerCase(), f);
        }
      }
      inputSchemaMap.set(key, fields);
    }

    for (const output of outputs) {
      const targetTable = output.name;
      const columnLineage = output.facets?.columnLineage;

      if (columnLineage?.fields) {
        // Explicit column lineage facet — best case
        for (const field of columnLineage.fields) {
          const targetColumn = field.name;

          if (field.inputFields.length === 0) {
            // No input fields — derived from nothing (generate/constant)
            allMappings.push({
              sourceTable: targetTable,
              sourceColumn: '[generated]',
              targetTable,
              targetColumn,
              transformType: 'derive',
              transformLogic: field.transformationDescription ?? null,
              sourceType: null,
              targetType: null,
              pipelineName: jobName,
            });
            continue;
          }

          const transformType = classifyFromOL(
            field.transformationType,
            field.transformationDescription,
            field.inputFields.length,
          );

          for (const inputField of field.inputFields) {
            const sourceTable = inputField.name;
            const sourceColumn = inputField.field;

            // Try to look up types from input schema
            const inputKey = `${inputField.namespace}/${inputField.name}`;
            const inputFields = inputSchemaMap.get(inputKey);
            const sourceFieldMeta = inputFields?.get(sourceColumn.toLowerCase());

            // Try to get target type from output schema
            const outputFields = output.facets?.schema?.fields;
            const targetFieldMeta = outputFields?.find(
              f => f.name.toLowerCase() === targetColumn.toLowerCase()
            );

            allMappings.push({
              sourceTable,
              sourceColumn,
              targetTable,
              targetColumn,
              transformType,
              transformLogic: field.transformationDescription ?? null,
              sourceType: sourceFieldMeta?.type ?? null,
              targetType: targetFieldMeta?.type ?? null,
              pipelineName: jobName,
            });
          }
        }
      } else {
        // No column lineage facet — fall back to schema-level matching
        const outputFields = output.facets?.schema?.fields ?? [];

        for (const input of inputs) {
          const inputFields = input.facets?.schema?.fields ?? [];
          const inputFieldNames = new Set(inputFields.map(f => f.name.toLowerCase()));
          const inputFieldMap = new Map(inputFields.map(f => [f.name.toLowerCase(), f]));

          for (const outField of outputFields) {
            if (inputFieldNames.has(outField.name.toLowerCase())) {
              const inField = inputFieldMap.get(outField.name.toLowerCase())!;
              const hasTypeChange = inField.type && outField.type &&
                inField.type.toLowerCase() !== outField.type.toLowerCase();

              allMappings.push({
                sourceTable: input.name,
                sourceColumn: inField.name,
                targetTable: targetTable,
                targetColumn: outField.name,
                transformType: hasTypeChange ? 'cast' : 'identity',
                transformLogic: null,
                sourceType: inField.type ?? null,
                targetType: outField.type ?? null,
                pipelineName: jobName,
              });
            }
          }
        }
      }
    }
  }

  return {
    sourceFormat: 'openlineage',
    extractedAt: new Date().toISOString(),
    mappings: allMappings,
    metadata: {
      totalJobs: jobNames.size,
    },
  };
}
