import { describe, expect, it } from "vitest";
import {
  accountIdentifierSchema,
  isEmailIdentifier,
} from "./account-identifier.ts";

describe("账号标识", () => {
  it.each([
    "a",
    "中文用户名",
    "a.b+c@example.com",
    "a,b",
    "a!#$%^&*()",
    "a".repeat(254),
  ])("允许标识 %s", (identifier) => {
    expect(accountIdentifierSchema().safeParse(identifier).success).toBe(true);
  });

  it("去除首尾空白并转为小写", () => {
    expect(accountIdentifierSchema().parse("  用户ABC@Example.COM  ")).toBe(
      "用户abc@example.com",
    );
  });

  it.each([
    "",
    "   ",
    "a".repeat(255),
    "a b",
    "a\tb",
    "a\nb",
    "a\u0000b",
    "a\u007fb",
    "a\u0085b",
    "a\u3000b",
  ])("拒绝非法标识 %s", (identifier) => {
    expect(accountIdentifierSchema().safeParse(identifier).success).toBe(false);
  });

  it("按转小写后的长度校验", () => {
    expect(accountIdentifierSchema().safeParse("İ".repeat(128)).success).toBe(
      false,
    );
  });

  it.each([
    "用户名",
    "abc",
    "user@local",
    "user@@example.com",
    "用户@example.com",
  ])("邀请允许 %s，但不视为可重发邮件的邮箱", (identifier) => {
    expect(accountIdentifierSchema().safeParse(identifier).success).toBe(true);
    expect(isEmailIdentifier(identifier)).toBe(false);
  });

  it("识别标准邮箱用于邮件重发", () => {
    expect(isEmailIdentifier("user+tag@example.com")).toBe(true);
  });
});
