import { ChannelType, Client, Events, type GuildMember, GatewayIntentBits, Interaction, type TextChannel } from "discord.js";
import type { ClientWithCommands } from "../types.js";
import { deployCommands, readCommands } from "./commands.js";
import startVerification, { attachVerificationCollector, closeVerification, VERIFICATION_PERIOD_MS } from "../features/user-validation/verify-user.js";
import error from "./error.js";

/**
 * The object we use to connect to our running Discord bot
 */
const client: ClientWithCommands = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Read commands from the 'commands' directory into the 'commands' property on the client
client.commands = await readCommands();
// Deploy these commands to our Discord bot so users can run them
await deployCommands(client);

// When a user runs a slash command, process it here
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const client: ClientWithCommands = interaction.client;

  // This means you forgot to do 'client.commands = await readCommands()'
  if (!client.commands) {
    error("commandHandler: client.commands does not exist");
    return;
  }

  const command = client.commands.get(interaction.commandName);

  // This means you deleted a command but haven't run 'deployCommands(client)' since
  if (!command) {
    error("commandHandler: triggered command does not exist");
    return;
  }

  try {
    await command.execute(interaction);
  } catch (e) {
    error(`commandHandler: ${e}`);
  }
});

// When a user joins, start the verification flow
client.on(Events.GuildMemberAdd, async (member: GuildMember) => startVerification(member));

// Print a short message once our bot has logged in, then recover any in-progress verifications
client.once(Events.ClientReady, async (readyClient: ClientWithCommands) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}.`);

  try {
    const guild = readyClient.guilds.cache.get(process.env.GUILD_ID!);
    if (!guild) return;

    const welcomeChannel = guild.channels.cache.get(
      process.env.WELCOME_CHANNEL_ID!
    ) as TextChannel;
    if (!welcomeChannel) return;

    // Find all text channels in the welcome category that match the "welcome-*" naming pattern
    const verificationChannels = guild.channels.cache.filter(
      (channel) =>
        channel.parentId === process.env.WELCOME_CATEGORY_ID &&
        channel.name.startsWith("welcome-") &&
        channel.id !== process.env.WELCOME_CHANNEL_ID &&
        channel.type === ChannelType.GuildText
    );

    if (verificationChannels.size === 0) return;

    const members = await guild.members.fetch();

    for (const [, channel] of verificationChannels) {
      const textChannel = channel as TextChannel;
      const username = textChannel.name.replace("welcome-", "");

      const member = members.find((m) => m.user.username === username);
      if (!member) {
        console.log(
          `Recovery: Could not find member for channel ${textChannel.name}, skipping.`
        );
        continue;
      }

      // If already verified, clean up the stale channel
      if (member.roles.cache.has(process.env.MEMBER_ROLE_ID!)) {
        console.log(
          `Recovery: ${username} already verified, deleting stale channel.`
        );
        try {
          await textChannel.delete();
        } catch (e) {
          error(
            `Recovery: Failed to delete stale channel ${textChannel.name}: ${e}`
          );
        }
        continue;
      }

      // If the channel is past the 30-day limit, close verification now
      const elapsedMs = Date.now() - textChannel.createdTimestamp;
      if (elapsedMs >= VERIFICATION_PERIOD_MS) {
        console.log(
          `Recovery: Verification window expired for ${username}, closing.`
        );
        await closeVerification(textChannel, member);
        continue;
      }

      console.log(
        `Recovery: Re-attaching verification collector for ${username}.`
      );
      attachVerificationCollector(
        textChannel,
        welcomeChannel,
        member,
        VERIFICATION_PERIOD_MS - elapsedMs
      );
    }
  } catch (e) {
    error(`Recovery: ${e}`);
  }
});

export default client;
