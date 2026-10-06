import { z } from "zod/v4";

export const ACCOUNT_IDENTIFIER_ERROR =
  "Enter a username or email (1–254 characters, without whitespace or control characters)";

export function normalizeAccountIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function accountIdentifierSchema(message = ACCOUNT_IDENTIFIER_ERROR) {
  return z
    .string()
    .transform(normalizeAccountIdentifier)
    .refine(
      (value) =>
        value.length >= 1 && value.length <= 254 && !/[\s\p{Cc}]/u.test(value),
      { message },
    );
}

export function isEmailIdentifier(value: string): boolean {
  return z.email().safeParse(value).success;
}
