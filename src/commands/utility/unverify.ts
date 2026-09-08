import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  getVerifiedUsers,
  saveVerifiedUsers,
} from "../../features/user-validation/read-verified-users.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unverify")
    .setDescription("Revoke a user's verification (committee only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to unverify")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const invoker = interaction.member as GuildMember;
    if (!invoker.roles.cache.has(process.env.COMMITTEE_ROLE_ID)) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUser = interaction.options.getUser("user", true);

    let targetMember;
    try {
      targetMember = await interaction.guild!.members.fetch(targetUser.id);
    } catch {
      // User has left the server — still remove them from verified-users.json below
    }

    if (targetMember) {
      await targetMember.roles.remove(process.env.MEMBER_ROLE_ID);
    }

    const verifiedUsers = await getVerifiedUsers();
    const updatedUsers = verifiedUsers.filter(
      (user) => user.userId !== targetUser.id
    );
    saveVerifiedUsers(updatedUsers);

    await interaction.reply({
      content: `Successfully unverified <@${targetUser.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
