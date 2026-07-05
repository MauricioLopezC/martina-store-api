import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AppError } from '../errors/app.error';
import { ConflictError } from '../errors/conflict.error';
import { InvalidOrderStateError } from '../errors/invalid-order-state.error';
import { NotFoundError } from '../errors/not-found.error';
import { UnauthorizedError } from '../errors/unauthorized.error';

@Catch(AppError)
export class AppExceptionFilter implements ExceptionFilter {
  catch(error: AppError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    if (error instanceof NotFoundError) status = HttpStatus.NOT_FOUND;
    if (error instanceof ConflictError) status = HttpStatus.CONFLICT;
    if (error instanceof InvalidOrderStateError) status = HttpStatus.CONFLICT;
    if (error instanceof UnauthorizedError) status = HttpStatus.UNAUTHORIZED;

    res.status(status).json({
      statusCode: status,
      message: error.message,
      error: error.name,
    });
  }
}
