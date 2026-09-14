import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  syncSheetAndDb
} from "../../features/user-validation/verification-database.js";

export default {
  data: new SlashCommandBuilder()
    .setName("forcesync")
    .setDescription("Force sync to membership spreadsheet (committee only)"),
  async execute(interaction: ChatInputCommandInteraction) {
    const invoker = interaction.member as GuildMember;
    if (!invoker.roles.cache.has(process.env.COMMITTEE_ROLE_ID!)) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    syncSheetAndDb();

    await interaction.reply({
      content: 'Sheet was synced.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
