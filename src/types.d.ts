import type {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
} from "discord.js";

// Slash command
export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => void;
}

// Extension of the 'Client' object that allows for storing slash commands in a 'commands' property
export interface ClientWithCommands extends Client {
  commands?: Map<string, Command>;
}

// Object stored in secrets/verified-users.json
export interface VerifiedUser {
  userId: string;
  email: string;
}

// A message to be sent via gmail
export interface GmailMessage {
  to: string;
  subject: string;
  text: string;
}
