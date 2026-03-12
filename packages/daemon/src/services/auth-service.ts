import type { Database } from "bun:sqlite";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

interface AuthRow {
  id: number;
  password_hash: string | null;
  jwt_secret: string;
  created_at: string;
  updated_at: string;
}

const AUTH_SINGLETON_ID = 1;
const BCRYPT_ROUNDS = 10;

export class AuthService {
  constructor(private readonly db: Database) {
    this.initialize();
  }

  hasPassword(): boolean {
    const row = this.getAuthRow();
    return row?.password_hash !== null;
  }

  async setPassword(plaintext: string): Promise<void> {
    const passwordHash = await hash(plaintext, BCRYPT_ROUNDS);

    this.db
      .query(
        `UPDATE auth
         SET password_hash = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(passwordHash, AUTH_SINGLETON_ID);
  }

  async verifyPassword(plaintext: string): Promise<boolean> {
    const row = this.getAuthRow();

    if (!row?.password_hash) {
      return false;
    }

    return compare(plaintext, row.password_hash);
  }

  getJwtSecret(): string {
    const row = this.getAuthRow();

    if (!row?.jwt_secret) {
      const secret = this.generateJwtSecret();
      this.db
        .query(
          `UPDATE auth
           SET jwt_secret = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(secret, AUTH_SINGLETON_ID);
      return secret;
    }

    return row.jwt_secret;
  }

  regenerateJwtSecret(): string {
    const secret = this.generateJwtSecret();

    this.db
      .query(
        `UPDATE auth
         SET jwt_secret = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(secret, AUTH_SINGLETON_ID);

    return secret;
  }

  initialize(): void {
    this.db.transaction(() => {
      this.db.query("DELETE FROM auth WHERE id != ?").run(AUTH_SINGLETON_ID);

      const existing = this.db
        .query("SELECT id, jwt_secret FROM auth WHERE id = ?")
        .get(AUTH_SINGLETON_ID) as { id: number; jwt_secret: string | null } | null;

      if (!existing) {
        this.db
          .query(
            `INSERT INTO auth (id, password_hash, jwt_secret, created_at, updated_at)
             VALUES (?, NULL, ?, datetime('now'), datetime('now'))`,
          )
          .run(AUTH_SINGLETON_ID, this.generateJwtSecret());
        return;
      }

      if (!existing.jwt_secret) {
        this.db
          .query(
            `UPDATE auth
             SET jwt_secret = ?, updated_at = datetime('now')
             WHERE id = ?`,
          )
          .run(this.generateJwtSecret(), AUTH_SINGLETON_ID);
      }
    })();
  }

  private generateJwtSecret(): string {
    return randomBytes(32).toString("hex");
  }

  private getAuthRow(): AuthRow | null {
    return this.db.query("SELECT * FROM auth WHERE id = ?").get(AUTH_SINGLETON_ID) as
      | AuthRow
      | null;
  }
}
