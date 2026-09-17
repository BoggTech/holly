import {
  generateVerificationCode,
  getVerificationCode,
} from "../user-validation/verification-database.js";
import { sendGmail } from "./send-gmail.js";

const DISCORD_INVITE_URL = process.env.DISCORD_INVITE_URL!;

const STARTER_EMAIL_SUBJECT =
  "Science Fiction & Fantasy Society Discord & Verification Code";

const VERIFICATION_EMAIL_SUBJECT =
  "Your Science Fiction & Fantasy Society Discord verification code";

const VERIFICATION_CODE_EXPIRY = "3 days";

export async function sendStarterEmail(recipientEmail: string): Promise<void> {
  generateVerificationCode(recipientEmail);
  const verificationCode = getVerificationCode(recipientEmail);

  if (!verificationCode) {
    throw new Error(
      `Failed to generate verification code for ${recipientEmail}`
    );
  }

  const text = `Hi!

If you're receiving this email, it means you recently signed up for DU Science Fiction & Fantasy Society. Thanks, and we really hope you enjoy what we have in store this year!

We have an active community over on Discord and, if you're interested, we'd love for you to join! 
${DISCORD_INVITE_URL}

If not, don't worry - joining our Discord server isn't required to participate in any events! You can find us elsewhere by following our Linktree:
https://linktr.ee/sfsoc

If you do join the Discord, follow these steps to verify your membership and get access to the full server:
 1. Navigate to the #verification channel.
 2. Click 'Enter Verification Code'.
 3. Enter the following code:

${verificationCode}

This code is tied to your email - do not share this code with anybody!
It will expire in ${VERIFICATION_CODE_EXPIRY} - but you can always request a new one with the 'Resend Verification Code' button in the #verification channel.

Hope to see you around The Bunker!

This is an automated email. You're receiving this because you recently purchased a DU Science Fiction & Fantasy membership under this email address.`;

  await sendGmail({
    to: recipientEmail,
    subject: STARTER_EMAIL_SUBJECT,
    text,
  });

  console.log("Send starter email");
}

export async function sendVerificationEmail(recipientEmail: string): Promise<void> {
  generateVerificationCode(recipientEmail);
  const verificationCode = getVerificationCode(recipientEmail);

  if (!verificationCode) {
    throw new Error(
      `Failed to generate verification code for ${recipientEmail}`
    );
  }

  const text = `Hi!

I'm here to deliver your requested verification code for the DU Science Fiction & Fantasy Society Discord.

As a reminder:
 1. Navigate to the #verification channel.
 2. Click 'Enter Verification Code'.
 3. Enter the following code:

${verificationCode}

This code is tied to your email - do not share this code with anybody!
It will expire in ${VERIFICATION_CODE_EXPIRY} - but you can always request a new one with the 'Resend Verification Code' button in the #verification channel.

This is an automated email. You're receiving this because a verification code was requested for this address from our discord server. If this wasn't you, you may safely ignore this email.`;

  await sendGmail({
    to: recipientEmail,
    subject: VERIFICATION_EMAIL_SUBJECT,
    text,
  });

  console.log("Sent verification email");
}