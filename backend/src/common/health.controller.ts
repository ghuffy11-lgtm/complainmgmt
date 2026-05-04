import { Controller, Get } from '@nestjs/common';
import { Public } from './decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  ok() {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
