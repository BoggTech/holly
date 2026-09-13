import {
  generateVerificationCode,
  getVerificationCode
} from "../../features/user-validation/verification-database.js";

export async function sendStarterEmail(recipientEmail: string) {
    // This is a dummy command for now
    generateVerificationCode(recipientEmail);
    const verificationCode = getVerificationCode(recipientEmail);
    console.log(`Sent STARTER to ${recipientEmail}: ${verificationCode}`);
}

export async function sendVerificationEmail(recipientEmail: string) {
    // This is a dummy command for now
    generateVerificationCode(recipientEmail);
    const verificationCode = getVerificationCode(recipientEmail);
    console.log(`Sent VERIF to ${recipientEmail}: ${verificationCode}`);
}