import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
    getEmails
} from "../../features/user-validation/read-google-sheet.js";

export default {
  data: new SlashCommandBuilder()
    .setName("email")
    .setDescription("Check if an email is in the signups list (committee only)")
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

    const providedEmail = interaction.options.getString("email");
    const emails = await getEmails()

    let content = `Email '${providedEmail}'`
    if (emails.some((email) => email.toLowerCase() === providedEmail)) {
        content = `${content} is signed up.`
    } else {
        content = `${content} is not signed up.`
    }

    await interaction.reply({
      content: content,
      flags: MessageFlags.Ephemeral,
    });
  },
};
