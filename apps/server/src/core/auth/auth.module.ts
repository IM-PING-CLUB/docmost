import { Module } from '@nestjs/common';
import { ExternalPasswordResetController } from './external-password-reset.controller';
import { ExternalPasswordResetService } from './services/external-password-reset.service';
import { ExternalPasswordResetGuard } from './guards/external-password-reset.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';

@Module({
  imports: [TokenModule, WorkspaceModule],
  controllers: [AuthController, ExternalPasswordResetController],
  providers: [
    AuthService,
    SignupService,
    JwtStrategy,
    ExternalPasswordResetService,
    ExternalPasswordResetGuard,
  ],
  exports: [SignupService],
})
export class AuthModule {}
