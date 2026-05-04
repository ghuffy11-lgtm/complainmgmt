import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { error: 'Internal Server Error', code: 'INTERNAL' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') {
        body = { error: r, code: 'HTTP_ERROR' };
      } else if (typeof r === 'object' && r !== null) {
        body = { ...(r as Record<string, unknown>) };
        body.error ??= exception.name;
        body.code ??= 'HTTP_ERROR';
      }
    } else {
      this.log.error('Unhandled exception', exception as Error);
    }

    body.traceId = (req as Request & { id?: string }).id ?? res.getHeader('x-request-id');
    res.status(status).json(body);
  }
}
