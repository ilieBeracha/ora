import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { cancelChatRun } from "@/lib/chat/runs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireCurrentUser();

  if (!user.companyId) {
    return NextResponse.json({ cancelled: false }, { status: 403 });
  }

  const { runId } = await context.params;
  const cancelled = cancelChatRun(runId, {
    companyId: user.companyId,
    userId: user.id,
  });

  return NextResponse.json({ cancelled });
}
