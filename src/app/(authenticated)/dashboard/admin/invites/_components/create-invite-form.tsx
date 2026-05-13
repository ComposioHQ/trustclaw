"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { trpc } from "~/clients/trpc";
import {
  showSuccessToast,
  trpcToastOnError,
} from "~/components/core/toast-notifications";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import {
  createInviteCodeInput,
  type CreateInviteCodeInput,
} from "~/server/api/routers/trustclaw/admin/createInviteCode.schema";

export function CreateInviteForm() {
  const utils = trpc.useUtils();
  const form = useForm<CreateInviteCodeInput>({
    resolver: zodResolver(createInviteCodeInput),
    defaultValues: {
      expiresAt: "",
      note: "",
    },
  });

  const createInviteCode = trpc.trustclaw.admin.createInviteCode.useMutation({
    onSuccess: () => {
      showSuccessToast("Invite code created");
      form.reset({ expiresAt: "", note: "" });
      void utils.trustclaw.admin.listInviteCodes.invalidate();
    },
    onError: trpcToastOnError,
  });

  const handleSubmit = async (input: CreateInviteCodeInput) => {
    await createInviteCode.mutateAsync(input);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Invite</CardTitle>
        <CardDescription>
          Mint a single-use code for a trusted user.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={createInviteCode.isPending}
            >
              {createInviteCode.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
