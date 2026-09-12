import { join } from "node:path";
import type { VerifiedUser } from "../../types";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = join(process.cwd(), "secrets/verified-users.sqlite");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS verified_users (
    userId TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE
  )
`);

export function getVerifiedUserByEmail(email: string): VerifiedUser | undefined {
  const row = db
    .prepare(`
      SELECT userId, email
      FROM verified_users
      WHERE email = ?
    `)
    .get(email.trim().toLowerCase()) as {
      userId: string;
      email: string;
    } | undefined;

  return row;
}

/**
 * Mark a user as verified.
 * If the user is already verified, update their email.
 * 
 * @param user - User to verify
 */
export function verifyUserInDb(userId: string, email: string): void {
  db.prepare(`
    INSERT INTO verified_users (userId, email)
    VALUES (?, ?)
    ON CONFLICT(userId) DO UPDATE SET email = excluded.email
  `).run(userId.trim(), email.trim().toLowerCase());
}

/**
 * Remove a user from the verified users.
 *
 * @param userId - ID of the user to deverify
 */
export function deverifyUserInDb(userId: string): void {
  db.prepare(`
    DELETE FROM verified_users
    WHERE userId = ?
  `).run(userId.trim());
}
