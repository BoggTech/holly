/* The purpose of this file is to manage membership roles. It gives out the member role,
 * and optionally gives members a "Membership Not Verified" role when they have the
 * member role but no email linked to their account.
 * The latter only happens if MEMBERSHIP_NOT_VERIFIED_ROLE_ID is set.
 * The intent here is for members who received the membership role on some
 * old system (i.e. an older version of Holly) and haven't provided their
 * email for the new system. This is really mostly a temporary issue, but 
 * this file may be repurposed later for other roles.
 */

import type { Guild, GuildMember } from "discord.js";
import { isUserVerified } from "./verification-database.js";

const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID!;
const CONFIGURED_UNVERIFIED_ROLE_ID = process.env.MEMBERSHIP_NOT_VERIFIED_ROLE_ID;

// Only set once setupUnverifiedRole has confirmed the configured role exists
// and can be managed by the bot. Until then, the unverified role is disabled.
let unverifiedRoleId: string | undefined;

/**
 * Validate MEMBERSHIP_NOT_VERIFIED_ROLE_ID against the server and enable the
 * unverified role if it is valid. Call this once the client is ready.
 * Throws if the role is configured but invalid, leaving the feature disabled.
 */
export async function setupUnverifiedRole(guild: Guild): Promise<void> {
  unverifiedRoleId = undefined;

  if (!CONFIGURED_UNVERIFIED_ROLE_ID) {
    return;
  }

  const role = await guild.roles.fetch(CONFIGURED_UNVERIFIED_ROLE_ID);

  if (!role) {
    throw new Error(
      `MEMBERSHIP_NOT_VERIFIED_ROLE_ID (${CONFIGURED_UNVERIFIED_ROLE_ID}) is not a role in this server. The unverified role is disabled.`
    );
  }

  if (!role.editable) {
    throw new Error(
      `The bot cannot manage the role ${role.name} (MEMBERSHIP_NOT_VERIFIED_ROLE_ID), check the bot's role is above it. The unverified role is disabled.`
    );
  }

  unverifiedRoleId = role.id;
}

/**
 * Add or remove the unverified role so that it is present exactly when
 * the member has the member role but no linked email.
 */
export async function syncUnverifiedRole(member: GuildMember): Promise<void> {
  if (!unverifiedRoleId) {
    return;
  }

  const shouldHaveRole =
    member.roles.cache.has(MEMBER_ROLE_ID) && !isUserVerified(member.id);
  const hasRole = member.roles.cache.has(unverifiedRoleId);

  if (shouldHaveRole && !hasRole) {
    await member.roles.add(unverifiedRoleId);
  } else if (!shouldHaveRole && hasRole) {
    await member.roles.remove(unverifiedRoleId);
  }
}

/**
 * Give a member the member role and sync their unverified role.
 * Call this after linking their email (if any), so the sync sees it.
 */
export async function giveMemberRole(member: GuildMember): Promise<GuildMember> {
  const updatedMember = await member.roles.add(MEMBER_ROLE_ID);
  await syncUnverifiedRole(updatedMember);
  return updatedMember;
}

/**
 * Sync the unverified role for every member of the server.
 * Throws a single error listing any members that failed to sync.
 *
 * Uses the member cache rather than fetching, as fetching all members is heavily
 * rate limited. Call this after the cache has been filled (e.g. by reconcileMembers).
 */
export async function syncAllUnverifiedRoles(guild: Guild): Promise<void> {
  if (!unverifiedRoleId) {
    return;
  }

  const members = guild.members.cache;
  const failures: string[] = [];

  for (const member of members.values()) {
    try {
      await syncUnverifiedRole(member);
    } catch (e) {
      failures.push(`<@${member.id}>: ${e}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `syncAllUnverifiedRoles: failed for ${failures.length} member(s)\n${failures.join("\n")}`
    );
  }
}
