"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { trpc } from "~/clients/trpc";
import { trpcToastOnError } from "~/components/core/toast-notifications";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { StepLayout, itemVariants } from "./step-layout";

const linkClassName = "text-primary underline underline-offset-4";

interface GlenStepProps {
  connected: boolean;
  onConnected: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function GlenStep({
  connected,
  onConnected,
  onNext,
  onBack,
}: GlenStepProps) {
  const [apiKey, setApiKey] = useState("");
  const [orgId, setOrgId] = useState("");

  const saveConnection = trpc.trustclaw.saveGlenConnection.useMutation({
    onSuccess: () => {
      onConnected();
      onNext();
    },
    onError: trpcToastOnError,
  });

  if (connected) {
    return (
      <StepLayout
        title="Connect glen team memory"
        onNext={onNext}
        onBack={onBack}
      >
        <motion.div
          variants={itemVariants}
          className="border-primary/20 bg-primary/5 rounded-lg border p-4 text-center"
        >
          <Check className="text-primary mx-auto mb-2 h-8 w-8" />
          <p className="text-primary font-medium">Glen connected</p>
        </motion.div>
      </StepLayout>
    );
  }

  return (
    <StepLayout
      title="Connect glen team memory"
      subtitle="I'll record our conversations to your team's glen memory and search what your team already worked out."
      onNext={() => saveConnection.mutate({ apiKey, orgId })}
      onBack={onBack}
      nextDisabled={!apiKey.trim() || !orgId.trim() || saveConnection.isPending}
      nextLabel={saveConnection.isPending ? "Checking..." : "Connect"}
    >
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="glen-api-key">Glen API key</Label>
          <Input
            id="glen-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="min-h-[44px]"
            autoFocus
          />
          <p className="text-muted-foreground text-xs">
            Create one on your{" "}
            <Link
              href="https://app.tryglen.com/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
            >
              glen API keys page
            </Link>
            .
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="glen-org-id">Glen organization ID</Label>
          <Input
            id="glen-org-id"
            autoComplete="off"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="min-h-[44px]"
          />
          <p className="text-muted-foreground text-xs">
            Open{" "}
            <Link
              href="https://app.tryglen.com"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
            >
              glen
            </Link>
            , click <strong>Connect an agent</strong> at the bottom of the
            sidebar and choose <strong>Claude Code Cloud</strong>. Copy the value
            after <code>GLEN_ORG_ID=</code>.
          </p>
        </div>

        <p className="text-muted-foreground text-xs">
          New to glen?{" "}
          <Link
            href="https://tryglen.com"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
          >
            Create an account
          </Link>{" "}
          first.
        </p>
      </motion.div>
    </StepLayout>
  );
}
