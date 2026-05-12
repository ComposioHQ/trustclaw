const CERONE_VALIDATE_URL = "https://api.homersemantics.com/v1/validate";
const CERONE_TIMEOUT_MS = 1000;

let hasWarnedMissingConfig = false;

export interface GovernanceResult {
  approved: boolean;
  result: "approved" | "flagged" | "rejected";
  trust_score: number;
  reason?: string;
}

export class GovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernanceError";
  }
}

function allow(reason?: string): GovernanceResult {
  return {
    approved: true,
    result: "approved",
    trust_score: 0,
    ...(reason ? { reason } : {}),
  };
}

export async function validateAction(
  agentId: string,
  toolName: string,
  context: Record<string, unknown>,
): Promise<GovernanceResult> {
  const apiKey = process.env.CERONE_API_KEY;
  if (!apiKey) {
    if (!hasWarnedMissingConfig) {
      hasWarnedMissingConfig = true;
      console.warn("Cerone governance not configured");
    }
    return allow("Cerone governance not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CERONE_TIMEOUT_MS);

  try {
    const response = await fetch(CERONE_VALIDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        agent_id: agentId,
        action: toolName,
        context,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(
        `[cerone] validation failed for ${toolName}: ${response.status}`,
      );
      return allow("Cerone validation unavailable");
    }

    const payload = (await response.json()) as {
      result?: "approved" | "flagged" | "rejected";
      trust_score?: number;
      reason?: string | null;
    };
    const reason = payload.reason ?? undefined;
    const trustScore =
      typeof payload.trust_score === "number" ? payload.trust_score : 0;

    if (payload.result === "rejected") {
      throw new GovernanceError(reason ?? "Action rejected by Cerone");
    }

    if (payload.result === "flagged") {
      console.warn(
        `[cerone] flagged ${toolName}: ${reason ?? "No reason provided"}`,
      );
      return {
        approved: true,
        result: "flagged",
        trust_score: trustScore,
        ...(reason ? { reason } : {}),
      };
    }

    return {
      approved: true,
      result: "approved",
      trust_score: trustScore,
      ...(reason ? { reason } : {}),
    };
  } catch (error) {
    if (error instanceof GovernanceError) {
      throw error;
    }
    console.warn(
      `[cerone] validation failed for ${toolName}; allowing execution`,
      error,
    );
    return allow("Cerone validation unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}
