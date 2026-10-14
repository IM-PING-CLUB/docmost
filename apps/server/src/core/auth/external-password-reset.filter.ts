import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { STATUS_CODES } from 'node:http';

@Catch()
export class ExternalPasswordResetFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExternalPasswordResetFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const error = STATUS_CODES[statusCode] ?? 'Error';
    let messages: string[] = [];
    if (statusCode < 500 && exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : (response as { message?: unknown }).message;
      messages = (Array.isArray(message) ? message : [message]).filter(
        (value): value is string => typeof value === 'string',
      );
    } else {
      // Do not expose or log raw exceptions, which may include credentials or SQL parameters.
      this.logger.error('External password reset failed with a server error');
    }
    host
      .switchToHttp()
      .getResponse<FastifyReply>()
      .status(statusCode)
      .send({
        statusCode,
        error,
        message: messages.length ? messages.join('; ') : error,
      });
  }
}
