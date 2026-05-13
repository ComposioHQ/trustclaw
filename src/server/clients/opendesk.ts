import "server-only";
import { jsonSchema } from "ai";
import type { ToolSet } from "ai";
import { env } from "~/env";

export async function createOpendeskTools(): Promise<ToolSet> {
  if (!env.COMPUTER_USE_ENABLED) return {};

  const sdk = await import("@vitalops/opendesk-sdk").catch(() => null);
  if (!sdk) return {};

  const { createRegistry, allowAllContext } = sdk;
  const registry = createRegistry();
  const ctx = allowAllContext();
  const tools: ToolSet = {};

  for (const t of registry.all()) {
    const capturedTool = t;
    tools[`computer_${capturedTool.name}`] = {
      description: capturedTool.description,
      inputSchema: jsonSchema<Record<string, unknown>>(
        capturedTool.schema as Parameters<typeof jsonSchema>[0],
      ),
      execute: async (params) => {
        const result = await capturedTool.execute(ctx, params);

        if (result.error) return result.output;

        const images = result.attachments.filter((a) =>
          a.mediaType.startsWith("image/"),
        );

        if (images.length > 0) {
          return [
            { type: "text" as const, text: result.output },
            ...images.map((a) => ({
              type: "image" as const,
              data: a.content.toString("base64"),
              mimeType: a.mediaType,
            })),
          ];
        }

        return result.output;
      },
    };
  }

  return tools;
}
