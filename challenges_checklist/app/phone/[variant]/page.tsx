import { notFound } from "next/navigation";
import { isPhoneVariant, verifyPhoneSecret } from "@/app/lib/phoneDial";
import PhoneDialGame from "./PhoneDialGame";

export default async function PhonePage({
  params,
  searchParams,
}: {
  params: Promise<{ variant: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { variant } = await params;
  const sp = await searchParams;

  if (!isPhoneVariant(variant)) notFound();
  if (!verifyPhoneSecret(sp.s)) notFound();

  return <PhoneDialGame variant={variant} secret={sp.s!} />;
}
