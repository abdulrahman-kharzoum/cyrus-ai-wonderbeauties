# Cyrus Server Update Commands

Run these commands in the project root on your server to apply all recent stability fixes (GitLab hardening, worktree verification, and dynamic branching fixes).

### 1. Update & Install Dependencies
Ensure you have the latest code and all required packages.
```bash
# Pull latest changes (if using git)
git pull

# Install dependencies
pnpm install
```

### 2. Build the Core Packages
The core logic and the agent's prompts need to be compiled.
```bash
# Build core packages (required for the logic changes)
pnpm --filter cyrus-core build
pnpm --filter cyrus-edge-worker build

# Alternatively, build the entire project (except GUI)
pnpm build
```

### 3. Update the Global 'cyrus' Command
If you want the `cyrus` command to point to the freshly built code:
```bash
cd apps/cli
pnpm link --global
```

### 4. Restart the Service
Finally, restart the running process.

**If using systemd (recommended):**
```bash
sudo systemctl restart cyrus-ai
```

**If using pm2:**
```bash
pm2 restart cyrus
```

**If running manually via CLI:**
Stop the process (Ctrl+C) and run:
```bash
cyrus
```

---
**Note**: All your configuration (Linear tokens, repo settings) is stored in `~/.cyrus/`, so rebuilding the code will NOT lose your settings.
