import {
  clearVerificationInfo,
  getEmailByVerificationCode,
  getVerificationGeneratedAt,
} from "./verification-database.js";

const VERIFICATION_CODE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

export type VerificationCodeResult =
  | { status: "valid"; email: string }
  | { status: "invalid" }
  | { status: "expired"; email: string };

export function validateVerificationCode(
  code: string
): VerificationCodeResult {
  const email = getEmailByVerificationCode(code);

  if (!email) {
    return { status: "invalid" };
  }

  const generatedAt = getVerificationGeneratedAt(email);

  if (
    generatedAt === undefined ||
    Date.now() - generatedAt > VERIFICATION_CODE_EXPIRY_MS
  ) {
    clearVerificationInfo(email);
    return { status: "expired", email };
  }

  return { status: "valid", email };
}