import { cleanName, parseMove } from "@/lib/online/protocol";
import { readBody, respond, tokenOf } from "@/lib/online/http";
import {
  OnlineError,
  joinOnlineGame,
  leaveOnlineGame,
  playOnlineMove,
  rematchOnlineGame,
  setOnlinePush,
  startOnlineGame,
} from "@/lib/online/service";
import { notifyAfterResponse as notify } from "@/lib/push/deliver";
import { parseSubscription } from "@/lib/push/protocol";

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/[action]">) {
  const { id, action } = await ctx.params;
  const token = tokenOf(request);
  return respond(async () => {
    const body = await readBody(request);
    switch (action) {
      case "join": {
        const name = cleanName(body.name);
        if (!name) throw new OnlineError("badName", 400);
        return joinOnlineGame(id, name, undefined, notify);
      }
      case "start":
        return startOnlineGame(id, token, undefined, notify);
      case "move": {
        const move = parseMove(body.move);
        if (!move) throw new OnlineError("badRequest", 400);
        return playOnlineMove(id, token, move, undefined, notify);
      }
      case "rematch":
        return rematchOnlineGame(id, token, undefined, notify);
      case "push": {
        // A subscription turns this player's notifications on; null turns them off.
        const target = body.subscription === null ? null : parseSubscription(body.subscription, body.lang);
        if (body.subscription !== null && !target) throw new OnlineError("badRequest", 400);
        return setOnlinePush(id, token, target);
      }
      case "leave":
        return leaveOnlineGame(id, token);
      default:
        throw new OnlineError("notFound", 404);
    }
  });
}
