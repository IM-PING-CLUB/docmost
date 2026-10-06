import { BadRequestException } from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { DbInterface } from '@docmost/db/types/db.interface';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { WorkspaceInvitationService } from './workspace-invitation.service';

jest.mock('../../../common/helpers', () => ({
  nanoIdGen: () => 'invite-token',
}));

describe('WorkspaceInvitationService 账号邀请', () => {
  const workspace = {
    id: 'workspace',
    hostname: 'example',
    emailDomains: [],
  } as Workspace;
  const authUser = {
    id: 'inviter',
    name: '管理员',
    email: 'admin@example.com',
    role: 'admin',
  } as User;
  const dto = {
    invitationId: 'invitation',
    token: 'invite-token',
    name: '用户',
    password: 'password',
  };
  let service: WorkspaceInvitationService;
  let query: Record<string, jest.Mock>;
  let db: Record<string, jest.Mock>;
  let userRepo: { findById: jest.Mock; insertUser: jest.Mock };
  let mailService: { sendToQueue: jest.Mock };
  let invitation: Record<string, unknown>;
  let newUser: Record<string, unknown>;

  beforeEach(() => {
    invitation = {
      id: dto.invitationId,
      token: dto.token,
      email: '用户名',
      invitedById: authUser.id,
      role: 'member',
      groupIds: [],
    };
    newUser = {
      id: 'user',
      name: dto.name,
      email: '用户名',
      workspaceId: workspace.id,
    };
    query = {};
    for (const method of [
      'select',
      'selectAll',
      'where',
      'values',
      'onConflict',
      'returningAll',
    ]) {
      query[method] = jest.fn().mockReturnValue(query);
    }
    query.execute = jest.fn().mockResolvedValue([]);
    query.executeTakeFirst = jest.fn().mockResolvedValue(invitation);
    db = {};
    for (const method of ['selectFrom', 'insertInto', 'deleteFrom']) {
      db[method] = jest.fn().mockReturnValue(query);
    }
    db.transaction = jest.fn().mockReturnValue({
      execute: async (callback: (trx: unknown) => Promise<unknown>) =>
        callback(db),
    });
    userRepo = {
      findById: jest.fn().mockResolvedValue(authUser),
      insertUser: jest.fn().mockResolvedValue(newUser),
    };
    mailService = { sendToQueue: jest.fn() };
    service = Object.assign(
      Object.create(WorkspaceInvitationService.prototype),
      {
        db,
        userRepo,
        mailService,
        groupUserRepo: { addUserToDefaultGroup: jest.fn() },
        domainService: { getUrl: () => 'https://example.com' },
        sessionService: {
          createSessionAndToken: jest.fn().mockResolvedValue('session-token'),
        },
        auditService: { log: jest.fn() },
        environmentService: { isCloud: () => false },
        logger: { error: jest.fn() },
      },
    );
  });

  it('规范化、去重并过滤历史大小写账号，仅向真实邮箱发送邀请', async () => {
    const emailInvitation = { ...invitation, email: 'new@example.com' };
    query.execute
      .mockResolvedValueOnce([{ email: 'ExIsTiNg' }])
      .mockResolvedValueOnce([invitation, emailInvitation]);
    await service.createInvitation(
      {
        emails: [
          ' EXISTING ',
          ' 用户名 ',
          'NEW@EXAMPLE.COM',
          'new@example.com',
        ],
        role: 'member',
        groupIds: [],
      },
      workspace,
      authUser,
    );
    expect(query.values).toHaveBeenCalledWith([
      expect.objectContaining({ email: '用户名' }),
      expect.objectContaining({ email: 'new@example.com' }),
    ]);
    const [expression, operator, identifiers] = query.where.mock.calls[0];
    const compilerDb = new Kysely<DbInterface>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (database) => new PostgresIntrospector(database),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
    const compiled = compilerDb
      .selectFrom('users')
      .select('email')
      .where(expression, operator, identifiers)
      .compile();
    expect(compiled.sql).toContain('LOWER(users.email) in');
    expect(compiled.parameters).toEqual([
      'existing',
      '用户名',
      'new@example.com',
    ]);
    expect(mailService.sendToQueue).toHaveBeenCalledTimes(1);
    expect(mailService.sendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@example.com' }),
    );
  });

  it('全部为已有用户时不创建邀请或发邮件', async () => {
    query.execute.mockResolvedValueOnce([{ email: 'USER' }]);
    await service.createInvitation(
      { emails: ['user'], role: 'member', groupIds: [] },
      workspace,
      authUser,
    );
    expect(db.insertInto).not.toHaveBeenCalled();
    expect(mailService.sendToQueue).not.toHaveBeenCalled();
  });

  it('真实邮箱队列失败传递给调用方而非未处理的异步拒绝', async () => {
    query.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...invitation, email: 'user@example.com' }]);
    const error = new Error('queue unavailable');
    mailService.sendToQueue.mockRejectedValueOnce(error);
    await expect(
      service.createInvitation(
        { emails: ['user@example.com'], role: 'member', groupIds: [] },
        workspace,
        authUser,
      ),
    ).rejects.toBe(error);
  });

  it('域名策略在写入邀请前拒绝用户名', async () => {
    await expect(
      service.createInvitation(
        { emails: ['用户名'], role: 'member', groupIds: [] },
        { ...workspace, emailDomains: ['example.com'] },
        authUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('旧用户名邀请可接受、规范化入库并签发会话，不发接受通知', async () => {
    invitation.email = ' USER名 ';
    newUser.email = 'user名';
    await expect(service.acceptInvitation(dto, workspace)).resolves.toEqual({
      authToken: 'session-token',
    });
    expect(userRepo.insertUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user名' }),
      db,
      expect.any(Object),
    );
    expect(mailService.sendToQueue).not.toHaveBeenCalled();
    expect(db.deleteFrom).toHaveBeenCalledWith('workspaceInvitations');
  });

  it.each(['用户名', 'user@@example.com', null, {}, 'a\u0000b'])(
    '受限工作区拒绝旧邀请非法标识 %p，且不写用户',
    async (identifier) => {
      invitation.email = identifier;
      await expect(
        service.acceptInvitation(dto, {
          ...workspace,
          emailDomains: ['example.com'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(userRepo.insertUser).not.toHaveBeenCalled();
    },
  );

  it('无域名策略的非法旧邀请也返回 400', async () => {
    invitation.email = null;
    await expect(
      service.acceptInvitation(dto, workspace),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepo.insertUser).not.toHaveBeenCalled();
  });

  it('真实邮箱接受邀请继续通知真实邮箱邀请人', async () => {
    invitation.email = 'USER@Example.COM';
    newUser.email = 'user@example.com';
    await service.acceptInvitation(dto, {
      ...workspace,
      emailDomains: ['EXAMPLE.COM'],
    });
    expect(mailService.sendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: authUser.email,
        subject: `${dto.name} has accepted your Docmost invite`,
      }),
    );
  });

  it('邮箱用户接受邀请时，邀请人是用户名也不发通知', async () => {
    invitation.email = 'user@example.com';
    newUser.email = invitation.email;
    userRepo.findById.mockResolvedValue({ ...authUser, email: '管理员' });
    await service.acceptInvitation(dto, workspace);
    expect(mailService.sendToQueue).not.toHaveBeenCalled();
  });

  it('用户名重发邀请返回 400 并提示复制链接', async () => {
    await expect(
      service.resendInvitation(dto.invitationId, workspace),
    ).rejects.toThrow('Copy the invitation link');
    expect(mailService.sendToQueue).not.toHaveBeenCalled();
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('真实邮箱可重发邀请', async () => {
    invitation.email = 'user@example.com';
    await service.resendInvitation(dto.invitationId, workspace);
    expect(mailService.sendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: invitation.email }),
    );
  });

  it.each(['用户名', 'bad@@example.com', undefined, null])(
    '邮件入口自身跳过非邮箱 %p',
    async (identifier) => {
      await service.sendInvitationMail('id', identifier, 'token', '管理员');
      expect(mailService.sendToQueue).not.toHaveBeenCalled();
    },
  );
});
