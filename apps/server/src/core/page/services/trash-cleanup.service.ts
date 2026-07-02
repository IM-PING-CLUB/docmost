import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { runOncePerPeriod } from '../../../common/helpers';

const DEFAULT_RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60;
const TRASH_CLEANUP_PERIOD_KEY = 'job:trash-cleanup:period';
const TRASH_CLEANUP_LOCK_KEY = 'job:trash-cleanup:lock';
const TRASH_CLEANUP_LOCK_SECONDS = 60 * 60;

@Injectable()
export class TrashCleanupService {
  private readonly logger = new Logger(TrashCleanupService.name);
  private readonly redis: Redis;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    private readonly redisService: RedisService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  @Interval('trash-cleanup', 24 * 60 * 60 * 1000) // every 24 hours
  async cleanupOldTrash() {
    try {
      await runOncePerPeriod({
        redis: this.redis,
        periodKey: TRASH_CLEANUP_PERIOD_KEY,
        lockKey: TRASH_CLEANUP_LOCK_KEY,
        periodSeconds: CLEANUP_INTERVAL_SECONDS,
        lockSeconds: TRASH_CLEANUP_LOCK_SECONDS,
        task: async () => {
          this.logger.log('========================');
          this.logger.debug('Starting trash cleanup job');

          const workspaces = await this.db
            .selectFrom('workspaces')
            .select(['id', 'trashRetentionDays'])
            .where('deletedAt', 'is', null)
            .execute();

          let totalCleaned = 0;

          for (const workspace of workspaces) {
            const retentionDays =
              workspace.trashRetentionDays ?? DEFAULT_RETENTION_DAYS;

            const retentionDate = new Date();
            retentionDate.setDate(retentionDate.getDate() - retentionDays);

            const oldDeletedPages = await this.db
              .selectFrom('pages')
              .select(['id'])
              .where('workspaceId', '=', workspace.id)
              .where('deletedAt', '<', retentionDate)
              .execute();

            for (const page of oldDeletedPages) {
              try {
                await this.cleanupPage(page.id);
                totalCleaned++;
              } catch (error) {
                this.logger.error(
                  `Failed to cleanup page ${page.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  error instanceof Error ? error.stack : undefined,
                );
              }
            }
          }

          this.logger.debug(
            totalCleaned > 0
              ? `Trash cleanup completed: ${totalCleaned} pages cleaned`
              : 'No old trash items to clean up',
          );
        },
      });
    } catch (error) {
      this.logger.error(
        'Trash cleanup job failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async cleanupPage(pageId: string) {
    // Get all descendants using recursive CTE (including the page itself)
    const descendants = await this.db
      .withRecursive('page_descendants', (db) =>
        db
          .selectFrom('pages')
          .select(['id'])
          .where('id', '=', pageId)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select(['p.id'])
              .innerJoin('page_descendants as pd', 'pd.id', 'p.parentPageId'),
          ),
      )
      .selectFrom('page_descendants')
      .selectAll()
      .execute();

    const pageIds = descendants.map((d) => d.id);

    this.logger.debug(
      `Cleaning up page ${pageId} with ${pageIds.length - 1} descendants`,
    );

    // Queue attachment deletion for all pages with unique job IDs to prevent duplicates
    for (const id of pageIds) {
      await this.attachmentQueue.add(
        QueueJob.DELETE_PAGE_ATTACHMENTS,
        {
          pageId: id,
        },
        {
          jobId: `delete-page-attachments-${id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
    }

    try {
      if (pageIds.length > 0) {
        await this.db.deleteFrom('pages').where('id', 'in', pageIds).execute();
      }
    } catch (error) {
      // Log but don't throw - pages might have been deleted by another node
      this.logger.warn(
        `Error deleting pages, they may have been already deleted: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
