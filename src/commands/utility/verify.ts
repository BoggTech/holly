import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  clearVerificationInfo,
  getVerifiedUserByEmail,
  verifyUserInDb,
  isUserVerified
} from "../../features/user-validation/verification-database.js";
import {
  validateVerificationCode,
} from "../../features/user-validation/verification-code.js";

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
    )
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("The user's verification code (optional)")
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
    const providedEmail = interaction.options
      .getString("email")
      ?.trim()
      .toLowerCase();
    const code = interaction.options
      .getString("code")
      ?.trim();

    if (!providedEmail && !code) {
      await interaction.reply({
        content: "You must provide either an email address or a verification code.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetMember = await interaction.guild!.members.fetch(targetUser.id);

    if (isUserVerified(targetUser.id)) {
      await interaction.reply({
        content: `<@${targetUser.id}> is already verified. Please unverify them first.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let email = providedEmail;

    if (code) {
      const result = validateVerificationCode(code);

      if (result.status === "invalid") {
        await interaction.reply({
          content: "That verification code was not recognized.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (result.status === "expired") {
        await interaction.reply({
          content: [
            "That verification code is expired.",
          ].join("\n"),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (email && email !== result.email) {
        await interaction.reply({
          content:
            `The supplied email address does not match the email associated with verification code '${code}'.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      email = result.email;
    }

    if (email) {
      const user = getVerifiedUserByEmail(email);
      if (user) {
        await interaction.reply({
          content: `Email '${email}' already associated with user <@${user.userId}>!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      verifyUserInDb(targetUser.id, email);
      clearVerificationInfo(email);
    }

    await targetMember.roles.add(process.env.MEMBER_ROLE_ID!);

    await interaction.reply({
      content: `Successfully verified <@${targetUser.id}>${email ? ` with email ${email}` : ""}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
