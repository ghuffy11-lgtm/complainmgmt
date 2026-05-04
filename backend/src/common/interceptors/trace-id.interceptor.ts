import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    req.id = id;
    res.setHeader('x-request-id', id);
    return next.handle();
  }
}
