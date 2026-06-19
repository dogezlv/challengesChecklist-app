import { NextResponse } from "next/server";
import { processPendingResolves } from "@/app/lib/twitch/resolve-pool";

function authorized(req: Request): boolean {
  const secret = process.env.BETTING_INTERNAL_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await processPendingResolves();
  return NextResponse.json({ processed: results.length, results });
}

export async function GET(req: Request) {
  return POST(req);
}
