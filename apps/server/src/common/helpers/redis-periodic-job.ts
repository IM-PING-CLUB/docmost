import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;

type RunOncePerPeriodOptions = {
  redis: Redis;
  periodKey: string;
  lockKey: string;
  periodSeconds: number;
  lockSeconds: number;
  task: () => Promise<void>;
};

export async function runOncePerPeriod({
  redis,
  periodKey,
  lockKey,
  periodSeconds,
  lockSeconds,
  task,
}: RunOncePerPeriodOptions): Promise<boolean> {
  if (await redis.exists(periodKey)) return false;

  const lockValue = randomUUID();
  const acquired = await redis.set(
    lockKey,
    lockValue,
    'EX',
    lockSeconds,
    'NX',
  );

  if (acquired !== 'OK') return false;

  try {
    if (await redis.exists(periodKey)) return false;

    await task();
    await redis.set(periodKey, '1', 'EX', periodSeconds);
    return true;
  } finally {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
  }
}
