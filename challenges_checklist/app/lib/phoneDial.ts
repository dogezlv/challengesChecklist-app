export type PhoneVariant = "durr" | "pizza";

export type PhoneDialConfig = {
  variant: PhoneVariant;
  label: string;
  /** Dígitos a marcar (sin guiones) */
  number: string;
  displayNumber: string;
  conditionKey: "dial_durr_burger" | "dial_pizza_pit";
  bodyColor: string;
  bodyDark: string;
  handsetColor: string;
  handsetCap: string;
  dialPlate: string;
  dialRing: string;
  logoBg: string;
  logoText: string;
  logoSub?: string;
};

export const PHONE_CONFIGS: Record<PhoneVariant, PhoneDialConfig> = {
  durr: {
    variant: "durr",
    label: "Durr Burger",
    number: "5550152",
    displayNumber: "555-0152",
    conditionKey: "dial_durr_burger",
    bodyColor: "#ece8e0",
    bodyDark: "#c8c2b8",
    handsetColor: "#f4f0e8",
    handsetCap: "#c9a227",
    dialPlate: "#f2c818",
    dialRing: "#9a9a9a",
    logoBg: "#ffffff",
    logoText: "DURRR",
    logoSub: "BURGER",
  },
  pizza: {
    variant: "pizza",
    label: "Pizza Pit",
    number: "5550198",
    displayNumber: "555-0198",
    conditionKey: "dial_pizza_pit",
    bodyColor: "#e01818",
    bodyDark: "#9a0c0c",
    handsetColor: "#e82828",
    handsetCap: "#0066cc",
    dialPlate: "#0090e0",
    dialRing: "#b8b8b8",
    logoBg: "#ffffff",
    logoText: "PIZZA",
    logoSub: "PIT",
  },
};

/** Orden en disco: 1 arriba, sentido horario hasta 0 */
export const DIAL_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

export function digitAngle(digit: string): number {
  const i = DIAL_DIGITS.indexOf(digit as (typeof DIAL_DIGITS)[number]);
  return i < 0 ? 0 : -90 + i * 36;
}

/** Grados que gira el disco al marcar (como teléfono rotativo real) */
export function dialRotationForDigit(digit: string): number {
  const i = DIAL_DIGITS.indexOf(digit as (typeof DIAL_DIGITS)[number]);
  if (i < 0) return 0;
  return 250 - i * 24;
}

export function holePosition(
  digit: string,
  radius: number,
  cx: number,
  cy: number
): { x: number; y: number } {
  const rad = (digitAngle(digit) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

export function isPhoneVariant(v: string): v is PhoneVariant {
  return v === "durr" || v === "pizza";
}

export function phoneDialSecret(): string | undefined {
  return process.env.PHONE_DIAL_SECRET;
}

export function verifyPhoneSecret(token: string | null | undefined): boolean {
  const secret = phoneDialSecret();
  if (!secret || !token) return false;
  return token === secret;
}

/** Enlace secreto para compartir (sin botón en la checklist). */
export function phoneSecretUrl(
  variant: PhoneVariant,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
): string | null {
  const secret = phoneDialSecret();
  if (!secret) return null;
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/phone/${variant}?s=${encodeURIComponent(secret)}`;
}
