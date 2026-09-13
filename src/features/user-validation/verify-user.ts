import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type Interaction,
  type Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  clearVerificationInfo,
  getEmailByVerificationCode,
  getVerifiedUserByEmail,
  getVerificationGeneratedAt,
  isMemberEmail,
  isUserVerified,
  verifyUserInDb,
} from "./verification-database.js";
import { sendVerificationEmail } from "../email-validation/send-gmail.js";
import error from "../../system/error.js";

const PRONOUNS_ROLES_PATH = join(
  process.cwd(),
  "/secrets/pronouns-roles.json"
);

const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID!;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID!;
const ROLES_CHANNEL_ID = process.env.ROLES_CHANNEL_ID!;
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID!;
const COMMITTEE_ROLE_ID = process.env.COMMITTEE_ROLE_ID!;

const VERIFY_BUTTON_ID = "verification:verify-code";
const SEND_CODE_BUTTON_ID = "verification:send-code";

const VERIFY_MODAL_ID = "verification:code-modal";
const SEND_CODE_MODAL_ID = "verification:send-code-modal";

const CODE_INPUT_ID = "verification:code";
const EMAIL_INPUT_ID = "verification:email";

const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000;
const VERIFICATION_USER_COOLDOWN_MS = 5 * 60 * 1000;
const verificationCooldowns = new Map<string, number>();

/**
 * Ensure the persistent verification message exists.
 *
 * This should be called once when the bot starts.
 */
export async function setupVerificationMessage(client: Client) {
  const channel = await client.channels.fetch(VERIFICATION_CHANNEL_ID);

  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(
      `VERIFICATION_CHANNEL_ID (${VERIFICATION_CHANNEL_ID}) is not a text channel`
    );
  }

  const messages = await channel.messages.fetch({ limit: 100 });

  const existingMessage = messages.find((message) =>
    message.components
      .filter((component) => component.type === ComponentType.ActionRow)
      .some((row) =>
        row.components.some(
          (component) =>
            component.type === ComponentType.Button &&
            (
              component.customId === VERIFY_BUTTON_ID ||
              component.customId === SEND_CODE_BUTTON_ID
            )
        )
      )
  );

  if (existingMessage) {
    return;
  }

  await channel.send({
    content: `## Society Membership Verification

Welcome! To access the rest of the server, please complete the following steps:

1. Choose your **pronouns** in <#${ROLES_CHANNEL_ID}>.
2. Change your server **nickname** to your name. You can do this by clicking the drop-down menu at the top left of this server and choosing *Edit Server Profile*.
3. **Introduce yourself** in <#${WELCOME_CHANNEL_ID}>. Tell us what you study and what parts of the society interest you!
4. Once you've completed those steps, use the buttons below to link your TCD email to your Discord account.

You only need to complete this process once.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(VERIFY_BUTTON_ID)
          .setLabel("Enter Verification Code")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(SEND_CODE_BUTTON_ID)
          .setLabel("Send Verification Code")
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  });
}

/**
 * Handle verification buttons and modals.
 *
 * Call this from the bot's interactionCreate handler.
 */
export async function handleVerificationInteraction(interaction: Interaction) {
  if (interaction.isButton()) {
    switch (interaction.customId) {
      case VERIFY_BUTTON_ID:
        await handleVerifyButton(interaction);
        return;

      case SEND_CODE_BUTTON_ID:
        await handleSendCodeButton(interaction);
        return;
    }
  }

  if (interaction.isModalSubmit()) {
    switch (interaction.customId) {
      case VERIFY_MODAL_ID:
        await handleCodeSubmission(interaction);
        return;

      case SEND_CODE_MODAL_ID:
        await handleSendCodeSubmission(interaction);
        return;
    }
  }
}

async function handleVerifyButton(interaction: ButtonInteraction) {
  const member = interaction.member as GuildMember;

  if (
    await rejectIfAlreadyVerified(interaction, member) ||
    await rejectIfMissingVerificationSteps(interaction, member, "verifying")
  ) {
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(VERIFY_MODAL_ID)
    .setTitle("Enter Verification Code");

  const codeInput = new TextInputBuilder()
    .setCustomId(CODE_INPUT_ID)
    .setLabel("Verification code")
    .setPlaceholder("123456")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput)
  );

  await interaction.showModal(modal);
}

async function handleSendCodeButton(interaction: ButtonInteraction) {
  const member = interaction.member as GuildMember;

  if (
    await rejectIfAlreadyVerified(interaction, member) ||
    await rejectIfMissingVerificationSteps(interaction, member, "requesting a new verification code")
  ) {
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(SEND_CODE_MODAL_ID)
    .setTitle("Send Verification Code");

  const emailInput = new TextInputBuilder()
    .setCustomId(EMAIL_INPUT_ID)
    .setLabel("TCD email address")
    .setPlaceholder("jcrowley@tcd.ie")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput)
  );

  await interaction.showModal(modal);
}

async function rejectIfAlreadyVerified(interaction: ButtonInteraction, member: GuildMember): Promise<boolean> {
  if (!isUserVerified(member.id)) {
    return false;
  }

  await interaction.reply({
    content:
      `You are already verified. If you believe this is a mistake, please contact <@&${COMMITTEE_ROLE_ID}>.`,
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

async function rejectIfMissingVerificationSteps(interaction: ButtonInteraction, member: GuildMember, action: string): Promise<boolean> {
  const missingSteps = await getMissingVerificationSteps(member);

  if (missingSteps.length === 0) {
    return false;
  }

  await interaction.reply({
    content: [
      `Hey <@${member.id}>! You need to complete the following steps before ${action}:`,
      "",
      ...missingSteps.map((step) => `- ${step}`),
      "",
      "Once you've completed those steps, come back here and try again!",
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

async function handleSendCodeSubmission(interaction: ModalSubmitInteraction) {
  const providedEmail = interaction.fields
    .getTextInputValue(EMAIL_INPUT_ID)
    .trim()
    .toLowerCase();

  try {
    const member = interaction.member as GuildMember;
    const cooldownUntil = verificationCooldowns.get(member.id);

    if (cooldownUntil !== undefined && Date.now() < cooldownUntil) {
      const discordTimestamp = Math.floor(cooldownUntil / 1000);

      await interaction.reply({
        content:
          `You've recently requested a verification code. You can request another one <t:${discordTimestamp}:R>.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const emailHasBoughtMembership = isMemberEmail(providedEmail);

    if (!emailHasBoughtMembership) {
      await interaction.reply({
        content: [
          "Sorry, we couldn't find that email address in our membership records.",
          "",
          "Please make sure you're using the TCD email address you used when signing up.",
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await sendVerificationEmail(providedEmail);

    verificationCooldowns.set(
      member.id,
      Date.now() + VERIFICATION_USER_COOLDOWN_MS
    );

    await interaction.reply({
      content:
        "We've sent a new verification code to your TCD email address.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    error(`send verification email: ${e}`);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "Sorry, something went wrong while sending your verification code. Please try again in a moment.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

async function handleCodeSubmission(interaction: ModalSubmitInteraction) {
  const member = interaction.member as GuildMember;

  const code = interaction.fields
    .getTextInputValue(CODE_INPUT_ID)
    .trim();

  try {
    const email = getEmailByVerificationCode(code);

    if (!email) {
      await interaction.reply({
        content: [
          "Sorry, we didn't recognize that verification code.",
          "",
          "Double check you inputted it correctly, or try sending a new one.",
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const generatedAt = getVerificationGeneratedAt(email);

    if (
      generatedAt === undefined ||
      Date.now() - generatedAt > VERIFICATION_CODE_EXPIRY_MS
    ) {
      await interaction.reply({
        content: [
          "This verification code is expired.",
          "",
          "Please send a new verification code and try again.",
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      });

      clearVerificationInfo(email);
      return;
    }

    const existingUser = getVerifiedUserByEmail(email);

    if (existingUser && existingUser.userId !== member.id) {
      await interaction.reply({
        content: [
          "Sorry, that email address has already been used by another Discord account.",
          "",
          `If this is your email address, please contact <@&${COMMITTEE_ROLE_ID}>.`,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    verifyUserInDb(member.id, email);
    clearVerificationInfo(email);

    await member.roles.add(MEMBER_ROLE_ID);

    await interaction.reply({
      content:
        "Verification successful! 🎉 You now have access to the rest of the server.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    error(`verification code submission: ${e}`);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "Sorry, something went wrong while checking your verification code. Please try again in a moment.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

async function getMissingVerificationSteps(member: GuildMember) {
  const missingSteps: string[] = [];

  const pronouns = JSON.parse(
    (await readFile(PRONOUNS_ROLES_PATH)).toString()
  ) as string[];

  if (!hasPronounsRole(member, pronouns)) {
    missingSteps.push(
      `Select your pronouns in <#${ROLES_CHANNEL_ID}>.`
    );
  }

  const welcomeChannel = member.guild.channels.cache.get(
    WELCOME_CHANNEL_ID
  );

  if (
    !welcomeChannel ||
    welcomeChannel.type !== ChannelType.GuildText
  ) {
    throw new Error(
      `Welcome channel ${WELCOME_CHANNEL_ID} could not be found`
    );
  }

  if (!(await hasPostedIntroduction(member, welcomeChannel))) {
    missingSteps.push(
      `Send your introduction in <#${WELCOME_CHANNEL_ID}>.`
    );
  }

  return missingSteps;
}

function hasPronounsRole(member: GuildMember, pronouns: string[]) {
  return pronouns.some((roleId) =>
    member.roles.cache.has(roleId)
  );
}

async function hasPostedIntroduction(member: GuildMember, channel: TextChannel) {
  const messages = await channel.messages.fetch({ limit: 100 });

  return messages.some(
    (message: Message) => message.author.id === member.id
  );
}