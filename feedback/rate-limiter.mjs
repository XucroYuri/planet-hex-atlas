export const LIMITER_OBJECT_NAME = 'website-feedback';
export const RESERVE_URL = 'https://feedback-rate-limiter.invalid/reserve';
export const WINDOW_MS = 60_000;
export const MAX_PER_CLIENT = 5;
export const MAX_TOTAL = 60;
export const TOKEN_RETENTION_MS = 600_000;

const sha256Hex = /^[a-f0-9]{64}$/;

export class FeedbackRateLimiter {
  constructor(state) {
    this.storage = state.storage;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reservations (
      token_hash TEXT PRIMARY KEY NOT NULL,
      client_hash TEXT NOT NULL,
      reserved_at INTEGER NOT NULL
    )`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS reservations_by_time ON reservations (reserved_at)');
  }

  async fetch(request) {
    if (request.method !== 'POST' || request.url !== RESERVE_URL) {
      return new Response(null, { status: 404 });
    }
    const clientHash = request.headers.get('X-Feedback-Client-Hash');
    const tokenHash = request.headers.get('X-Feedback-Token-Hash');
    if (!sha256Hex.test(clientHash) || !sha256Hex.test(tokenHash)) {
      return new Response(null, { status: 400 });
    }

    if (await this.storage.getAlarm() === null) {
      await this.storage.setAlarm(Date.now() + TOKEN_RETENTION_MS);
    }
    const now = Date.now();
    const status = this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM reservations WHERE reserved_at <= ?', now - TOKEN_RETENTION_MS);
      if (this.sql.exec('SELECT 1 FROM reservations WHERE token_hash = ?', tokenHash).toArray().length) {
        return 409;
      }
      const { total, per_client: perClient } = this.sql.exec(`
        SELECT COUNT(*) AS total, COALESCE(SUM(client_hash = ?), 0) AS per_client
        FROM reservations WHERE reserved_at > ?`, clientHash, now - WINDOW_MS).one();
      if (total >= MAX_TOTAL || perClient >= MAX_PER_CLIENT) {
        return 429;
      }
      this.sql.exec('INSERT INTO reservations VALUES (?, ?, ?)', tokenHash, clientHash, now);
      return 204;
    });
    return new Response(null, { status });
  }

  async alarm() {
    const oldest = this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM reservations WHERE reserved_at <= ?', Date.now() - TOKEN_RETENTION_MS);
      return this.sql.exec('SELECT MIN(reserved_at) AS oldest FROM reservations').one().oldest;
    });
    if (oldest !== null) {
      await this.storage.setAlarm(oldest + TOKEN_RETENTION_MS);
    }
  }
}
