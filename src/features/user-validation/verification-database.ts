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
    isMember BOOLEAN NOT NULL DEFAULT FALSE
  )
`);

/**
 * Synchronise the database with the current membership spreadsheet.
 */
async function syncSheetAndDb(): Promise<void> {
  const emails = new Set(
    (await getEmails()).map((email) => email.trim().toLowerCase())
  );

  db.exec("BEGIN");

  try {
    // Mark every existing email as a non-member.
    // User associations are intentionally left untouched.
    db.prepare(`
      UPDATE verified_users
      SET isMember = FALSE
    `).run();

    // Add new emails and mark existing emails as members.
    const upsertEmail = db.prepare(`
      INSERT INTO verified_users (email, isMember)
      VALUES (?, TRUE)
      ON CONFLICT(email) DO UPDATE SET
        isMember = TRUE
    `);

    for (const email of emails) {
      upsertEmail.run(email);
    }

    // Remove emails that are no longer members and don't
    // have an active discord user association.
    db.prepare(`
      DELETE FROM verified_users
      WHERE isMember = FALSE
        AND userId IS NULL
    `).run();

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

await syncSheetAndDb();

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
