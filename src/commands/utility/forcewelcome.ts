import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  sendStarterEmail
} from "../../features/email-validation/send-verification-email.js"

export default {
  data: new SlashCommandBuilder()
    .setName("forcewelcome")
    .setDescription("Force send a welcome email (committee only)")
    .addStringOption((option) =>
      option
        .setName("email")
        .setDescription("The email address")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const invoker = interaction.member as GuildMember;
    if (!invoker.roles.cache.has(process.env.COMMITTEE_ROLE_ID!)) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const providedEmail = interaction.options.getString("email");
      await sendStarterEmail(providedEmail!);
    } catch (e) {
      console.error(`force send welcome email: ${e}`);
      await interaction.reply({
        content: 
            `Error sending welcome email: ${e instanceof Error ? e.message : "Unknown error"}` +
            '\nAre you sure this email is on the registrations list?',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: "Sent.",
      flags: MessageFlags.Ephemeral,
    });
  },
};