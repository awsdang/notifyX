import { z } from "zod";
import { registry } from "./registry";
import { pathRegistry, type OpenApiPathDefinition } from "./path-registry";
import { mountedRouteSurface } from "./route-surface";
import "./paths"; // Import paths to ensure they are registered

const OPENAPI_JSON_SCHEMA_OPTIONS = {
  target: "openapi-3.0" as const,
  unrepresentable: "any" as const,
};

// Standard Error Schema
const errorSchema = z.object({
  error: z.literal(true),
  message: z.string(),
  data: z.any().nullable().optional(),
});

const successSchema = z.object({
  error: z.literal(false),
  message: z.string(),
  data: z.any(),
  totalCount: z.number().optional(),
});

const errorResponseRef = {
  content: {
    "application/json": {
      schema: z.toJSONSchema(errorSchema, OPENAPI_JSON_SCHEMA_OPTIONS),
    },
  },
};

const successResponseRef = {
  content: {
    "application/json": {
      schema: z.toJSONSchema(successSchema, OPENAPI_JSON_SCHEMA_OPTIONS),
    },
  },
};

export function getOpenApiSpec() {
  // 1. Generate JSON Schemas for all registered components
  const jsonSchemaOutput = z.toJSONSchema(registry, OPENAPI_JSON_SCHEMA_OPTIONS) as any;

  const components: any = {
    schemas: jsonSchemaOutput.$defs || {}, // Extract registered schemas
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
      },
    },
  };

  // 2. Prepare Paths
  const paths: any = {};
  const registeredPaths = pathRegistry.getPaths();

  for (const pathDef of registeredPaths) {
    if (!paths[pathDef.path]) {
      paths[pathDef.path] = {};
    }

    const operationObject: any = {
      summary: pathDef.summary,
      description: pathDef.description,
      tags: pathDef.tags,
      operationId: pathDef.operationId,
      parameters: [],
      responses: {},
      deprecated: pathDef.deprecated,
    };

    // Handle Security
    if (pathDef.security) {
      operationObject.security = pathDef.security;
    }

    // Handle Request Body
    if (pathDef.request && pathDef.request.body) {
      const content: any = {};
      for (const [mediaType, mediaTypeObj] of Object.entries(
        pathDef.request.body.content,
      )) {
        content[mediaType] = {
          schema: z.toJSONSchema(mediaTypeObj.schema, {
            ...OPENAPI_JSON_SCHEMA_OPTIONS,
            metadata: registry, // Use registry to resolve refs
          }),
        };
      }
      operationObject.requestBody = {
        description: pathDef.request.body.description,
        required: pathDef.request.body.required,
        content: content,
      };
    }

    // Handle Parameters (Path, Query, Headers)
    // Helper to convert Zod object to OAS parameters
    const addParams = (
      schema: z.ZodType<any> | undefined,
      type: "path" | "query" | "header",
    ) => {
      if (!schema) return;
      const paramJson = z.toJSONSchema(schema, {
        ...OPENAPI_JSON_SCHEMA_OPTIONS,
        metadata: registry,
      }) as any;

      if (paramJson.type === "object" && paramJson.properties) {
        for (const [name, propSchema] of Object.entries(paramJson.properties)) {
          const required =
            paramJson.required?.includes(name) || type === "path";
          operationObject.parameters.push({
            name,
            in: type,
            required,
            schema: propSchema,
          });
        }
      }
    };

    if (pathDef.request) {
      addParams(pathDef.request.params, "path");
      addParams(pathDef.request.query, "query");
      addParams(pathDef.request.headers, "header");
    }

    // Handle Responses
    for (const [code, response] of Object.entries(pathDef.responses)) {
      const responseObj: any = {
        description: response.description,
      };

      if (response.content) {
        responseObj.content = {};
        for (const [mediaType, mediaTypeObj] of Object.entries(
          response.content,
        )) {
          responseObj.content[mediaType] = {
            schema: z.toJSONSchema(mediaTypeObj.schema, {
              ...OPENAPI_JSON_SCHEMA_OPTIONS,
              metadata: registry,
            }),
          };
        }
      }

      if (response.headers) {
        responseObj.headers = {};
        for (const [headerName, headerDef] of Object.entries(
          response.headers,
        )) {
          responseObj.headers[headerName] = {
            description: headerDef.description,
            schema: headerDef.schema
              ? z.toJSONSchema(headerDef.schema, OPENAPI_JSON_SCHEMA_OPTIONS)
              : undefined,
          };
        }
      }

      operationObject.responses[code] = responseObj;
    }

    // Inject Default Error Responses
    const defaultErrors: Record<string, string> = {
      "400": "Bad Request",
      "401": "Unauthorized",
      "403": "Forbidden",
      "404": "Not Found",
      "500": "Internal Server Error",
    };

    for (const [code, description] of Object.entries(defaultErrors)) {
      if (!operationObject.responses[code]) {
        operationObject.responses[code] = {
          description: description,
          ...errorResponseRef,
        };
      }
    }

    paths[pathDef.path][pathDef.method] = operationObject;
  }

  // 3. Add placeholders for mounted routes not yet explicitly registered.
  // This keeps OpenAPI route coverage aligned with actual surface while
  // richer endpoint docs are added incrementally.
  for (const route of mountedRouteSurface) {
    if (!paths[route.path]) {
      paths[route.path] = {};
    }
    if (paths[route.path][route.method]) {
      continue;
    }

    paths[route.path][route.method] = {
      summary: route.summary,
      tags: route.tags,
      description:
        "Auto-generated route coverage placeholder. Add explicit request/response schema in docs/paths.ts.",
      operationId: `${route.method}_${route.path.replace(/[^a-zA-Z0-9]/g, "_")}`,
      ...(route.security ? { security: route.security } : {}),
      responses: {
        200: {
          description: "Success",
          ...successResponseRef,
        },
      },
      "x-notifyx-doc-status": "placeholder",
    };
  }

  return {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "NotifyX API",
      description: "API for NotifyX service",
    },
    servers: [{ url: "/api/v1" }],
    paths,
    components,
  };
}
