import { BadRequestException } from '@nestjs/common';
import { Workspace } from '@docmost/db/types/entity.types';
import { createHmac } from 'node:crypto';
import {
  isAccountIdentifier,
  isEmailAccountIdentifier,
  normalizeAccountIdentifier,
} from '../../common/helpers/account-identifier';

export function computeEmailSignature(
  email: string,
  workspaceId: string,
  appSecret: string,
): string {
  return createHmac('sha256', appSecret)
    .update(`${email.toLowerCase()}:${workspaceId}`)
    .digest('hex');
}

export function throwIfEmailNotVerified(opts: {
  isCloud: boolean;
  emailVerifiedAt: Date | null;
  email: string;
  workspaceId: string;
  appSecret: string;
}): void {
  if (!opts.isCloud || opts.emailVerifiedAt) return;

  const emailSignature = computeEmailSignature(
    opts.email,
    opts.workspaceId,
    opts.appSecret,
  );
  throw new BadRequestException({
    message:
      'Please verify your email address. Check your inbox for the verification link.',
    emailSignature,
  });
}

export function validateSsoEnforcement(workspace: Workspace) {
  if (workspace.enforceSso) {
    throw new BadRequestException('This workspace has enforced SSO login.');
  }
}

export function validateAllowedEmail(userEmail: string, workspace: Workspace) {
  const identifier = normalizeAccountIdentifier(userEmail);
  if (!isAccountIdentifier(identifier)) {
    throw new BadRequestException('Invalid account identifier');
  }
  if (!workspace.emailDomains?.length) return;
  if (!isEmailAccountIdentifier(identifier)) {
    throw new BadRequestException(
      'An email address with an approved domain is required for this workspace.',
    );
  }
  const emailDomain = identifier.slice(identifier.lastIndexOf('@') + 1);
  if (
    !workspace.emailDomains.some(
      (domain) => domain.toLowerCase() === emailDomain,
    )
  ) {
    throw new BadRequestException(
      `The email domain "${emailDomain}" is not approved for this workspace.`,
    );
  }
}
