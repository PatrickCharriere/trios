import { TOKEN_HEADER } from "./protocol";
import { OnlineError } from "./service";

const NO_STORE = { "cache-control": "no-store" };

/** Runs a route body and turns its result or OnlineError into JSON. */
export async function respond(body: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    return Response.json(await body(), { status, headers: NO_STORE });
  } catch (error) {
    if (error instanceof OnlineError) {
      return Response.json({ error: error.code }, { status: error.status, headers: NO_STORE });
    }
    console.error(error);
    return Response.json({ error: "server" }, { status: 500, headers: NO_STORE });
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const tokenOf = (request: Request) => request.headers.get(TOKEN_HEADER);
