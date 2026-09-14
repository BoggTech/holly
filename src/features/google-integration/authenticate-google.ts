import { google } from "googleapis";
import { join } from "node:path";
import { promises as fs } from "fs";
import { createServer } from "http"
import open from 'open';

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/gmail.send"
];
const TOKEN_PATH = join(process.cwd(), "secrets", "google-token.json");
const CREDENTIALS_PATH = join(process.cwd(), "secrets", "google-credentials.json");

async function authorize() {
  try {
    // Load client secrets from a local file.
    const content = await fs.readFile(CREDENTIALS_PATH);
    const credentials = JSON.parse(content.toString());

    // Create an OAuth2 client with the loaded credentials.
    const client = new google.auth.OAuth2(
      credentials.installed.client_id,
      credentials.installed.client_secret,
      credentials.installed.redirect_uris[0]
    );

    // Generate a URL that asks for the user's consent.
    const authorizeUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: "consent",
      scope: SCOPES.join(' '),
    });

    console.log('Opening browser to authenticate...');
    console.log("If this doesn't happen, open the following url manually:")
    console.log(authorizeUrl)
    await open(authorizeUrl);

    // Get the user's authorization code.
    const code = await new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        if (req.url != undefined && req.url.startsWith('/auth')) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const code = url.searchParams.get('code');
          server.close()
          if (code) {
            res.end('Authentication successful! You can close this window.');
            resolve(code);
          } else {
            res.end('Authentication failed!');
            reject(new Error('Authentication failed'));
          }
        }
      });

      server.listen(3000, () => {
        console.log('Temporary server is running on port 3000. Please authorize the application.');
      });
    });

    // Exchange the authorization code for an access token.
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Save the token to disk for later use.
    const tokenPayload = JSON.stringify({
      type: "authorized_user",
      client_id: credentials.installed.client_id,
      client_secret: credentials.installed.client_secret,
      refresh_token: tokens.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, tokenPayload);
    console.log('Token stored to', TOKEN_PATH);
  } catch (error) {
    console.error('Error during authentication:', error);
  }
}

authorize().catch(console.error);