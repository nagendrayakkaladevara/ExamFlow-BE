import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

type ValidationSchemas = Partial<Record<RequestPart, ZodTypeAny>>;

function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    typeof value === 'object' &&
    value !== null &&
    'parse' in value &&
    typeof (value as ZodTypeAny).parse === 'function'
  );
}

function runValidation(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Validate request body, query, and/or params with Zod schemas. */
export function validate(schemas: ValidationSchemas): ReturnType<typeof runValidation>;
export function validate(schema: ZodTypeAny, part?: RequestPart): ReturnType<typeof runValidation>;
export function validate(
  schemaOrSchemas: ZodTypeAny | ValidationSchemas,
  part?: RequestPart,
) {
  if (isZodSchema(schemaOrSchemas)) {
    const schemas: ValidationSchemas = part
      ? { [part]: schemaOrSchemas }
      : { body: schemaOrSchemas };
    return runValidation(schemas);
  }

  return runValidation(schemaOrSchemas);
}
