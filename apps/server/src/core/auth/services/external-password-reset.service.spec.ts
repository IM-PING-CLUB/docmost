import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExternalPasswordResetService } from './external-password-reset.service';
import { comparePasswordHash } from '../../../common/helpers/utils';
import { UserTokenType } from '../auth.constants';
import { EventName } from '../../../common/events/event.contants';

describe('ExternalPasswordResetService', () => {
  function setup(user: any = { id: 'user-1', email: 'user@example.com' }) {
    const query = {
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const trx = { deleteFrom: jest.fn().mockReturnValue(query) };
    const db = { transaction: () => ({ execute: async (fn: any) => fn(trx) }) };
    const users = {
      findByEmail: jest.fn().mockResolvedValue(user),
      updateUser: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = { revokeByUserId: jest.fn().mockResolvedValue(undefined) };
    const events = { emitAsync: jest.fn().mockResolvedValue([]) };
    const audit = { setActorType: jest.fn(), log: jest.fn() };
    const service = new ExternalPasswordResetService(
      users as any,
      sessions as any,
      events as any,
      db as any,
      audit as any,
    );
    return { service, users, sessions, events, audit, trx, query };
  }
  const dto = { email: 'user@example.com', password: 'new-password' };
  const workspace = { id: 'workspace-1' } as any;

  it('hashes the password, invalidates reset tokens and sessions in the same transaction, and emits reset events', async () => {
    const { service, users, sessions, events, audit, trx, query } = setup();
    await service.resetPassword(dto, workspace);
    expect(users.findByEmail).toHaveBeenCalledWith(dto.email, workspace.id);
    const update = users.updateUser.mock.calls[0];
    expect(update.slice(1)).toEqual(['user-1', workspace.id, trx]);
    expect(update[0].hasGeneratedPassword).toBe(false);
    expect(update[0].password).not.toBe(dto.password);
    expect(await comparePasswordHash(dto.password, update[0].password)).toBe(
      true,
    );
    expect(trx.deleteFrom).toHaveBeenCalledWith('userTokens');
    expect(query.where.mock.calls).toEqual([
      ['userId', '=', 'user-1'],
      ['workspaceId', '=', workspace.id],
      ['type', '=', UserTokenType.FORGOT_PASSWORD],
    ]);
    expect(sessions.revokeByUserId).toHaveBeenCalledWith(
      'user-1',
      workspace.id,
      trx,
    );
    expect(events.emitAsync).toHaveBeenCalledWith(
      EventName.USER_PASSWORD_RESET,
      { userId: 'user-1', workspaceId: workspace.id },
    );
    expect(audit.setActorType).toHaveBeenCalledWith('system');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(dto.password);
  });
  it.each([
    undefined,
    { id: 'u', deactivatedAt: new Date() },
    { id: 'u', deletedAt: new Date() },
  ])('rejects unavailable users %j', async (user) => {
    const { service, users, sessions } = setup(null);
    users.findByEmail.mockResolvedValue(user);
    await expect(service.resetPassword(dto, workspace)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.updateUser).not.toHaveBeenCalled();
    expect(sessions.revokeByUserId).not.toHaveBeenCalled();
  });
  it('rejects SSO enforcement and passwords over the bcrypt byte limit before user lookup', async () => {
    const { service, users } = setup();
    await expect(
      service.resetPassword(dto, { ...workspace, enforceSso: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resetPassword({ ...dto, password: '密'.repeat(25) }, workspace),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.findByEmail).not.toHaveBeenCalled();
  });
  it('does not report success or emit events when session revocation fails', async () => {
    const { service, sessions, events, audit } = setup();
    sessions.revokeByUserId.mockRejectedValueOnce(
      new Error('database failure'),
    );
    await expect(service.resetPassword(dto, workspace)).rejects.toThrow(
      'database failure',
    );
    expect(events.emitAsync).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
