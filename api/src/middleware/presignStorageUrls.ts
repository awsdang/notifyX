import type { Request, Response, NextFunction } from "express";
import { presignStorageUrlsInPayload } from "../services/storage";

export function presignStorageUrls(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    Promise.resolve(presignStorageUrlsInPayload(body))
      .then((transformed) => {
        if (!res.headersSent) {
          originalJson(transformed);
        }
      })
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[response-presign] Failed to presign storage URLs. Returning original payload. ${reason}`,
        );
        if (!res.headersSent) {
          originalJson(body);
        }
      });

    return res;
  }) as Response["json"];

  next();
}
