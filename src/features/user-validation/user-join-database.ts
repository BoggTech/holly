/* The purpose of this file is to keep track of user join/leave dates, while the bot is online. 
 * This helps us understand, after the bot goes down/up, if we've missed a user leaving or joining. 
 */

import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Guild } from "discord.js";
import { deverifyUserInDb } from "./verification-database.js";

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID!;
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID!;
const DB_PATH = join(process.cwd(), "secrets/verified-users.sqlite");
const db = new DatabaseSync(DB_PATH);

/**
 * Records a user's current Discord membership.
 * If the user already exists, their join timestamp is updated.
 */
export function recordMemberJoin(userId: string, joinedAt: Date): void {
  db.prepare(`
    INSERT INTO discord_members (userId, joinedAt)
    VALUES (?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      joinedAt = excluded.joinedAt
  `).run(
    userId.trim(),
    joinedAt.getTime()
  );
}

/**
 * Remove a user's current Discord membership.
 */
export function removeMemberJoin(userId: string): void {
  db.prepare(`
    DELETE FROM discord_members
    WHERE userId = ?
  `).run(userId.trim());
}

/**
 * Gets the join timestamp we have stored for a Discord user.
 */
export function getMemberJoinedAt(userId: string): Date | undefined {
  const row = db
    .prepare(`
      SELECT joinedAt
      FROM discord_members
      WHERE userId = ?
    `)
    .get(userId.trim()) as
      | { joinedAt: number }
      | undefined;

  if (!row) {
    return undefined;
  }

  return new Date(row.joinedAt);
}

/**
 * Checks whether the stored join timestamp matches the user's
 * current Discord membership.
 */
export function isCurrentMembership(userId: string, joinedAt: Date): boolean {
  const storedJoinedAt = getMemberJoinedAt(userId);

  if (!storedJoinedAt) {
    return false;
  }

  return storedJoinedAt.getTime() === joinedAt.getTime();
}

/**
 * Reconcile the members stored in the database with the
 * members currently in the Discord server.
 *
 * This handles members who left and rejoined while the bot
 * was offline.
 *
 * Welcome messages are only sent when the membership table
 * already existed before this reconciliation. This prevents
 * the first run after upgrading from sending welcome messages
 * to every existing member.
 */
export async function reconcileMembers(guild: Guild): Promise<void> {
  const tableExists = db
    .prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'discord_members'
    `)
    .get() !== undefined;

  if (!tableExists) {
    db.exec(`
      CREATE TABLE discord_members (
        userId TEXT PRIMARY KEY,
        joinedAt INTEGER NOT NULL
      )
    `);
  }

  const members = await guild.members.fetch();

  const storedMembers = db
    .prepare(`
      SELECT userId, joinedAt
      FROM discord_members
    `)
    .all() as {
      userId: string;
      joinedAt: number;
    }[];

  const storedMembersById = new Map(
    storedMembers.map((member) => [member.userId, member])
  );

  // Remove database entries for members who are no longer in the server.
  for (const storedMember of storedMembers) {
    if (!members.has(storedMember.userId)) {
      deverifyUserInDb(storedMember.userId);
      removeMemberJoin(storedMember.userId);
    }
  }

  // Record new members and detect members who left and rejoined while the bot was offline.
  for (const member of members.values()) {
    const storedMember = storedMembersById.get(member.id);

    if (!storedMember) {
      // Brand new user
      recordMemberJoin(member.id, member.joinedAt!);

      if (tableExists) {
        await sendWelcomeMessage(guild, member.id);
      }

      continue;
    }

    if (storedMember.joinedAt !== member.joinedAt!.getTime()) {
      // User left and rejoined, so they should have had their email association wiped.
      deverifyUserInDb(member.id);
      recordMemberJoin(member.id, member.joinedAt!);

      if (tableExists) {
        await sendWelcomeMessage(guild, member.id);
      }
    }
  }
}

export async function sendWelcomeMessage(guild: Guild, userId: string): Promise<void> {
  const channel = guild.channels.cache.get(WELCOME_CHANNEL_ID);

  if (!channel || channel.type !== 0) {
    throw new Error(
      `Welcome channel ${WELCOME_CHANNEL_ID} could not be found`
    );
  }

  await channel.send(
    `## Welcome <@${userId}> to the Discord server! :partying_face:\n` +
      `To access the rest of the server, follow the instructions in <#${VERIFICATION_CHANNEL_ID}>.`
  );
}