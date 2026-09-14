import { readFileSync } from "node:fs";
import { join } from "node:path";
import { google } from "googleapis";

const TOKEN_PATH = join(process.cwd(), "secrets/google-token.json");
const EMAIL_SEND_DELAY_MS = 200;

interface GmailMessage {
  to: string;
  subject: string;
  text: string;
}

const queue: {
  message: GmailMessage;
  resolve: () => void;
  reject: (error: unknown) => void;
}[] = [];

let processingQueue = false;

async function sendGmailNow(message: GmailMessage): Promise<void> {
  const credentials = JSON.parse(readFileSync(TOKEN_PATH).toString());
  const auth = google.auth.fromJSON(credentials);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gmail = google.gmail({ version: "v1", auth: auth as any });

  const raw = Buffer.from([
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    message.text,
  ].join("\r\n")).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

async function processQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;

  try {
    while (queue.length > 0) {
      const item = queue.shift()!;

      try {
        await sendGmailNow(item.message);
        item.resolve();
      } catch (error) {
        item.reject(error);
      }

      // Only send emails every few ms to avoid spam
      if (queue.length > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, EMAIL_SEND_DELAY_MS)
        );
      }
    }
  } finally {
    processingQueue = false;
  }
}

export function sendGmail(message: GmailMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({ message, resolve, reject });
    void processQueue();
  });
}