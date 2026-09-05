import os

# Define the configuration files to create
config_files = [
    "secrets/.env",
    "secrets/google-credentials.json",
    "secrets/pronouns-roles.json",
    "secrets/verified-users.json"
]

# Placeholder content for each configuration file
config_content = {
    "secrets/.env": """
# .env configuration file

TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
MEMBER_ROLE_ID=your_member_role_id_here
COMMITEE_ROLE_ID=your_committee_role_id_here
ERROR_CHANNEL_ID=your_error_channel_id_here
WELCOME_CHANNEL_ID=your_welcome_channel_id_here
WELCOME_CATEGORY_ID=your_welcome_category_id_here
ROLES_CHANNEL_ID=your_roles_channel_id_here
SIGNUP_SHEET_ID=your_signup_sheet_id_here
SIGNUP_SHEET_RANGE=your_signup_sheet_range_here
""",
    "secrets/google-credentials.json": """
{
  "installed": {
    "client_id": "your_client_id_here",
    "project_id": "your_project_id_here",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "your_client_secret_here",
    "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"]
  }
}
""",
    "secrets/pronouns-roles.json": """
[
  "role_id_for_he_him",
  "role_id_for_she_her",
  "role_id_for_they_them"
]
""",
    "secrets/verified-users.json": """
[]
"""
}

# Function to create configuration files
def create_config_files(config_files, config_content):
    for file_path in config_files:        
        # Ensure the directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Create the configuration file if it doesn't exist
        if not os.path.exists(file_path):
            with open(file_path, 'w') as f:
                f.write(config_content[file_path].strip())
            print(f"Created configuration file: {file_path}")
        else:
            print(f"Configuration file already exists: {file_path}")

# Create configuration files
create_config_files(config_files, config_content)