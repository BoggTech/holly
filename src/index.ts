import { exit } from "process";
import client from "./system/client.js";

export default (async () => {
  const requiredEnvVars = [
    "TOKEN",
    "CLIENT_ID",
    "GUILD_ID",
    "MEMBER_ROLE_ID",
    "COMMITTEE_ROLE_ID",
    "ERROR_CHANNEL_ID",
    "WELCOME_CHANNEL_ID",
    "WELCOME_CATEGORY_ID",
    "ROLES_CHANNEL_ID",
    "SIGNUP_SHEET_ID",
    "SIGNUP_SHEET_RANGE"
  ];

  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  if (missingEnvVars.length > 0) {
    console.error(`index.ts: Missing required environment variables: ${missingEnvVars.join(', ')}`);
    exit(1);
  }

  client.login(process.env.TOKEN);
})();
