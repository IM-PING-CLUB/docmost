import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { LoginForm } from "./login-form.tsx";
import { InviteSignUpForm } from "./invite-sign-up-form.tsx";
import { ForgotPasswordForm } from "./forgot-password-form.tsx";
import { setupMantineTests } from "../utils/test-mantine.ts";

const { signIn, forgotPassword } = vi.hoisted(() => ({
  signIn: vi.fn(),
  forgotPassword: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}));
vi.mock("@/features/auth/hooks/use-auth", () => ({
  default: () => ({ signIn, forgotPassword, isLoading: false }),
}));
vi.mock("@/features/auth/hooks/use-redirect-if-authenticated.ts", () => ({
  useRedirectIfAuthenticated: vi.fn(),
}));
vi.mock("@/features/workspace/queries/workspace-query.ts", () => ({
  useWorkspacePublicDataQuery: () => ({
    data: {},
    isLoading: false,
    isError: false,
  }),
  useGetInvitationQuery: () => ({
    data: { id: "invite-1", email: "中文用户" },
    isError: false,
  }),
}));
vi.mock("@/ee/components/sso-login.tsx", () => ({ default: () => null }));
vi.mock("./auth-layout.tsx", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => children,
}));

function renderForm(component: React.ReactNode) {
  render(
    <MantineProvider>
      <MemoryRouter>{component}</MemoryRouter>
    </MantineProvider>,
  );
}

describe("账号认证表单", () => {
  beforeEach(() => {
    setupMantineTests();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it.each([" 中文ABC ", " A+tag@Example.COM ", "x"])(
    "登录允许并归一化 %s",
    async (identifier) => {
      renderForm(<LoginForm />);
      const input = screen.getByLabelText(
        "Username or email",
      ) as HTMLInputElement;
      expect(input.type).toBe("text");
      expect(input.autocomplete).toBe("username");
      fireEvent.change(input, { target: { value: identifier } });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "password" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      await waitFor(() =>
        expect(signIn).toHaveBeenCalledWith({
          email: identifier.trim().toLowerCase(),
          password: "password",
        }),
      );
    },
  );

  it.each(["", "   ", "bad name", "a".repeat(255), "bad\u0000name"])(
    "非法登录标识不请求：%s",
    async (identifier) => {
      renderForm(<LoginForm />);
      fireEvent.change(screen.getByLabelText("Username or email"), {
        target: { value: identifier },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "password" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(signIn).not.toHaveBeenCalled();
    },
  );

  it("邀请注册以禁用的文本框显示用户名", () => {
    renderForm(<InviteSignUpForm />);
    const input = screen.getByLabelText(
      "Username or email",
    ) as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.disabled).toBe(true);
    expect(input.value).toBe("中文用户");
  });

  it("找回密码仍只接受邮箱并明确说明限制", () => {
    renderForm(<ForgotPasswordForm />);
    expect((screen.getByLabelText("Email") as HTMLInputElement).type).toBe(
      "email",
    );
    expect(
      screen.getByText(
        "Password reset requires an email address. Accounts without an email cannot receive a reset link.",
      ),
    ).toBeTruthy();
  });
});
