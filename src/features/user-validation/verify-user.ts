import {
  type Channel,
  ChannelType,
  type GuildMember,
  type Message,
  type MessageCollector,
  PermissionsBitField,
  type TextChannel,
} from "discord.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getEmails } from "./read-google-sheet.js";
import { getVerifiedUserByEmail, verifyUserInDb } from "./verification-database.js";
import error from "../../system/error.js";

const PRONOUNS_ROLES_PATH = join(process.cwd(), "/secrets/pronouns-roles.json");
export const VERIFICATION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Node.js timers use 32-bit signed integers for the delay, so any value above ~24.8 days
 * overflows and fires immediately. This chains multiple timeouts to support arbitrary durations.
 * Returns a cancel function.
 */
function setLargeTimeout(callback: () => void, ms: number): () => void {
  const MAX_TIMER_MS = 2 ** 31 - 1;
  let handle: NodeJS.Timeout;
  if (ms > MAX_TIMER_MS) {
    handle = setTimeout(() => setLargeTimeout(callback, ms - MAX_TIMER_MS), MAX_TIMER_MS);
  } else {
    handle = setTimeout(callback, ms);
  }
  return () => clearTimeout(handle);
}

export default async function startVerification(member: GuildMember) {
  // Create a temporary channel for the user to verify in
  const tempChannel = await member.guild.channels.create({
    name: `welcome-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: process.env.WELCOME_CATEGORY_ID,
    // Only the new member should be able to view this channel
    permissionOverwrites: [
      {
        id: member.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: member.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ],
  });

  // Retrieve welcome channel and send message telling user to go to the temporary channel
  const welcomeChannel = member.guild.channels.cache.get(
    process.env.WELCOME_CHANNEL_ID!
  ) as TextChannel;

  try {
    await welcomeChannel
      .send(`## Welcome <@${member.user.id}> to the Discord server! :partying_face:
To access the rest of the server, follow the instructions in the <#${tempChannel.id}> channel.
    `);
  } catch (e) {
    error(`startVerification: Failed to send welcome message: ${e}`);
  }

  // In temporary channel, instruct user how to verify their membership
  try {
    await tempChannel.send(`## Society Membership Verification
<@${member.user.id}>, to access the rest of the server, please follow these steps in order:
1. Choose your **pronouns** in the <#${process.env.ROLES_CHANNEL_ID}> channel.
2. Change your server **nickname** to your name. You can do this by clicking the drop-down menu at the top left of this server, and choosing *Edit Server Profile*.
3. **Introduce yourself** in the <#${process.env.WELCOME_CHANNEL_ID}> channel! What do you study? What parts of the society interest you?
4. Finally, please enter your **TCD email** in this chat and I'll check if you're on the membership list!
  `);
  } catch (e) {
    error(`startVerification: Failed to send verification instructions: ${e}`);
  }

  // Attach the collector and reminder
  attachVerificationCollector(tempChannel, welcomeChannel, member);
}

/**
 * Attach a message collector and daily reminder to an existing verification channel.
 * Used both by startVerification and by restart recovery.
 */
export function attachVerificationCollector(
  tempChannel: TextChannel,
  welcomeChannel: TextChannel,
  member: GuildMember,
  timeMs = VERIFICATION_PERIOD_MS
) {
  const reminderInterval = setInterval(async () => {
    if (!member.roles.cache.has(process.env.MEMBER_ROLE_ID!) && tempChannel) {
      try {
        await tempChannel.send(
          `Hey <@${member.user.id}>, just a reminder to complete your verification steps so you can access the rest of the server!`
        );
      } catch (e) {
        error(`verification reminder: Failed to send reminder: ${e}`);
        clearInterval(reminderInterval);
      }
    } else {
      clearInterval(reminderInterval);
    }
  }, 7 * 24 * 60 * 60 * 1000); // weekly

  // Filter messages in temporary channel so Holly doesn't read any messages but those of the user being verified
  // Doing this means we don't have to worry about message.member being null, so use ! postfix.
  const filter = (message: Message) => message.member === member;
  // Create a "message collector" in the temporary channel so Holly can read the user's messages
  const collector = tempChannel.createMessageCollector({ filter });

  // Use a chained timeout to close the collector after the verification period,
  // working around the Node.js 32-bit integer limit on timer delays
  const cancelTimeout = setLargeTimeout(() => collector.stop(), timeMs);

  collector.on("collect", async (message: Message) => {
    try {
      // Fetch fresh data on each message
      const emails = await getEmails();
      const pronouns: string[] = JSON.parse(
        (await readFile(PRONOUNS_ROLES_PATH)).toString()
      );

      // Check if user has selected at least one pronouns role
      if (!hasPronounsRole(member, pronouns)) {
        await message.reply(
          `Hey, you haven't chosen your pronouns in <#${process.env.ROLES_CHANNEL_ID}>. Please follow all the steps, then come back here and enter your email again!`
        );
        return;
      }

      // Check if user has posted an introduction in the welcome channel
      if (!(await hasPostedIntroduction(member, welcomeChannel))) {
        await message.reply(
          `Hey, you haven't posted an introduction in <#${process.env.WELCOME_CHANNEL_ID}>. Please follow all the steps, then come back here and enter your email again!`
        );
        return;
      }

      // Check if the message is an email address on the sign-up list
      const providedEmail = message.content.trim().toLowerCase();
      if (!emails.some((email) => email.toLowerCase() === providedEmail)) {
        await message.reply(
          `Sorry, that's not an email address on our sign-up list.
- Your message should contain an email address, e.g. 'jcrowley@tcd.ie', and nothing else.
- If you haven't signed up yet, you can do so here: https://trinitysocietieshub.com/products/science-fiction-and-fantasy-society.
- If you joined today, the sign-up list might not have updated yet, so you should wait a few hours and try again.
      `
        );
        return;
      }

      // Retrieve list of verified users and determine if user is already verified
      const user = getVerifiedUserByEmail(providedEmail);
      if (user) {
        // This happens if somebody else has already verified with the same email
        if (user.userId !== message.member!.user.id) {
          await message.reply(
            `Sorry, this email has already been used by someone else! <@&${process.env.COMMITTEE_ROLE_ID}>`
          );
        } else {
          await verifyUser(message, collector);
        }
      } else {
        verifyUserInDb(message.member!.user.id, providedEmail);
        await verifyUser(message, collector);
      }
    } catch (e) {
      error(`verification collector: ${e}`);
    }
  });

  // At the end of the 30 days, close the verification process, kicking if unverified
  collector.on("end", async () => {
    cancelTimeout();
    clearInterval(reminderInterval);
    await closeVerification(tempChannel, member);
  });
}

/**
 * On successful verification, award the member role and delete the temporary channel
 * @param message - The Discord message containing the verified email
 * @param collector - The message collector that will be stopped
 */
async function verifyUser(message: Message, collector: MessageCollector) {
  try {
    // verifyUser is called from attachVerificationCollector which only listens for non-null message.member
    // messages. Errors are caught here anyway, so ! should be fine.
    await message.member!.roles.add(process.env.MEMBER_ROLE_ID!);
    await message.reply(
      "Verification successful! I will delete this channel in 10 seconds."
    );
  } catch (e) {
    error(`verifyUser: ${e}`);
  }
  await delay(10000);
  collector.stop();
}

/**
 * End the verification process by deleting the temporary channel and kicking the user if unverified
 * @param channel - The temporary channel used for verification
 * @param member - The user being verified
 */
export async function closeVerification(channel: Channel, member: GuildMember) {
  try {
    await channel.delete();
  } catch (e) {
    error(`closeVerification: Failed to delete channel: ${e}`);
  }
  if (!member.roles.cache.has(process.env.MEMBER_ROLE_ID!)) {
    try {
      await member.kick(
        "You have been a member of the server for thirty days, and haven't verified your membership yet, so you were kicked automatically. Feel free to rejoin using the link in the email!"
      );
    } catch (e) {
      error(`closeVerification: Failed to kick member: ${e}`);
    }
  }
}

/**
 * Determine if a user has selected a pronouns role
 * @param member - The user being verified
 * @param pronouns - An array of IDs of Discord roles representing pronouns
 * @returns Whether the user has selected a pronouns role
 */
function hasPronounsRole(member: GuildMember, pronouns: string[]) {
  return pronouns.some((pronounsRole: string) =>
    member.roles.cache.has(pronounsRole)
  );
}

/**
 * Determines if a user has posted a message in the last 100 messages in the welcome channel
 * @param member - The user being verified
 * @param channel - The welcome channel
 * @returns Whether the user has posted an introduction
 */
async function hasPostedIntroduction(
  member: GuildMember,
  channel: TextChannel
) {
  const messages = await channel.messages.fetch({ limit: 100 });
  return messages.some(
    (message: Message) => message.author.id === member.id
  );
}
