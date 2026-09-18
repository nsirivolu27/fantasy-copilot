import { z } from "zod";
import type { JsonSchema } from "./registry";

/** Adapt the shared registry schema to the MCP handler's Standard Schema interface. */
export function mcpInputSchema(schema: JsonSchema) {
  const shape = Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => {
    let field: z.ZodTypeAny = property.type === "number" ? z.number().finite() : property.type === "boolean" ? z.boolean() : z.string();
    if (property.enum?.length) field = z.enum(property.enum as [string, ...string[]]);
    return [name, schema.required?.includes(name) ? field : field.optional()];
  }));
  const validator = z.object(shape);
  return { "~standard": {
    version: 1 as const,
    vendor: "fantasy-copilot",
    validate(value: unknown) {
      const result = validator.safeParse(value);
      return result.success ? { value: result.data } : { issues: result.error.issues.map(issue => ({ message: issue.message, path: issue.path })) };
    },
    jsonSchema: { input: () => schema, output: () => schema },
  } };
}
