"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { allowedAnthropicModelSchema } from "~/server/api/routers/trustclaw/createInstance.schema";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import type { RouterOutputs } from "~/clients/trpc";

type AvailableModel = RouterOutputs["trustclaw"]["getAvailableModels"]["models"][number];

interface ModelSettingsProps {
  currentModel: string;
}

export function ModelSettings({ currentModel }: ModelSettingsProps) {
  const { data, isLoading } = trpc.trustclaw.getAvailableModels.useQuery();
  const [selectedModel, setSelectedModel] = useState<string>(currentModel);
  const utils = trpc.useUtils();

  const updateSettings = trpc.trustclaw.updateSettings.useMutation({
    onSuccess: () => {
      showSuccessToast("Model updated");
      void utils.trustclaw.getInstance.invalidate();
    },
    onError: trpcToastOnError,
  });

  const models = data?.models ?? [];
  const anthropicModels = models.filter((m) => m.provider === "anthropic");
  const nebiusModels = models.filter((m) => m.provider === "nebius");

  const hasChanges = selectedModel !== currentModel;
  const modelIds = new Set(models.map((m) => m.id));
  // If the persisted model is no longer in the available set (e.g. a Nebius id
  // saved when the key was set, then NEBIUS_API_KEY was removed), keep showing
  // the persisted value so the user can change away from it.
  const placeholderForUnknown = !modelIds.has(selectedModel)
    ? selectedModel
    : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model</CardTitle>
        <CardDescription>
          Choose which model powers your assistant
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Model</Label>
          <Select
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder={placeholderForUnknown} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Anthropic</SelectLabel>
                {anthropicModels.map((m: AvailableModel) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span>{m.label}</span>
                    <span className="ml-2 text-muted-foreground">
                      - {m.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
              {nebiusModels.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>Nebius Token Factory</SelectLabel>
                  {nebiusModels.map((m: AvailableModel) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span>{m.label}</span>
                      <span className="ml-2 text-muted-foreground">
                        - {m.description}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
          {data && !data.nebiusEnabled ? (
            <p className="text-xs text-muted-foreground">
              To enable Nebius Token Factory models (DeepSeek, Qwen, Llama,
              ...), set <code>NEBIUS_ROUTING=direct</code> with a{" "}
              <code>NEBIUS_API_KEY</code> for direct access, or{" "}
              <code>NEBIUS_ROUTING=gateway</code> after registering Nebius in
              your Vercel AI Gateway settings.
            </p>
          ) : null}
          {data?.nebiusEnabled && data.nebiusRouting ? (
            <p className="text-xs text-muted-foreground">
              Nebius models route{" "}
              {data.nebiusRouting === "direct"
                ? "directly to Token Factory"
                : "through Vercel AI Gateway"}
              .
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          disabled={!hasChanges || updateSettings.isPending || isLoading}
          onClick={() => {
            const parsed = allowedAnthropicModelSchema.safeParse(selectedModel);
            if (!parsed.success) return;
            void updateSettings.mutateAsync({ anthropicModel: parsed.data });
          }}
        >
          {updateSettings.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
