import { NextResponse } from "next/server";
import { completePhoneDialChallenge } from "@/app/lib/complete-phone-dial";
import { isPhoneVariant, verifyPhoneSecret } from "@/app/lib/phoneDial";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const variant = typeof body.variant === "string" ? body.variant : "";
  const secret = typeof body.secret === "string" ? body.secret : "";

  if (!isPhoneVariant(variant)) {
    return NextResponse.json({ error: "variant inválido" }, { status: 400 });
  }
  if (!verifyPhoneSecret(secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const result = await completePhoneDialChallenge(variant);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Error" }, { status: 502 });
  }

  return NextResponse.json(result);
}
