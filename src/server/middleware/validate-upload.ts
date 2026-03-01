// =============================================================================
// File Upload Validation Middleware — M-3
//
// Runs AFTER multer (files already in memory) and BEFORE route handlers.
// Validates each uploaded file by:
//   1. Size — rejects files exceeding the configured limit
//   2. Extension — defense-in-depth re-check (multer already filters)
//   3. Content — magic-byte verification for binary formats (xlsx, xls,
//      pbit, twbx) via file-type; null-byte heuristic for text formats
//      (csv, tsv, json, twb) where magic bytes don't exist
//
// This prevents basic attacks like disguised executables renamed to .csv.
// =============================================================================

import { fileTypeFromBuffer } from 'file-type';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface UploadValidationConfig {
  /** Maximum file size in bytes.  Files exceeding this are rejected. */
  maxFileSize: number;

  /**
   * Allowed extensions mapped to their expected MIME type(s).
   *
   * - Binary formats → array of acceptable MIME strings that file-type may
   *   return (e.g. xlsx may be detected as the full OOXML MIME *or* as
   *   generic 'application/zip' depending on the file-type version).
   *
   * - Text formats → `null` — magic-byte detection is impossible; the
   *   middleware falls back to a null-byte heuristic instead.
   */
  allowedTypes: Record<string, string[] | null>;
}

// ---------------------------------------------------------------------------
// Predefined configs for the two multer instances in scans.ts
// ---------------------------------------------------------------------------

/** Config for POST /upload and POST /:id/transform-upload */
export const SCHEMA_UPLOAD_CONFIG: UploadValidationConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  allowedTypes: {
    '.csv':  null,                                  // text — no magic bytes
    '.tsv':  null,                                  // text — no magic bytes
    '.xlsx': [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',                            // some file-type versions
    ],
    '.xls':  [
      'application/vnd.ms-excel',
      'application/x-cfb',                          // OLE2 compound doc
    ],
    '.pbit': ['application/zip'],                   // Power BI template = ZIP
    '.twb':  null,                                  // Tableau workbook = XML text
    '.twbx': ['application/zip'],                   // Tableau packaged = ZIP
  },
};

/** Config for POST /:id/pipeline-upload */
export const PIPELINE_UPLOAD_CONFIG: UploadValidationConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  allowedTypes: {
    '.csv':  null,                                  // text — no magic bytes
    '.tsv':  null,                                  // text — no magic bytes
    '.json': null,                                  // text — no magic bytes
  },
};

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Express middleware that validates uploaded files after multer has parsed
 * them into memory buffers.
 *
 * On failure: responds 400 with `{ error }` and short-circuits the chain.
 */
export function validateUploadedFiles(config: UploadValidationConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;

    // No files is fine — let the route handler decide whether that's an error.
    if (!files || files.length === 0) {
      next();
      return;
    }

    for (const file of files) {
      // ----- 1. Size check -----
      if (file.size > config.maxFileSize) {
        const maxMB = Math.round(config.maxFileSize / (1024 * 1024));
        res.status(400).json({
          error: `File too large: ${file.originalname} `
            + `(${formatSize(file.size)}). Maximum allowed: ${maxMB} MB.`,
        });
        return;
      }

      // ----- 2. Extension check (defense-in-depth) -----
      const ext = extractExtension(file.originalname);
      if (!ext || !(ext in config.allowedTypes)) {
        res.status(400).json({ error: 'Unsupported file type' });
        return;
      }

      // ----- 3. Content verification -----
      const expectedMimes = config.allowedTypes[ext];

      if (expectedMimes !== null) {
        // Binary format — verify magic bytes match one of the expected MIMEs
        const detected = await fileTypeFromBuffer(file.buffer);
        if (!detected || !expectedMimes.includes(detected.mime)) {
          res.status(400).json({
            error: `File content does not match its extension: ${file.originalname}. `
              + `Expected ${expectedMimes.join(' or ')}, `
              + `detected ${detected?.mime ?? 'unknown'}.`,
          });
          return;
        }
      } else {
        // Text format — ensure the buffer looks like text, not binary
        if (!looksLikeText(file.buffer)) {
          res.status(400).json({ error: 'Unsupported file type' });
          return;
        }
      }
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the lowercase extension including the dot (e.g. '.csv'). */
function extractExtension(filename: string): string | undefined {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return undefined;
  return filename.slice(dot).toLowerCase();
}

/** Human-readable file size. */
function formatSize(bytes: number): string {
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Heuristic: sample up to the first 8 KB of the buffer.  If any null byte
 * (0x00) is found the content is almost certainly binary, not text.
 *
 * This catches the most common attack vector — renaming an .exe / .dll /
 * .zip to .csv — without needing a full charset detector.
 */
function looksLikeText(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0x00) return false;
  }
  return true;
}
