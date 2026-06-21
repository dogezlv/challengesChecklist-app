import { createServiceClient } from "@/app/lib/supabase-service";
import { PHONE_CONFIGS, type PhoneVariant } from "@/app/lib/phoneDial";

export async function completePhoneDialChallenge(
  variant: PhoneVariant
): Promise<{ ok: boolean; already?: boolean; challengeId?: string; error?: string }> {
  const config = PHONE_CONFIGS[variant];
  const service = createServiceClient();

  const { data: conditions, error: condErr } = await service
    .from("rule_conditions")
    .select("challenge_rule_id")
    .eq("condition_key", config.conditionKey);

  if (condErr) return { ok: false, error: condErr.message };

  const ruleIds = (conditions ?? []).map((c) => c.challenge_rule_id);
  if (!ruleIds.length) return { ok: false, error: "Desafío no encontrado" };

  const { data: rules, error: ruleErr } = await service
    .from("challenge_rules")
    .select("challenge_id")
    .in("id", ruleIds);

  if (ruleErr) return { ok: false, error: ruleErr.message };

  const challengeIds = [
    ...new Set((rules ?? []).map((r) => r.challenge_id).filter(Boolean)),
  ];
  if (!challengeIds.length) return { ok: false, error: "Desafío no encontrado" };

  for (const id of challengeIds) {
    const { data: ch, error: chErr } = await service
      .from("challenges")
      .select("id, is_completed, target_value, kind")
      .eq("id", id)
      .maybeSingle();

    if (chErr || !ch) continue;
    if (ch.is_completed) return { ok: true, already: true, challengeId: ch.id };

    const target = ch.target_value ?? 1;
    const { error: upErr } = await service
      .from("challenges")
      .update({
        is_completed: true,
        current_value: ch.kind === "simple" ? target : target,
      })
      .eq("id", ch.id);

    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, challengeId: ch.id };
  }

  return { ok: false, error: "Desafío no encontrado" };
}
