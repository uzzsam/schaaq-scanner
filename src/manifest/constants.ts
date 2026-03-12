/**
 * Manifest Constants
 *
 * Schema version re-exported for manifest layer consumption.
 * Kept in sync with src/server/db/schema.ts.
 */

// Mirror of the schema version in src/server/db/schema.ts.
// If the DB schema version changes, this must be updated to match.
export const SCHEMA_VERSION = 13;

/** Manifest schema version for forward compatibility. */
export const MANIFEST_VERSION = '1.0.0' as const;
