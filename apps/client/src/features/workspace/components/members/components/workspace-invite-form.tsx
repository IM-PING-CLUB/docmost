import { Group, Box, Button, TagsInput, Select } from "@mantine/core";
import React, { useState } from "react";
import { MultiGroupSelect } from "@/features/group/components/multi-group-select.tsx";
import { UserRole } from "@/lib/types.ts";
import { userRoleData } from "@/features/workspace/types/user-role-data.ts";
import { useCreateInvitationMutation } from "@/features/workspace/queries/workspace-query.ts";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { accountIdentifierSchema } from "@/features/auth/utils/account-identifier.ts";

interface Props {
  onClose: () => void;
}
export function WorkspaceInviteForm({ onClose }: Props) {
  const { t } = useTranslation();
  const [emails, setEmails] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(UserRole.MEMBER);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const createInvitationMutation = useCreateInvitationMutation();
  const navigate = useNavigate();

  async function handleSubmit() {
    const identifiers = searchValue !== "" ? [...emails, searchValue] : emails;
    const result = z
      .array(accountIdentifierSchema())
      .min(1, { message: "Enter at least one username or email" })
      .max(50, { message: "Invite up to 50 usernames or emails at a time" })
      .safeParse(identifiers);

    if (!result.success) {
      setError(t(result.error.issues[0].message));
      return;
    }

    setError(null);
    try {
      await createInvitationMutation.mutateAsync({
        role: (role ?? UserRole.MEMBER).toLowerCase(),
        emails: [...new Set(result.data)],
        groupIds: groupIds,
      });
    } catch {
      setError(t("Failed to send invitations. Please try again."));
      return;
    }

    onClose();

    navigate("?tab=invites");
  }

  const handleGroupSelect = (value: string[]) => {
    setGroupIds(value);
  };

  return (
    <>
      <Box maw="500" mx="auto">
        <TagsInput
          mt="sm"
          description={t(
            "Enter a username or email and press Enter after each one, up to 50. Use 1–254 characters without whitespace or control characters.",
          )}
          label={t("Username or email")}
          placeholder={t("Enter usernames or emails")}
          variant="filled"
          splitChars={[]}
          maxDropdownHeight={200}
          value={emails}
          onChange={setEmails}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          acceptValueOnBlur={false}
          error={error}
          errorProps={{ role: "alert" }}
          data-autofocus
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
        />

        <Select
          mt="sm"
          description={t("Select role to assign to all invited members")}
          label={t("Select role")}
          placeholder={t("Choose a role")}
          variant="filled"
          data={userRoleData
            .filter((role) => role.value !== UserRole.OWNER)
            .map((role) => ({
              ...role,
              label: t(`${role.label}`),
              description: t(`${role.description}`),
            }))}
          defaultValue={UserRole.MEMBER}
          allowDeselect={false}
          checkIconPosition="right"
          onChange={(value) => setRole(value)}
        />

        <MultiGroupSelect
          mt="sm"
          description={t(
            "Invited members will be granted access to spaces the groups can access",
          )}
          label={t("Add to groups")}
          onChange={handleGroupSelect}
        />

        <Group justify="flex-end" mt="md">
          <Button
            onClick={handleSubmit}
            loading={createInvitationMutation.isPending}
          >
            {t("Send invitation")}
          </Button>
        </Group>
      </Box>
    </>
  );
}
