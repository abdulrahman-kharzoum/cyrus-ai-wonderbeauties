# Git & GitLab Setup Guide

This guide explains how to set up GitLab CLI authentication for Cyrus to create branches, commits, and Merge Requests on GitLab repositories.

## Prerequisites

- **glab CLI** - GitLab CLI tool
- **Git** - Standard Git installation
- A GitLab account with repository access

## Step 1: Install glab CLI

**Windows (with Chocolatey):**
```powershell
choco install glab
```

**Windows (with Scoop):**
```powershell
scoop install glab
```

**macOS:**
```bash
brew install glab
```

**Linux (Debian/Ubuntu):**
```bash
# Add the GitLab package repository
curl -fsSL https://gitlab.com/gitlab-org/cli/-/raw/main/install.sh | sh
```

## Step 2: Authenticate glab

### For gitlab.com:
```bash
glab auth login
```

### For Self-Hosted GitLab (e.g., gitlab.yourdomain.com):
```bash
glab auth login --hostname gitlab.yourdomain.com
```

Follow the prompts to:
1. Choose authentication method (web browser or token)
2. For token auth: Generate a Personal Access Token at `https://your-gitlab//-/user_settings/personal_access_tokens`
   - Required scopes: `api`, `write_repository`

### Verify Authentication:
```bash
glab auth status
```

## Step 3: Configure Git Protocol

For HTTPS-based authentication (recommended for self-hosted):
```bash
glab config set -h gitlab.yourdomain.com git_protocol https
glab config set -h gitlab.yourdomain.com api_protocol https
```

## Step 4: Add Repository to Cyrus

Cyrus automatically detects GitLab URLs. Simply run:

```bash
cyrus self-add-repo https://gitlab.yourdomain.com/yourgroup/yourrepo.git
```

Cyrus will:
1. Detect that this is a GitLab repository
2. Clone it using `git clone` (which uses your glab credentials)
3. Set `gitPlatform: "gitlab"` in the config

## How It Works

When Cyrus works on a GitLab repository, it:
- Uses standard `git` commands for branches and commits (works with any Git host)
- Claude Code can use `glab mr create` for creating Merge Requests
- Your glab authentication is used for all GitLab API operations

## Troubleshooting

### "Authentication failed" errors
```bash
# Re-authenticate
glab auth login --hostname gitlab.yourdomain.com

# Verify
glab auth status
```

### SSL/TLS certificate issues with self-hosted GitLab
```bash
# If your GitLab uses a self-signed certificate
git config --global http.sslVerify false
```

### Permission denied errors
Ensure your Personal Access Token has these scopes:
- `api` - Full API access
- `write_repository` - Write access to repositories
