import { join } from "node:path";
import type { VerifiedUser } from "../../types";
import { DatabaseSync } from "node:sqlite";
import { getEmails } from "./read-google-sheet.js";

const DB_PATH = join(process.cwd(), "secrets/verified-users.sqlite");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS verified_users (
    email TEXT PRIMARY KEY,
    userId TEXT UNIQUE,
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
      userId: string | null;
      email: string;
    } | undefined;

  if (!row || !row.userId) {
    return undefined;
  }

  return {
    userId: row.userId ?? undefined,
    email: row.email,
  };
}

/**
 * Mark a user as verified.
 * If the user is already verified, update their email.
 *
 * Throws if the email is already associated with another user.
 *
 * @param userId - ID of the user to verify
 * @param email - Email to associate with the user
 */
export function verifyUserInDb(userId: string, email: string): void {
  const normalizedUserId = userId.trim();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = db
    .prepare(`
      SELECT userId
      FROM verified_users
      WHERE email = ?
    `)
    .get(normalizedEmail) as {
      userId: string | null;
    } | undefined;

  // The email is already claimed by another user.
  if (existing?.userId && existing.userId !== normalizedUserId) {
    throw new Error("Email is already associated with another user");
  }

  db.prepare(`
    INSERT INTO verified_users (email, userId)
    VALUES (?, ?)
    ON CONFLICT(email) DO UPDATE SET
      userId = excluded.userId
  `).run(normalizedEmail, normalizedUserId);
}


/**
 * Remove a user's email association while keeping
 * the email and its membership status.
 *
 * @param userId - ID of the user to deverify
 */
export function deverifyUserInDb(userId: string): void {
  db.prepare(`
    UPDATE verified_users
    SET userId = NULL
    WHERE userId = ?
  `).run(userId.trim());
}
