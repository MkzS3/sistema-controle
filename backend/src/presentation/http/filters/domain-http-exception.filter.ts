import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DomainError, DomainFailureCode } from '../../../domain/shared/errors/domain-error.js';
import { ApplicationInputError, ApplicationNotFoundError } from '../../../application/errors/application-error.js';
import { IdempotencyPayloadConflictError } from '../../../infrastructure/persistence/repositories/persistence-errors.js';

interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

interface PostgreSqlErrorLike {
  code?: string;
}

@Catch()
export class DomainHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponseLike>();
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof ApplicationNotFoundError) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ApplicationInputError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof DomainError) {
      const conflict =
        exception.code === DomainFailureCode.InvalidDividendState ||
        exception.code === DomainFailureCode.InvalidObligationState ||
        exception.code === DomainFailureCode.DuplicateDividendObligation;
      const status = conflict ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
      response.status(status).json({ statusCode: status, code: exception.code, message: exception.message });
      return;
    }

    if (exception instanceof IdempotencyPayloadConflictError) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
        message: 'This idempotency key was already used with a different payload.',
      });
      return;
    }

    const databaseError = exception as PostgreSqlErrorLike | null;
    if (databaseError?.code === '23505') {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        code: 'PERSISTENCE_UNIQUE_CONFLICT',
        message: 'A record with this business identity already exists.',
      });
      return;
    }
    if (databaseError?.code === '23503' || databaseError?.code === '23514') {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        code: 'PERSISTENCE_INVARIANT_VIOLATION',
        message: 'The requested operation conflicts with persisted financial state.',
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected internal server error.',
    });
  }
}
