"use client";

import moment from "moment";
import { Ban, Copy, Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { trpc, type RouterOutputs } from "~/clients/trpc";
import { AlertDialog } from "~/components/core/confirm-dialog";
import {
  showErrorToast,
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

type InviteCode =
  RouterOutputs["trustclaw"]["admin"]["listInviteCodes"]["items"][number];

function formatDate(date: Date | null): string {
  if (!date) return "Never";
  return moment(date).format("MMM D, YYYY h:mm A");
}

function getStatusVariant(
  status: InviteCode["status"],
): ComponentProps<typeof Badge>["variant"] {
  if (status === "active") return "default";
  if (status === "used") return "secondary";
  return "outline";
}

export function InviteList() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } =
    trpc.trustclaw.admin.listInviteCodes.useQuery({ limit: 50 });

  const revokeInviteCode = trpc.trustclaw.admin.revokeInviteCode.useMutation({
    onSuccess: () => {
      showSuccessToast("Invite code revoked");
      void utils.trustclaw.admin.listInviteCodes.invalidate();
    },
    onError: trpcToastOnError,
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showSuccessToast("Invite code copied");
    } catch {
      showErrorToast("Failed to copy invite code");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Existing Invites</CardTitle>
        <CardDescription>
          Active codes can be used once during signup.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-destructive py-6 text-sm">{error.message}</div>
        ) : !data?.items.length ? (
          <div className="border-border rounded-lg border border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">
              No invite codes yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.items.map((inviteCode) => (
              <div
                key={inviteCode.id}
                className="border-border flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="bg-muted rounded px-2 py-1 text-sm font-medium break-all">
                      {inviteCode.code}
                    </code>
                    <Badge variant={getStatusVariant(inviteCode.status)}>
                      {inviteCode.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span>Created {formatDate(inviteCode.createdAt)}</span>
                    <span>Expires {formatDate(inviteCode.expiresAt)}</span>
                    {inviteCode.usedAt && (
                      <span>Used {formatDate(inviteCode.usedAt)}</span>
                    )}
                    {inviteCode.note && <span>Note: {inviteCode.note}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy invite code"
                    onClick={() => void copyCode(inviteCode.code)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <AlertDialog
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Revoke invite code"
                        disabled={
                          inviteCode.status !== "active" ||
                          revokeInviteCode.isPending
                        }
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    }
                    title="Revoke Invite Code"
                    description={`This will expire ${inviteCode.code} immediately.`}
                    confirmLabel="Revoke"
                    onConfirm={() => {
                      void revokeInviteCode.mutateAsync({ id: inviteCode.id });
                    }}
                    isPending={revokeInviteCode.isPending}
                    disabled={inviteCode.status !== "active"}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
