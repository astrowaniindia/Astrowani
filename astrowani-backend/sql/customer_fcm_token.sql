-- FCM token storage for the customer app, used to send push notifications
-- (incoming chat while backgrounded, missed sessions, admin broadcasts).
alter table customers add column if not exists fcm_token text;
