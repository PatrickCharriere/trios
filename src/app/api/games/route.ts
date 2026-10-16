import { cleanName, cleanSeats } from "@/lib/online/protocol";
import { readBody, respond } from "@/lib/online/http";
import { OnlineError, createOnlineGame } from "@/lib/online/service";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const seats = cleanSeats(body.seats);
    if (!name) throw new OnlineError("badName", 400);
    if (!seats) throw new OnlineError("badRequest", 400);
    return createOnlineGame(name, seats);
  }, 201);
}
