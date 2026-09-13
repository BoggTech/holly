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
import { getEmails } from "./read-google-sheet.js";
import {
  getVerifiedUserByEmail,
  verifyUserInDb,
} from "./verification-database.js";
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

const VERIFY_BUTTON_ID = "verification:verify-email";
const VERIFY_MODAL_ID = "verification:email-modal";
const EMAIL_INPUT_ID = "verification:email";

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
            component.customId === VERIFY_BUTTON_ID
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
3. **Introduce yourself** in <#${WELCOME_CHANNEL_ID}>. Tell us what you study and what parts of the society interest you.
4. Once you've completed those steps, click the button below and enter your **TCD email**.

You only need to complete this process once.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(VERIFY_BUTTON_ID)
          .setLabel("Verify Email")
          .setStyle(ButtonStyle.Primary)
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
  if (interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID) {
    await handleVerifyButton(interaction);
    return;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId === VERIFY_MODAL_ID
  ) {
    await handleEmailSubmission(interaction);
  }
}

async function handleVerifyButton(interaction: ButtonInteraction) {
  const member = interaction.member as GuildMember;
  const missingSteps = await getMissingVerificationSteps(member);

  if (missingSteps.length > 0) {
    await interaction.reply({
      content: [
        `Hey <@${member.id}>! You need to complete the following steps before verifying your email:`,
        "",
        ...missingSteps.map((step) => `- ${step}`),
        "",
        "Once you've completed those steps, come back here and press the button again!",
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(VERIFY_MODAL_ID)
    .setTitle("Verify TCD Membership");

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

async function handleEmailSubmission(interaction: ModalSubmitInteraction) {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: "Sorry, I couldn't find your server membership.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member as GuildMember;

  const providedEmail = interaction.fields
    .getTextInputValue(EMAIL_INPUT_ID).trim().toLowerCase();

  try {
    const emails = await getEmails();

    const emailIsValid = emails.some(
      (email) => email.toLowerCase() === providedEmail
    );

    if (!emailIsValid) {
      await interaction.reply({
        content: [
          `Hey <@${member.id}>! We didn't recognize the email address '${providedEmail}'.`,
          "",
          "Please make sure you're entering the TCD email address you used when signing up.",
          "",
          "If you signed up recently, please wait up to 30 minutes before trying again - it can take a little while for the CSC to update our records.",
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const existingUser = getVerifiedUserByEmail(providedEmail);

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

    if (!existingUser) {
      verifyUserInDb(member.id, providedEmail);
    }

    await member.roles.add(MEMBER_ROLE_ID);

    await interaction.reply({
      content:
        "Verification successful! 🎉 You now have access to the rest of the server.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (e) {
    error(`verification email submission: ${e}`);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "Sorry, something went wrong while checking your email. Please try again in a moment.",
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
