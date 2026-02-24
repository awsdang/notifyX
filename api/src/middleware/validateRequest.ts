import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ZodError } from "zod";

export const validateRequest =
  (schema: ZodTypeAny) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Parse req.body directly — schemas define flat body fields.
      // Parsed result is written back so controllers get coerced/defaulted values.
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
        return;
      }

      next(error);
    }
  };
