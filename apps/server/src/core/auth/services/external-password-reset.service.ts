import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { executeTx } from '@docmost/db/utils';
import { hashPassword, isUserDisabled } from '../../../common/helpers/utils';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import { EventName } from '../../../common/events/event.contants';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { ExternalPasswordResetDto } from '../dto/external-password-reset.dto';
import { UserTokenType } from '../auth.constants';
import { validateSsoEnforcement } from '../auth.util';

@Injectable()
export class ExternalPasswordResetService {
  private readonly logger = new Logger(ExternalPasswordResetService.name);

  constructor(
    private readonly userRepo: UserRepo,
    private readonly userSessionRepo: UserSessionRepo,
    private readonly eventEmitter: EventEmitter2,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async resetPassword(
    dto: ExternalPasswordResetDto,
    workspace: Workspace,
  ): Promise<void> {
    validateSsoEnforcement(workspace);
    // bcrypt silently truncates passwords after 72 bytes (including UTF-8).
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Password must not exceed 72 UTF-8 bytes');
    }
    const user = await this.userRepo.findByEmail(dto.email, workspace.id);
    if (!user || isUserDisabled(user)) {
      throw new NotFoundException('User not found');
    }

    const password = await hashPassword(dto.password);
    await executeTx(this.db, async (trx) => {
      await this.userRepo.updateUser(
        { password, hasGeneratedPassword: false },
        user.id,
        workspace.id,
        trx,
      );
      await trx
        .deleteFrom('userTokens')
        .where('userId', '=', user.id)
        .where('workspaceId', '=', workspace.id)
        .where('type', '=', UserTokenType.FORGOT_PASSWORD)
        .execute();
      await this.userSessionRepo.revokeByUserId(user.id, workspace.id, trx);
    });

    // Match the existing reset flow: OAuth cleanup failure does not undo the reset.
    try {
      await this.eventEmitter.emitAsync(EventName.USER_PASSWORD_RESET, {
        userId: user.id,
        workspaceId: workspace.id,
      });
    } catch (err) {
      this.logger.error(
        `Failed to revoke OAuth grants for user ${user.id} after external password reset`,
        err,
      );
    }
    this.auditService.setActorType('system');
    this.auditService.log({
      event: AuditEvent.USER_PASSWORD_RESET,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { source: 'external_password_reset' },
    });
  }
}
