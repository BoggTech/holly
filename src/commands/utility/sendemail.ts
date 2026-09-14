import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { sendGmail } from "../../features/email-validation/send-gmail.js";

export default {
  data: new SlashCommandBuilder()
    .setName("sendemail")
    .setDescription("Send a test email (committee only)")
    .addStringOption((option) =>
      option
        .setName("recipient")
        .setDescription("Email address to send to")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("subject")
        .setDescription("Email subject")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Email message")
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

    const recipient = interaction.options.getString("recipient", true);
    const subject = interaction.options.getString("subject", true);
    const message = interaction.options.getString("message", true);

    try {
      await sendGmail({
        to: recipient,
        subject,
        text: message,
      });

      await interaction.reply({
        content: `Email sent to \`${recipient}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Failed to send test email:", error);

      await interaction.reply({
        content: "Failed to send email.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};