import { plainToInstance } from 'class-transformer';
import {
  BadRequestException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthService } from './auth.service';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { comparePasswordHash } from '../../../common/helpers';

jest.mock('./signup.service', () => ({ SignupService: jest.fn() }));
jest.mock('../../../common/helpers', () => ({
  comparePasswordHash: jest.fn(),
  hashPassword: jest.fn(),
  isUserDisabled: (user: { deactivatedAt?: Date }) => !!user.deactivatedAt,
  nanoIdGen: () => 'reset-token',
}));

describe('AuthService 账号标识', () => {
  const workspace = { id: 'workspace', hostname: 'example' } as Workspace;
  let service: AuthService;
  let userRepo: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    updateUser: jest.Mock;
    updateLastLogin: jest.Mock;
  };
  let mailService: { sendToQueue: jest.Mock };
  let userTokenRepo: { insertUserToken: jest.Mock };
  let sessionService: { createSessionAndToken: jest.Mock };
  let db: { transaction: jest.Mock };
  let user: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = {
      id: 'user',
      email: '用户名',
      name: '用户',
      password: 'hash',
      workspaceId: workspace.id,
      emailVerifiedAt: new Date(),
    };
    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(user),
      findById: jest.fn().mockResolvedValue(user),
      updateUser: jest.fn(),
      updateLastLogin: jest.fn(),
    };
    mailService = { sendToQueue: jest.fn() };
    userTokenRepo = { insertUserToken: jest.fn() };
    sessionService = {
      createSessionAndToken: jest.fn().mockResolvedValue('session-token'),
    };
    const query = {
      deleteFrom: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    db = {
      transaction: jest.fn().mockReturnValue({
        execute: async (callback: (trx: unknown) => Promise<unknown>) =>
          callback(query),
      }),
    };
    service = Object.assign(Object.create(AuthService.prototype), {
      userRepo,
      mailService,
      userTokenRepo,
      sessionService,
      userSessionRepo: {
        deleteAllExceptCurrent: jest.fn(),
        deleteByUserId: jest.fn(),
      },
      db,
      domainService: { getUrl: () => 'https://example.com' },
      environmentService: {
        isCloud: () => false,
        getAppSecret: () => 'secret',
      },
      auditService: { log: jest.fn() },
    });
    jest.mocked(comparePasswordHash).mockResolvedValue(true);
  });

  it('通过真实 ValidationPipe 接受并登录规范化用户名', async () => {
    const dto = await new ValidationPipe({
      transform: true,
      whitelist: true,
    }).transform(
      { email: ' 用户名 ', password: 'password' },
      { type: 'body', metatype: LoginDto },
    );
    await expect(service.login(dto, workspace.id)).resolves.toBe(
      'session-token',
    );
    expect(userRepo.findByEmail).toHaveBeenCalledWith('用户名', workspace.id, {
      includePassword: true,
    });
    expect(sessionService.createSessionAndToken).toHaveBeenCalledWith(user);
  });

  it('非法登录输入在 ValidationPipe 返回 400', async () => {
    await expect(
      new ValidationPipe({ transform: true }).transform(
        { email: {}, password: 'password' },
        { type: 'body', metatype: LoginDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['用户名', 'user@example.com'])(
    '账号 %s 可以修改密码，仅邮箱账号发送通知',
    async (identifier) => {
      user.email = identifier;
      await expect(
        service.changePassword(
          { oldPassword: 'old-password', newPassword: 'new-password' },
          'user',
          workspace.id,
        ),
      ).resolves.toBeUndefined();
      expect(userRepo.updateUser).toHaveBeenCalled();
      if (identifier.includes('@')) {
        expect(mailService.sendToQueue).toHaveBeenCalledWith(
          expect.objectContaining({ to: identifier }),
        );
      } else {
        expect(mailService.sendToQueue).not.toHaveBeenCalled();
      }
    },
  );

  it('不存在的用户名与错误密码均返回 401', async () => {
    userRepo.findByEmail.mockResolvedValueOnce(undefined);
    await expect(
      service.login({ email: 'missing', password: 'password' }, workspace.id),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    jest.mocked(comparePasswordHash).mockResolvedValueOnce(false);
    await expect(
      service.login({ email: '用户名', password: 'wrong' }, workspace.id),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['用户名', 'not@an@email', 'missing'])(
    '用户名 %s 找回密码走通用响应且不生成令牌或发邮件',
    async (identifier) => {
      const dto = plainToInstance(ForgotPasswordDto, { email: identifier });
      await expect(
        service.forgotPassword(dto, workspace),
      ).resolves.toBeUndefined();
      expect(userRepo.findByEmail).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(userTokenRepo.insertUserToken).not.toHaveBeenCalled();
      expect(mailService.sendToQueue).not.toHaveBeenCalled();
    },
  );

  it('真实邮箱保持令牌与邮件流程', async () => {
    user.email = 'user@example.com';
    const dto = plainToInstance(ForgotPasswordDto, {
      email: ' USER@EXAMPLE.COM ',
    });
    await service.forgotPassword(dto, workspace);
    expect(userTokenRepo.insertUserToken).toHaveBeenCalled();
    expect(mailService.sendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: 'Reset your password',
      }),
    );
  });

  it('邮箱查询意外返回非邮箱账号时不发邮件', async () => {
    await service.forgotPassword({ email: 'user@example.com' }, workspace);
    expect(mailService.sendToQueue).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
