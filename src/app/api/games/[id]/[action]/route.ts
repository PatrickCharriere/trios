import { cleanName, parseMove } from "@/lib/online/protocol";
import { readBody, respond, tokenOf } from "@/lib/online/http";
import {
  OnlineError,
  joinOnlineGame,
  playOnlineMove,
  rematchOnlineGame,
  startOnlineGame,
} from "@/lib/online/service";

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/[action]">) {
  const { id, action } = await ctx.params;
  const token = tokenOf(request);
  return respond(async () => {
    const body = await readBody(request);
    switch (action) {
      case "join": {
        const name = cleanName(body.name);
        if (!name) throw new OnlineError("badName", 400);
        return joinOnlineGame(id, name);
      }
      case "start":
        return startOnlineGame(id, token);
      case "move": {
        const move = parseMove(body.move);
        if (!move) throw new OnlineError("badRequest", 400);
        return playOnlineMove(id, token, move);
      }
      case "rematch":
        return rematchOnlineGame(id, token);
      default:
        throw new OnlineError("notFound", 404);
    }
  });
}
