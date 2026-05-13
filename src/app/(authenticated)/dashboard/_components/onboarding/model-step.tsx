"use client";

import { motion } from "framer-motion";
import { cn } from "~/lib/utils";
import type { z } from "zod";
import { trpc } from "~/clients/trpc";
import { allowedAnthropicModelSchema } from "~/server/api/routers/trustclaw/createInstance.schema";
import type { RouterOutputs } from "~/clients/trpc";
import { MODELS } from "./onboarding.consts";
import { StepLayout, itemVariants } from "./step-layout";

type AvailableModel =
  RouterOutputs["trustclaw"]["getAvailableModels"]["models"][number];

interface ModelStepProps {
  value: z.infer<typeof allowedAnthropicModelSchema>;
  onChange: (model: z.infer<typeof allowedAnthropicModelSchema>) => void;
  onNext: () => void;
  onBack: () => void;
}

const PROVIDER_LABEL: Record<AvailableModel["provider"], string> = {
  anthropic: "Anthropic",
  nebius: "Nebius Token Factory",
};

export function ModelStep({
  value,
  onChange,
  onNext,
  onBack,
}: ModelStepProps) {
  const { data } = trpc.trustclaw.getAvailableModels.useQuery();

  // Fall back to the bundled MODELS list during the initial server render and
  // while the query is in flight so the step never renders empty.
  const models: AvailableModel[] =
    data?.models ??
    MODELS.map((m) => ({
      id: m.value,
      label: m.label,
      description: m.description,
      cost: m.cost,
      provider: "anthropic" as const,
    }));

  const grouped = models.reduce<Record<string, AvailableModel[]>>(
    (acc, m) => {
      (acc[m.provider] ??= []).push(m);
      return acc;
    },
    {},
  );

  const handleModelChange = (val: string) => {
    const model = allowedAnthropicModelSchema.safeParse(val);
    if (!model.success) return;
    onChange(model.data);
  };

  return (
    <StepLayout
      title="Choose my brain!"
      subtitle="Which model should power me?"
      onNext={onNext}
      onBack={onBack}
    >
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-1 gap-4">
          {(Object.keys(grouped) as AvailableModel["provider"][]).map(
            (provider) => (
              <div key={provider} className="space-y-2">
                {Object.keys(grouped).length > 1 ? (
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    {PROVIDER_LABEL[provider]}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3">
                  {grouped[provider]!.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      className={cn(
                        "flex min-h-[44px] items-center justify-between rounded-lg border p-4 text-left transition-all",
                        value === model.id
                          ? "border-primary ring-primary ring-2"
                          : "border-border hover:border-primary/50",
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">{model.label}</p>
                        <p className="text-muted-foreground text-xs">
                          {model.description}
                        </p>
                      </div>
                      <span className="text-muted-foreground text-sm font-medium">
                        {model.cost}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-center text-xs">
          You can change this later in settings.
        </p>
      </motion.div>
    </StepLayout>
  );
}
