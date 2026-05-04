/**
 * INotificationTransport — pluggable delivery channel.
 *
 * Phase 1: NullNotificationTransport (logs only). No emails are actually sent.
 * Future:  SmtpNotificationTransport, WebhookNotificationTransport, ...
 *
 * Producers call NotificationsService.dispatch(event); the service fans the
 * event out to all configured transports.
 */
export interface INotificationTransport {
  readonly key: string;
  send(message: NotificationMessage): Promise<void>;
}

export type NotificationMessage = {
  to: { userId?: string; email?: string };
  subject: string;
  body: string;
  meta?: Record<string, unknown>;
};
