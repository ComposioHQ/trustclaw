import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { TicketCheck } from "lucide-react";
import { env } from "~/env";
import { auth } from "~/server/auth";
import { trpcServer, HydrateClient } from "~/clients/trpc/server";
import { CreateInviteForm } from "./_components/create-invite-form";
import { InviteList } from "./_components/invite-list";

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!env.ADMIN_USER_EMAIL || session?.user.email !== env.ADMIN_USER_EMAIL) {
    notFound();
  }

  void trpcServer.api.trustclaw.admin.listInviteCodes.prefetch({ limit: 50 });

  return (
    <HydrateClient>
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-2">
          <TicketCheck className="text-muted-foreground h-5 w-5" />
          <h1 className="text-xl font-semibold md:text-2xl">Invite Codes</h1>
        </div>

        <CreateInviteForm />
        <InviteList />
      </div>
    </HydrateClient>
  );
}
