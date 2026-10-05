import type { TextChannel } from "discord.js";
import client from "./client.js";

export default async function error(message: string) {
  console.error(message);

  const errorChannel = (await client.channels.fetch(
    process.env.ERROR_CHANNEL_ID!
  )) as TextChannel;

  errorChannel.send(`<@${process.env.COMMITTEE_ID}> **ERROR**: ${message}`);
}

// Report suspicious user behaviour to the error channel, without pinging anyone
export async function logSuspicious(message: string) {
  console.warn(message);

  const errorChannel = (await client.channels.fetch(
    process.env.ERROR_CHANNEL_ID!
  )) as TextChannel;

  errorChannel.send({
    content: `**SUSPICIOUS**: ${message}`,
    allowedMentions: { parse: [] },
  });
}
