import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as readline from "node:readline";
import {
	DEFAULT_BASE_BRANCH,
	DEFAULT_CONFIG_FILENAME,
	DEFAULT_WORKTREES_DIR,
	type EdgeConfig,
} from "cyrus-core";
import { BaseCommand } from "./ICommand.js";
import { URL } from "node:url";

/**
 * Workspace credentials extracted from existing repository configurations
 */
interface WorkspaceCredentials {
	id: string;
	name: string;
	token: string;
	refreshToken?: string;
}

/**
 * Self-add-repo command - clones a repo and adds it to config.json
 *
 * Usage:
 *   cyrus self-add-repo                      # prompts for everything
 *   cyrus self-add-repo <url>                # prompts for workspace if multiple
 *   cyrus self-add-repo <url> <workspace>    # no prompts
 */
export class SelfAddRepoCommand extends BaseCommand {
	private rl: readline.Interface | null = null;

	private getReadline(): readline.Interface {
		if (!this.rl) {
			this.rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});
		}
		return this.rl;
	}

	private prompt(question: string): Promise<string> {
		return new Promise((resolve) => {
			this.getReadline().question(question, (answer) => resolve(answer.trim()));
		});
	}

	private cleanup(): void {
		if (this.rl) {
			this.rl.close();
			this.rl = null;
		}
	}

	async execute(args: string[]): Promise<void> {
		let url = args[0];
		const workspaceName = args[1];

		try {
			// Load config
			const configPath = resolve(this.app.cyrusHome, DEFAULT_CONFIG_FILENAME);
			let config: EdgeConfig;
			try {
				config = JSON.parse(readFileSync(configPath, "utf-8")) as EdgeConfig;
			} catch {
				this.logError(`Config file not found: ${configPath}`);
				process.exit(1);
			}

			if (!config.repositories) {
				config.repositories = [];
			}

			// Get URL if not provided
			if (!url) {
				url = await this.prompt("Repository URL: ");
				if (!url) {
					this.logError("URL is required");
					process.exit(1);
				}
			}

			// Extract repo name from URL
			const repoName = url
				.split("/")
				.pop()
				?.replace(/\.git$/, "");
			if (!repoName) {
				this.logError("Could not extract repo name from URL");
				process.exit(1);
			}

			// Check for duplicate
			if (config.repositories.some((r) => r.name === repoName)) {
				this.logError(`Repository '${repoName}' already exists in config`);
				process.exit(1);
			}

			// Find workspaces with Linear credentials
			const workspaces = new Map<string, WorkspaceCredentials>();

			// Add global credentials if available
			if (config.linearWorkspaceId && config.linearToken) {
				workspaces.set(config.linearWorkspaceId, {
					id: config.linearWorkspaceId,
					name: config.linearWorkspaceName || config.linearWorkspaceId,
					token: config.linearToken,
					refreshToken: config.linearRefreshToken,
				});
			}

			for (const repo of config.repositories) {
				if (
					repo.linearWorkspaceId &&
					repo.linearToken &&
					!workspaces.has(repo.linearWorkspaceId)
				) {
					workspaces.set(repo.linearWorkspaceId, {
						id: repo.linearWorkspaceId,
						name: repo.linearWorkspaceName || repo.linearWorkspaceId,
						token: repo.linearToken,
						refreshToken: repo.linearRefreshToken,
					});
				}
			}

			if (workspaces.size === 0) {
				this.logError(
					"No Linear credentials found. Run 'cyrus self-auth' first.",
				);
				process.exit(1);
			}

			// Get workspace
			let selectedWorkspace: WorkspaceCredentials;
			const workspaceList = Array.from(workspaces.values());

			if (workspaceList.length === 1) {
				// Safe: we checked length === 1 above
				selectedWorkspace = workspaceList[0]!;
			} else if (workspaceName) {
				const foundWorkspace = workspaceList.find(
					(w) => w.name === workspaceName,
				);
				if (!foundWorkspace) {
					this.logError(`Workspace '${workspaceName}' not found`);
					process.exit(1);
				}
				selectedWorkspace = foundWorkspace;
			} else {
				console.log("\nAvailable workspaces:");
				workspaceList.forEach((w, i) => {
					console.log(`  ${i + 1}. ${w.name}`);
				});
				const choice = await this.prompt(
					`Select workspace [1-${workspaceList.length}]: `,
				);
				const idx = parseInt(choice, 10) - 1;
				if (idx < 0 || idx >= workspaceList.length) {
					this.logError("Invalid selection");
					process.exit(1);
				}
				// Safe: we validated idx is within bounds above
				selectedWorkspace = workspaceList[idx]!;
			}

			// Clone the repo
			const repositoryPath = resolve(this.app.cyrusHome, "repos", repoName);

			if (existsSync(repositoryPath)) {
				console.log(`Repository already exists at ${repositoryPath}`);
			} else {
				console.log(`Cloning ${url}...`);

				let cloneUrl = url;
				// Sanitize token: remove whitespace and surrounding quotes
				const githubToken = process.env.GITHUB_TOKEN?.trim().replace(
					/^["']|["']$/g,
					"",
				);

				if (githubToken && url.startsWith("https://")) {
					try {
						const urlObj = new URL(url);
						if (
							(urlObj.hostname === "github.com" ||
								urlObj.hostname === "www.github.com") &&
							!urlObj.username &&
							!urlObj.password
						) {
							// Use token as username (works for PATs)
							urlObj.username = githubToken;
							cloneUrl = urlObj.toString();
							console.log(
								"Using GITHUB_TOKEN from environment for authentication.",
							);
						}
					} catch (e) {
						// Ignore invalid URLs
					}
				}

				try {
					execSync(`git clone ${cloneUrl} ${repositoryPath}`, {
						stdio: "inherit",
					});
				} catch {
					this.logError("Failed to clone repository");
					if (githubToken && cloneUrl !== url) {
						this.logError("\n❌ Authentication Failed using GITHUB_TOKEN.");
						this.logError("Possible causes:");
						this.logError(
							"1. Token is Fine-grained but not scoped to the Organization (common error).",
						);
						this.logError(
							"2. Token lacks 'repo' scope (Classic) or 'Contents' permission.",
						);
						this.logError(
							"3. Organization requires SAML SSO authorization for this token.",
						);
						this.logError(
							"Tip: Try using a Classic Personal Access Token (starts with 'ghp_') if unsure.",
						);
					}
					process.exit(1);
				}
			}

			// Generate UUID and add to config
			const id = randomUUID();
			
			// Detect git platform from URL (supports self-hosted GitLab)
			const gitPlatform: "github" | "gitlab" = url.toLowerCase().includes("gitlab") 
				? "gitlab" 
				: "github";

			config.repositories.push({
				id,
				name: repoName,
				repositoryPath,
				repositoryUrl: url,
				gitPlatform,
				baseBranch: DEFAULT_BASE_BRANCH,
				workspaceBaseDir: resolve(this.app.cyrusHome, DEFAULT_WORKTREES_DIR),
				linearWorkspaceId: selectedWorkspace.id,
				linearWorkspaceName: selectedWorkspace.name,
				linearToken: selectedWorkspace.token,
				linearRefreshToken: selectedWorkspace.refreshToken,
				isActive: true,
			});

			writeFileSync(configPath, JSON.stringify(config, null, "\t"), "utf-8");

			console.log(`\nAdded: ${repoName}`);
			console.log(`  ID: ${id}`);
			console.log(`  Platform: ${gitPlatform}`);
			console.log(`  Workspace: ${selectedWorkspace.name}`);
			process.exit(0);
		} finally {
			this.cleanup();
		}
	}
}
