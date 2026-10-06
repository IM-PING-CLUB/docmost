import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { WorkspaceInviteForm } from "./workspace-invite-form.tsx";
import { setupMantineTests } from "@/features/auth/utils/test-mantine.ts";

const { mutateAsync, navigate } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/features/workspace/queries/workspace-query.ts", () => ({
  useCreateInvitationMutation: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/features/group/components/multi-group-select.tsx", () => ({
  MultiGroupSelect: ({ onChange }: { onChange: (value: string[]) => void }) => (
    <button onClick={() => onChange(["group-1"])}>选择群组</button>
  ),
}));

function renderForm() {
  const onClose = vi.fn();
  render(
    <MantineProvider>
      <WorkspaceInviteForm onClose={onClose} />
    </MantineProvider>,
  );
  return {
    onClose,
    input: screen.getByRole("combobox", { name: "Username or email" }),
    submit: screen.getByRole("button", { name: "Send invitation" }),
  };
}

describe("邀请表单", () => {
  beforeEach(() => {
    setupMantineTests();
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("提交未按回车确认的当前输入，保留角色与群组", async () => {
    const { input, submit, onClose } = renderForm();
    fireEvent.change(input, { target: { value: " 用户ABC@Example.COM " } });
    fireEvent.click(screen.getByRole("button", { name: "选择群组" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Select role" }));
    fireEvent.click(await screen.findByRole("option", { name: /Admin/ }));
    fireEvent.blur(input);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        emails: ["用户abc@example.com"],
        role: "admin",
        groupIds: ["group-1"],
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("?tab=invites");
  });

  it("归一化已确认标签与当前输入并去重", async () => {
    const { input, submit } = renderForm();
    fireEvent.change(input, { target: { value: "ABC" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: " abc " } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        emails: ["abc"],
        role: "member",
        groupIds: [],
      }),
    );
  });

  it.each(["", "   ", "a".repeat(255), "bad name", "bad\u0000name"])(
    "非法当前输入阻止整批请求：%s",
    async (identifier) => {
      const { input, submit, onClose } = renderForm();
      if (identifier !== "") {
        fireEvent.change(input, { target: { value: "valid" } });
        fireEvent.keyDown(input, { key: "Enter" });
      }
      fireEvent.change(input, { target: { value: identifier } });
      fireEvent.click(submit);
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("非法已确认标签不静默过滤有效子集", async () => {
    const { input, submit } = renderForm();
    for (const identifier of ["bad name", "valid"]) {
      fireEvent.change(input, { target: { value: identifier } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("超过 50 个账号阻止整批请求而非截断", async () => {
    const { input, submit } = renderForm();
    for (let index = 0; index < 51; index += 1) {
      fireEvent.change(input, { target: { value: `user-${index}` } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    fireEvent.click(submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Invite up to 50 usernames or emails at a time",
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("50 个账号连同未确认输入均完整提交", async () => {
    const { input, submit } = renderForm();
    const identifiers = Array.from(
      { length: 50 },
      (_, index) => `user-${index}`,
    );
    for (const identifier of identifiers.slice(0, -1)) {
      fireEvent.change(input, { target: { value: identifier } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    fireEvent.change(input, { target: { value: identifiers[49] } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        emails: identifiers,
        role: "member",
        groupIds: [],
      }),
    );
  });

  it.each(["a".repeat(254), "用户,ABC"])(
    "允许边界与含逗号的标识 %s",
    async (identifier) => {
      const { input, submit } = renderForm();
      fireEvent.change(input, { target: { value: identifier } });
      fireEvent.keyDown(input, { key: "," });
      fireEvent.click(submit);
      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          emails: [identifier.toLowerCase()],
          role: "member",
          groupIds: [],
        }),
      );
    },
  );

  it("粘贴包含空白的输入不会拆成有效子集", async () => {
    const { input, submit } = renderForm();
    fireEvent.paste(input, {
      clipboardData: { getData: () => "valid invalid" },
    });
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("请求失败保持弹窗和输入，可再次提交", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("失败"));
    const { input, submit, onClose } = renderForm();
    fireEvent.change(input, { target: { value: "中文用户" } });
    fireEvent.click(submit);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Failed to send invitations. Please try again.",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("中文用户");
    fireEvent.click(submit);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
