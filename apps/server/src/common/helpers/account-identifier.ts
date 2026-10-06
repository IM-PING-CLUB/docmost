import { isEmail } from 'class-validator';

export function normalizeAccountIdentifier(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export function isAccountIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 254 &&
    !/[\s\p{Cc}]/u.test(value)
  );
}

export function isEmailAccountIdentifier(value: unknown): value is string {
  return isAccountIdentifier(value) && isEmail(value);
}
