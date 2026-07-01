//#region src/i18n/externalNotifications/types.d.ts
interface EmailStrings {
  footer: string;
  manage: string;
  madeWith: string;
  openMemove: string;
}
interface EventText {
  title: string;
  body: string;
}
type EventTextFn = (params: Record<string, string>) => EventText;
interface PasswordResetStrings {
  subject: string;
  greeting: string;
  body: string;
  ctaIntro: string;
  expiry: string;
  ignore: string;
}
type NotificationEventKey = 'trip_invite' | 'booking_change' | 'trip_reminder' | 'todo_due' | 'vacay_invite' | 'photos_shared' | 'collab_message' | 'packing_tagged' | 'version_available' | 'synology_session_cleared';
interface NotificationLocale {
  email: EmailStrings;
  events: Record<NotificationEventKey, EventTextFn>;
  passwordReset: PasswordResetStrings;
}
//#endregion
//#region src/i18n/externalNotifications/index.d.ts
declare const EMAIL_I18N: Record<string, EmailStrings>;
declare const EVENT_TEXTS: Record<string, Record<NotificationEventKey, EventTextFn>>;
declare const PASSWORD_RESET_I18N: Record<string, PasswordResetStrings>;
//#endregion
export { EMAIL_I18N, EVENT_TEXTS, EmailStrings, EventText, EventTextFn, NotificationEventKey, NotificationLocale, PASSWORD_RESET_I18N, PasswordResetStrings };