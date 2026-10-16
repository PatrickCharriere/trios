import type { NextRequest } from "next/server";
import { respond, tokenOf } from "@/lib/online/http";
import { pollOnlineGame } from "@/lib/online/service";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/games/[id]">) {
  const { id } = await ctx.params;
  const since = Number(request.nextUrl.searchParams.get("since"));
  return respond(() => pollOnlineGame(id, tokenOf(request), Number.isInteger(since) && since > 0 ? since : null));
}
