/**
 * Assessment Manifest — Barrel Export
 */

// Types
export type {
  AssessmentManifest,
  ManifestVersionInfo,
  ManifestRunMetadata,
  ManifestScanCoverage,
  ManifestComponentAvailability,
  ManifestStatusIndicator,
} from './types';

export {
  MANIFEST_STATUS_COLORS,
  MANIFEST_STATUS_LABELS,
} from './types';

// Constants
export { SCHEMA_VERSION, MANIFEST_VERSION } from './constants';

// Service
export {
  buildAssessmentManifest,
  buildVersionInfo,
  buildRunMetadata,
  buildScanCoverage,
  buildComponentAvailability,
  deriveStatusIndicator,
} from './manifest-service';
