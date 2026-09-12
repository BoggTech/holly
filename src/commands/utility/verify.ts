import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  verifyUserInDb,
} from "../../features/user-validation/verification-database.js";

export default {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Manually verify a user (committee only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to verify")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("email")
        .setDescription("The user's email address (optional)")
        .setRequired(false)
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

    const targetUser = interaction.options.getUser("user", true);
    const email = interaction.options.getString("email");
    const targetMember = await interaction.guild!.members.fetch(targetUser.id);

    await targetMember.roles.add(process.env.MEMBER_ROLE_ID!);

    if (email) {
      verifyUserInDb(targetUser.id, email);
    }

    await interaction.reply({
      content: `Successfully verified <@${targetUser.id}>${email ? ` with email ${email}` : ""}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
