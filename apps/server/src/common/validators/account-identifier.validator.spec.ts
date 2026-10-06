import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../core/auth/dto/login.dto';
import { ForgotPasswordDto } from '../../core/auth/dto/forgot-password.dto';
import { InviteUserDto } from '../../core/workspace/dto/invitation.dto';

describe('账号标识 DTO', () => {
  it.each([
    'a',
    '中文账号',
    'User+标签!@',
    'USER@Example.COM',
    'a'.repeat(254),
  ])('邀请、登录和找回密码接受并规范化 %s', async (identifier) => {
    const input = ` ${identifier} `;
    const invite = plainToInstance(InviteUserDto, {
      emails: [input],
      role: 'member',
    });
    const login = plainToInstance(LoginDto, {
      email: input,
      password: 'password',
    });
    const forgot = plainToInstance(ForgotPasswordDto, { email: input });
    expect(await validate(invite)).toEqual([]);
    expect(await validate(login)).toEqual([]);
    expect(await validate(forgot)).toEqual([]);
    expect(invite.emails).toEqual([identifier.toLowerCase()]);
    expect(login.email).toBe(identifier.toLowerCase());
    expect(forgot.email).toBe(identifier.toLowerCase());
  });

  it.each([
    '',
    ' ',
    'a b',
    'a\tb',
    'a\nb',
    'a\u0000b',
    'a\u007fb',
    'a\u0085b',
    'a'.repeat(255),
    null,
    undefined,
    123,
    {},
    ['user'],
  ])('逐项拒绝非法标识 %p，转换不抛异常', async (identifier) => {
    const invite = plainToInstance(InviteUserDto, {
      emails: ['valid', identifier],
      role: 'member',
    });
    expect(
      (await validate(invite)).some((error) => error.property === 'emails'),
    ).toBe(true);
    for (const dto of [LoginDto, ForgotPasswordDto]) {
      const instance = plainToInstance(dto, {
        email: identifier,
        password: 'password',
      });
      expect(
        (await validate(instance)).some((error) => error.property === 'email'),
      ).toBe(true);
    }
  });

  it.each([
    { emails: [] },
    { emails: 'user' },
    { emails: Array(51).fill('user') },
    { role: 'owner' },
    { groupIds: ['invalid'] },
    { groupIds: Array(26).fill('123e4567-e89b-12d3-a456-426614174000') },
  ])('保留人数、角色和群组限制 %p', async (overrides) => {
    const invite = plainToInstance(InviteUserDto, {
      emails: ['user'],
      role: 'member',
      ...overrides,
    });
    expect((await validate(invite)).length).toBeGreaterThan(0);
  });

  it('接受 50 个账号、admin 角色及 25 个合法群组', async () => {
    const invite = plainToInstance(InviteUserDto, {
      emails: Array(50).fill('user'),
      role: 'admin',
      groupIds: Array(25).fill('123e4567-e89b-12d3-a456-426614174000'),
    });
    expect(await validate(invite)).toEqual([]);
  });
});
