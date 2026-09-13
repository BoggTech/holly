import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
} from "discord.js";
import type { ClientWithCommands } from "../types.js";
import { deployCommands, readCommands } from "./commands.js";
import {
  handleVerificationInteraction,
  setupVerificationMessage,
} from "../features/user-validation/verify-user.js";
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

// Handle Discord interactions
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Verification buttons/modals
  if (
    (interaction.isButton() &&
      (
        interaction.customId === "verification:verify-code" ||
        interaction.customId === "verification:send-code"
      )) ||
    (interaction.isModalSubmit() &&
      (
        interaction.customId === "verification:code-modal" ||
        interaction.customId === "verification:send-code-modal"
      ))
  ) {
    try {
      await handleVerificationInteraction(interaction);
    } catch (e) {
      error(`verification interaction: ${e}`);
    }

    return;
  }

  // Slash commands
  if (!interaction.isChatInputCommand()) return;

  const client: ClientWithCommands = interaction.client;

  if (!client.commands) {
    error("commandHandler: client.commands does not exist");
    return;
  }

  const command = client.commands.get(interaction.commandName);

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

// Print a short message once our bot has logged in and set up the persistent verification message.
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}.`);

  try {
    await setupVerificationMessage(readyClient);
  } catch (e) {
    error(`Verification setup: ${e}`);
  }
});

export default client;