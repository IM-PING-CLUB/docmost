import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import InviteActionMenu from "./invite-action-menu.tsx";
import { setupMantineTests } from "@/features/auth/utils/test-mantine.ts";

const { resend, copy, getInviteLink, cloud } = vi.hoisted(() => ({
  resend: vi.fn(),
  copy: vi.fn(),
  getInviteLink: vi.fn(),
  cloud: { value: false },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}));
vi.mock("@/features/workspace/queries/workspace-query.ts", () => ({
  useResendInvitationMutation: () => ({ mutateAsync: resend }),
  useRevokeInvitationMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-user-role.tsx", () => ({
  default: () => ({ isAdmin: true }),
}));
vi.mock("@/hooks/use-clipboard", () => ({ useClipboard: () => ({ copy }) }));
vi.mock("@/features/workspace/services/workspace-service.ts", () => ({
  getInviteLink,
}));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("@/lib/config.ts", () => ({ isCloud: () => cloud.value }));

describe("邀请操作菜单", () => {
  beforeEach(() => {
    setupMantineTests();
    vi.clearAllMocks();
    cloud.value = false;
    getInviteLink.mockResolvedValue({
      inviteLink: "https://example.com/invite/1?token=test",
    });
  });
  afterEach(cleanup);

  it.each([false, true])(
    "非邮箱隐藏重发但可复制链接，云端=%s",
    async (isCloud) => {
      cloud.value = isCloud;
      render(
        <MantineProvider>
          <InviteActionMenu invitationId="invite-1" email="中文用户" />
        </MantineProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Invite actions" }));
      fireEvent.click(
        await screen.findByRole("menuitem", { name: "Copy link" }),
      );
      expect(
        screen.queryByRole("menuitem", { name: "Resend invitation" }),
      ).toBeNull();
      await waitFor(() =>
        expect(copy).toHaveBeenCalledWith(
          `${window.location.origin}/invite/1?token=test`,
        ),
      );
      expect(resend).not.toHaveBeenCalled();
    },
  );

  it("标准邮箱可以重发邀请", async () => {
    render(
      <MantineProvider>
        <InviteActionMenu invitationId="invite-1" email="user@example.com" />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Invite actions" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Resend invitation" }),
    );
    expect(resend).toHaveBeenCalledWith({ invitationId: "invite-1" });
  });
});
