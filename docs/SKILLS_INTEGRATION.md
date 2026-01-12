# Skills Integration Guide

This guide explains how to configure Cyrus to use the **n8n** and **Supabase** skills.

## 1. Environment Variables

Add the following keys to your repository's `.env` file (located at the root of your repository, e.g., `.env`).

### n8n Configuration
Required for the `n8n-mcp` server to connect to your n8n instance.

```bash
# n8n API Configuration
N8N_API_URL="https://your-n8n-instance.com"
N8N_API_KEY="your-api-key-here"
```

### Supabase Configuration
Required for the Supabase skills to interact with your database.

```bash
# Supabase Configuration
SUPABASE_URL="https://your-project.supabase.co"
# Use the 'service_role' key for admin tasks (be careful!) or 'anon' key for public access testing
SUPABASE_KEY="your-service-role-key-or-anon-key"
```

## 2. MCP Configuration

### n8n MCP Server
The n8n skills require the `n8n-mcp` server to be running. Add this to your `.mcp.json` (or create it if it doesn't exist in your repository root).

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["-y", "n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "${N8N_API_URL}",
        "N8N_API_KEY": "${N8N_API_KEY}"
      }
    }
  }
}
```

*Note: The `${VAR}` syntax allows the MCP server to inherit values from your `.env` file when running via Cyrus.*

### Supabase
The Supabase skills provided uses direct HTTP API calls via `curl` and does not require a separate MCP server. The agent will use the `Bash` tool to execute these requests using a helper script.

## 3. Usage

Once configured, you can trigger these modes using Linear labels or prompt keywords (after the integration implementation is complete).

*   **n8n Mode**: Triggered by label `n8n` or keyword "n8n".
*   **Supabase Mode**: Triggered by label `supabase` or keyword "supabase".