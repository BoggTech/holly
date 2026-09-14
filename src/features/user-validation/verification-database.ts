import { join } from "node:path";
import type { VerifiedUser } from "../../types";
import { DatabaseSync } from "node:sqlite";
import { getEmails } from "./read-google-sheet.js";
import { sendStarterEmail } from "../email-validation/send-verification-email.js"
import { randomInt } from 'node:crypto';
import cron from 'node-cron';

const DB_PATH = join(process.cwd(), "secrets/verified-users.sqlite");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS verified_users (
    email TEXT PRIMARY KEY,
    userId TEXT UNIQUE,
    isMember BOOLEAN NOT NULL DEFAULT FALSE,
    verification_code TEXT UNIQUE,
    verification_generated_at INTEGER
  )
`);

/**
 * Synchronise the database with the current membership spreadsheet.
 */
export async function syncSheetAndDb(): Promise<void> {
  const emails = new Set(
    (await getEmails()).map((email) => email.trim().toLowerCase())
  );

  // Sanity check in case it becomes empty
  if (emails.size === 0) {
    throw new Error("Membership spreadsheet returned no emails");
  }

  // Get the emails that existed in the DB before this sync.
  const existingRows = db
    .prepare(`
      SELECT email
      FROM verified_users
    `)
    .all() as { email: string }[];

  const existingEmails = new Set(
    existingRows.map((row) => row.email)
  );

  // These emails genuinely didn't exist in the DB before the sync.
  const newEmails = [...emails].filter(
    (email) => !existingEmails.has(email)
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

  // Only send these after the DB transaction succeeded.
  for (const email of newEmails) {
    await sendStarterEmail(email);
  }
}

await syncSheetAndDb();

// The CSC typically updates memberships every half hour, **:00 and **:30
// So lets sync every **:01 and **:31
cron.schedule('1,31 * * * *', syncSheetAndDb );

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

export function generateVerificationCode(email: string): void {
  // This is a sanity check. We won't realistically get anywhere near here, unless
  // something is HORRIBLY wrong.
  let attempts = 0;
  const maxAttempts = 1000;

  while (true) {
    attempts += 1;
    const code = randomInt(100000, 1000000).toString();

    try {
      db.prepare(`
        UPDATE verified_users
        SET verification_code = ?,
            verification_generated_at = ?
        WHERE email = ?
      `).run(code, Date.now(), email);
      return

    } catch (error) {
      // SQLite UNIQUE constraint collision — try again
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed') &&
        attempts < maxAttempts
      ) {
        continue;
      }
      
      throw error;
    }
  }
}

export function getVerificationGeneratedAt(email: string): number | undefined {
  const row = db
    .prepare(`
      SELECT verification_generated_at
      FROM verified_users
      WHERE email = ?
    `)
    .get(email) as
      | { verification_generated_at: number | null }
      | undefined;

  return row?.verification_generated_at ?? undefined;
}

export function getVerificationCode(email: string): string | undefined {
  const row = db
    .prepare(`
      SELECT verification_code
      FROM verified_users
      WHERE email = ?
    `)
    .get(email) as | { verification_code: string | null } | undefined;

  return row?.verification_code ?? undefined;
}

export function getEmailByVerificationCode(code: string): string | undefined {
  const row = db
    .prepare(`
      SELECT email
      FROM verified_users
      WHERE verification_code = ?
    `)
    .get(code.trim()) as
      | { email: string }
      | undefined;

  return row?.email;
}

export function isMemberEmail(email: string): boolean {
  const row = db
    .prepare(`
      SELECT 1
      FROM verified_users
      WHERE email = ?
        AND isMember = TRUE
    `)
    .get(email.trim().toLowerCase());

  return row !== undefined;
}

export function isUserVerified(userId: string): boolean {
  const row = db
    .prepare(`
      SELECT 1
      FROM verified_users
      WHERE userId = ?
    `)
    .get(userId.trim());

  return row !== undefined;
}

export function clearVerificationInfo(email: string): void {
  db.prepare(`
    UPDATE verified_users
    SET verification_code = NULL,
        verification_generated_at = NULL
    WHERE email = ?
  `).run(email.trim().toLowerCase());
}