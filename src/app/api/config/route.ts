import { connection } from "next/server";
import { getStore } from "@/lib/online/store";

export async function GET() {
  // Read the environment per request, not once at build time.
  await connection();
  return Response.json({ online: getStore() !== null }, { headers: { "cache-control": "no-store" } });
}
