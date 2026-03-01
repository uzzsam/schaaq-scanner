// =============================================================================
// Zod Validation Middleware for Express
// =============================================================================

import type { Request, Response, NextFunction } from 'express';
import type { ZodType, ZodError } from 'zod';

/**
 * Format Zod validation issues into user-friendly error details.
 * Never exposes raw Zod internals or stack traces to the client.
 */
function formatZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

/**
 * Express middleware that validates `req.body` against a Zod schema.
 *
 * On success: replaces `req.body` with the parsed (coerced/defaulted) output
 * and calls `next()`.
 *
 * On failure: responds 400 with `{ error, details }`.
 * Error details are sanitised — no raw Zod internals leak to the client.
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: formatZodErrors(result.error),
      });
      return;
    }

    // Replace body with parsed output (applies coercion, defaults, stripping)
    req.body = result.data;
    next();
  };
}

/**
 * Express middleware that validates `req.query` against a Zod schema.
 *
 * On success: stores the parsed output on `res.locals.query` and calls `next()`.
 * (Express `req.query` is a getter-only property and cannot be reassigned.)
 *
 * On failure: responds 400 with `{ error, details }`.
 */
export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: formatZodErrors(result.error),
      });
      return;
    }

    // Store parsed output on res.locals (req.query is read-only in Express 5)
    res.locals.query = result.data;
    next();
  };
}
