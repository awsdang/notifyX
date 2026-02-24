import { z } from "zod";

// Standard success response envelope
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    error: z
      .literal(false)
      .describe("False for successful responses")
      .meta({ example: false }),
    message: z
      .string()
      .describe("Human-readable response message")
      .meta({ example: "Success" }),
    data: dataSchema.describe("The response data"),
    totalCount: z
      .number()
      .optional()
      .describe("Optional total count for list responses")
      .meta({ example: 100 }),
  });

// Standard error response envelope
export const errorResponseSchema = z.object({
  error: z
    .literal(true)
    .describe("True for failed responses")
    .meta({ example: true }),
  message: z
    .string()
    .describe("Error message")
    .meta({ example: "Validation Error" }),
  data: z
    .any()
    .nullable()
    .optional()
    .describe("Error details payload")
    .meta({ example: null }),
});

// Union envelope used for docs and shared endpoint responses
export const responseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([successResponseSchema(dataSchema), errorResponseSchema]);

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
) =>
  z.object({
    error: z
      .literal(false)
      .describe("False for successful responses")
      .meta({ example: false }),
    message: z
      .string()
      .describe("Human-readable response message")
      .meta({ example: "Success" }),
    data: z.array(dataSchema).describe("The paginated data"),
    totalCount: z
      .number()
      .describe("Total number of items")
      .meta({ example: 100 }),
  });
