import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { ExternalPasswordResetDto } from './dto/external-password-reset.dto';
import { ExternalPasswordResetGuard } from './guards/external-password-reset.guard';
import { ExternalPasswordResetService } from './services/external-password-reset.service';
import { ExternalPasswordResetFilter } from './external-password-reset.filter';

@Controller('auth')
@UseFilters(ExternalPasswordResetFilter)
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
@UseGuards(ThrottlerGuard, ExternalPasswordResetGuard)
export class ExternalPasswordResetController {
  constructor(private readonly service: ExternalPasswordResetService) {}

  @Post('external-password-reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ExternalPasswordResetDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.service.resetPassword(dto, workspace);
    return { success: true };
  }
}
