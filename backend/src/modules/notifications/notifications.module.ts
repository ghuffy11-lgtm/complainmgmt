import { Logger, Module } from '@nestjs/common';
import { INotificationTransport, NotificationMessage } from './notification-transport.interface';

class NullNotificationTransport implements INotificationTransport {
  readonly key = 'null';
  private readonly log = new Logger('Notifications');
  async send(msg: NotificationMessage): Promise<void> {
    this.log.log(`[null transport] would send "${msg.subject}" to ${JSON.stringify(msg.to)}`);
  }
}

@Module({
  providers: [{ provide: 'NOTIFICATION_TRANSPORTS', useFactory: () => [new NullNotificationTransport()] }],
  exports: ['NOTIFICATION_TRANSPORTS'],
})
export class NotificationsModule {}
