import { execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import type { Issue, RepositoryConfig, Workspace } from "cyrus-core";

/**
 * Logger interface for GitService
 * Allows consumers to provide their own logging implementation
 */
export interface GitServiceLogger {
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
}

/**
 * Default console-based logger implementation
 */
const defaultLogger: GitServiceLogger = {
	info: (message: string, ...args: unknown[]) =>
		console.log(`[GitService] ${message}`, ...args),
	warn: (message: string, ...args: unknown[]) =>
		console.warn(`[GitService] ${message}`, ...args),
	error: (message: string, ...args: unknown[]) =>
		console.error(`[GitService] ${message}`, ...args),
};

/**
 * Service responsible for Git worktree operations
 */
export class GitService {
	private logger: GitServiceLogger;

	constructor(logger?: GitServiceLogger) {
		this.logger = logger ?? defaultLogger;
	}
	/**
	 * Check if a branch exists locally or remotely
	 */
	async branchExists(branchName: string, repoPath: string): Promise<boolean> {
		try {
			// Check if branch exists locally
			execSync(`git rev-parse --verify "${branchName}"`, {
				cwd: repoPath,
				stdio: "pipe",
			});
			return true;
		} catch {
			// Branch doesn't exist locally, check remote
			try {
				const remoteOutput = execSync(
					`git ls-remote --heads origin "${branchName}"`,
					{
						cwd: repoPath,
						stdio: "pipe",
					},
				);
				// Check if output is non-empty (branch actually exists on remote)
				return remoteOutput && remoteOutput.toString().trim().length > 0;
			} catch {
				return false;
			}
		}
	}

	/**
	 * Sanitize branch name by removing backticks to prevent command injection
	 */
	public sanitizeBranchName(name: string): string {
		return name ? name.replace(/`/g, "") : name;
	}

	/**
	 * Run a setup script with proper error handling and logging
	 */
	private async runSetupScript(
		scriptPath: string,
		scriptType: "global" | "repository",
		workspacePath: string,
		issue: Issue,
	): Promise<void> {
		// Expand ~ to home directory
		const expandedPath = scriptPath.replace(/^~/, homedir());

		// Check if script exists
		if (!existsSync(expandedPath)) {
			this.logger.warn(
				`⚠️  ${scriptType === "global" ? "Global" : "Repository"} setup script not found: ${scriptPath}`,
			);
			return;
		}

		// Check if script is executable (Unix only)
		if (process.platform !== "win32") {
			try {
				const stats = statSync(expandedPath);
				// Check if file has execute permission for the owner
				if (!(stats.mode & 0o100)) {
					this.logger.warn(
						`⚠️  ${scriptType === "global" ? "Global" : "Repository"} setup script is not executable: ${scriptPath}`,
					);
					this.logger.warn(`   Run: chmod +x "${expandedPath}"`);
					return;
				}
			} catch (error) {
				this.logger.warn(
					`⚠️  Cannot check permissions for ${scriptType} setup script: ${(error as Error).message}`,
				);
				return;
			}
		}

		const scriptName = basename(expandedPath);
		this.logger.info(`ℹ️  Running ${scriptType} setup script: ${scriptName}`);

		try {
			// Determine the command based on the script extension and platform
			let command: string;
			const isWindows = process.platform === "win32";

			if (scriptPath.endsWith(".ps1")) {
				command = `powershell -ExecutionPolicy Bypass -File "${expandedPath}"`;
			} else if (scriptPath.endsWith(".cmd") || scriptPath.endsWith(".bat")) {
				command = `"${expandedPath}"`;
			} else if (isWindows) {
				// On Windows, try to run with bash if available (Git Bash/WSL)
				command = `bash "${expandedPath}"`;
			} else {
				// On Unix, run directly with bash
				command = `bash "${expandedPath}"`;
			}

			execSync(command, {
				cwd: workspacePath,
				stdio: "inherit",
				env: {
					...process.env,
					LINEAR_ISSUE_ID: issue.id,
					LINEAR_ISSUE_IDENTIFIER: issue.identifier,
					LINEAR_ISSUE_TITLE: issue.title || "",
				},
				timeout: 5 * 60 * 1000, // 5 minute timeout
			});

			this.logger.info(
				`✅ ${scriptType === "global" ? "Global" : "Repository"} setup script completed successfully`,
			);
		} catch (error) {
			const errorMessage =
				(error as any).signal === "SIGTERM"
					? "Script execution timed out (exceeded 5 minutes)"
					: (error as Error).message;

			this.logger.error(
				`❌ ${scriptType === "global" ? "Global" : "Repository"} setup script failed: ${errorMessage}`,
			);

			// Log stderr if available
			if ((error as any).stderr) {
				this.logger.error("   stderr:", (error as any).stderr.toString());
			}

			// Continue execution despite setup script failure
			this.logger.info(`   Continuing with worktree creation...`);
		}
	}

	/**
	 * Create a git worktree for an issue
	 */
	async createGitWorktree(
		issue: Issue,
		repository: RepositoryConfig,
		globalSetupScript?: string,
	): Promise<Workspace> {
		try {
			// Verify this is a git repository
			try {
				execSync("git rev-parse --git-dir", {
					cwd: repository.repositoryPath,
					stdio: "pipe",
				});
			} catch (_e) {
				this.logger.error(
					`${repository.repositoryPath} is not a git repository`,
				);
				throw new Error("Not a git repository");
			}

			// Use Linear's preferred branch name, or generate one if not available
			const rawBranchName =
				issue.branchName ||
				`${issue.identifier}-${issue.title
					?.toLowerCase()
					.replace(/\s+/g, "-")
					.substring(0, 30)}`;
			const branchName = this.sanitizeBranchName(rawBranchName);
			const workspacePath = join(repository.workspaceBaseDir, issue.identifier);

			// Ensure workspace directory exists
			mkdirSync(repository.workspaceBaseDir, { recursive: true });

			// Check if worktree already exists
			let worktrees = "";
			try {
				worktrees = execSync("git worktree list --porcelain", {
					cwd: repository.repositoryPath,
					encoding: "utf-8",
				});

				if (worktrees.includes(workspacePath)) {
					this.logger.info(
						`Worktree already exists at ${workspacePath}, ensuring it is fresh...`,
					);
					// Fetch and reset to ensure freshness if it's an existing worktree
					try {
						execSync(`git fetch origin`, { cwd: workspacePath, stdio: "pipe" });
						// We don't know the intended base branch yet, so we'll do this after determining it
					} catch (e) {
						this.logger.warn(`Initial fetch failed: ${(e as Error).message}`);
					}
				}
			} catch (_e) {
				// git worktree command failed, continue with creation
			}

			// Check if branch already exists
			let createBranch = true;
			try {
				execSync(`git rev-parse --verify "${branchName}"`, {
					cwd: repository.repositoryPath,
					stdio: "pipe",
				});
				createBranch = false;
			} catch (_e) {
				// Branch doesn't exist, we'll create it
			}

			// Determine base branch for this issue
			// Logic:
			// 1. Use repository.baseBranch if configured
			// 2. Default to "staging" if not configured
			// 3. Fallback priority: Configured -> staging -> main
			let candidateBranch = repository.baseBranch || "staging";
			let baseBranch = candidateBranch;
			
			// Check if the candidate branch exists
			const candidateExists = await this.branchExists(
				candidateBranch,
				repository.repositoryPath,
			);

			if (!candidateExists) {
				this.logger.warn(
					`Configured/Default branch '${candidateBranch}' not found.`,
				);
				
				// If we haven't tried 'staging' yet (i.e., config was something else), try it now
				if (candidateBranch !== "staging") {
					const stagingExists = await this.branchExists(
						"staging",
						repository.repositoryPath,
					);
					if (stagingExists) {
						this.logger.info("Falling back to 'staging' branch.");
						baseBranch = "staging";
					} else {
						this.logger.info("'staging' branch not found, falling back to 'main'.");
						baseBranch = "main";
					}
				} else {
					// We already tried staging and it failed, so fallback to main
					this.logger.info("'staging' branch not found, falling back to 'main'.");
					baseBranch = "main";
				}
			}

			this.logger.info(
				`Using base branch '${baseBranch}' for issue ${issue.identifier}`,
			);

			// Fetch latest changes from remote
			this.logger.info("Fetching latest changes from remote...");
			let hasRemote = true;
			try {
				execSync("git fetch origin", {
					cwd: repository.repositoryPath,
					stdio: "pipe",
				});
			} catch (e) {
				this.logger.warn(
					"Warning: git fetch failed, proceeding with local branch:",
					(e as Error).message,
				);
				hasRemote = false;
			}

			// Create the worktree - use determined base branch
			let worktreeCmd: string;
			if (createBranch) {
				if (hasRemote) {
					// Check if the base branch exists remotely
					let useRemoteBranch = false;
					try {
						const remoteOutput = execSync(
							`git ls-remote --heads origin "${baseBranch}"`,
							{
								cwd: repository.repositoryPath,
								stdio: "pipe",
							},
						);
						// Check if output is non-empty (branch actually exists on remote)
						useRemoteBranch =
							remoteOutput && remoteOutput.toString().trim().length > 0;
						if (!useRemoteBranch) {
							this.logger.info(
								`Base branch '${baseBranch}' not found on remote, checking locally...`,
							);
						}
					} catch {
						// Base branch doesn't exist remotely, use local or fall back to default
						this.logger.info(
							`Base branch '${baseBranch}' not found on remote, checking locally...`,
						);
					}

					if (useRemoteBranch) {
						// Use remote version of base branch
						const remoteBranch = `origin/${baseBranch}`;
						this.logger.info(
							`Creating git worktree at ${workspacePath} from ${remoteBranch}`,
						);
						worktreeCmd = `git worktree add "${workspacePath}" -b "${branchName}" "${remoteBranch}"`;
					} else {
						// Check if base branch exists locally
						try {
							execSync(`git rev-parse --verify "${baseBranch}"`, {
								cwd: repository.repositoryPath,
								stdio: "pipe",
							});
							// Use local base branch
							this.logger.info(
								`Creating git worktree at ${workspacePath} from local ${baseBranch}`,
							);
							worktreeCmd = `git worktree add "${workspacePath}" -b "${branchName}" "${baseBranch}"`;
						} catch {
							// Base branch doesn't exist locally either, fall back to remote default
							this.logger.info(
								`Base branch '${baseBranch}' not found locally, falling back to remote ${repository.baseBranch || "staging"}`,
							);
							const defaultRemoteBranch = `origin/${repository.baseBranch || "staging"}`;
							worktreeCmd = `git worktree add "${workspacePath}" -b "${branchName}" "${defaultRemoteBranch}"`;
						}
					}
				} else {
					// No remote, use local branch
					this.logger.info(
						`Creating git worktree at ${workspacePath} from local ${baseBranch}`,
					);
					worktreeCmd = `git worktree add "${workspacePath}" -b "${branchName}" "${baseBranch}"`;
				}
			} else {
				// Branch already exists, just check it out
				this.logger.info(
					`Creating git worktree at ${workspacePath} with existing branch ${branchName}`,
				);
				worktreeCmd = `git worktree add "${workspacePath}" "${branchName}"`;
			}

			if (worktreeCmd !== "") {
				execSync(worktreeCmd, {
					cwd: repository.repositoryPath,
					stdio: "pipe",
				});
			}

			// Check if we need to refresh an existing worktree (we skipped return earlier)
			const isExistingWorktree = worktrees.includes(workspacePath);
			if (isExistingWorktree) {
				this.logger.info(`Refreshing existing worktree at ${workspacePath}...`);
				try {
					execSync(`git fetch origin`, { cwd: workspacePath, stdio: "pipe" });
					// Try to reset to origin/baseBranch if possible, or just pull
					try {
						execSync(`git reset --hard "origin/${baseBranch}"`, {
							cwd: workspacePath,
							stdio: "pipe",
						});
					} catch (e) {
						this.logger.warn(
							`Could not reset to origin/${baseBranch}, just pulling: ${(e as Error).message}`,
						);
						execSync(`git pull origin "${baseBranch}"`, {
							cwd: workspacePath,
							stdio: "pipe",
						});
					}
				} catch (e) {
					this.logger.warn(`Failed to refresh worktree: ${(e as Error).message}`);
				}
			} else {
				// New worktree - creation already handled above
			}

			// Verify worktree population - fixing the "empty worktree" bug
			const files = readdirSync(workspacePath);
			// Stricter check: Ignore metadata files like .git and README
			const hasFiles = files.some(
				(f) =>
					f !== ".git" &&
					f.toLowerCase() !== "readme.md" &&
					f.toLowerCase() !== "readme" &&
					f.toLowerCase() !== "license",
			);
			if (!hasFiles) {
				this.logger.warn(
					`Worktree created at ${workspacePath} appears empty (no substantial project files found). Attempting explicit checkout...`,
				);
				try {
					// Force checkout of the base branch into the current directory
					// We use -- . to checkout all files from the commit
					execSync(`git checkout -f "${baseBranch}" -- .`, {
						cwd: workspacePath,
						stdio: "pipe",
					});

					// Re-verify
					const filesAfter = readdirSync(workspacePath);
					const hasFilesAfter = filesAfter.some(
						(f) =>
							f !== ".git" &&
							f.toLowerCase() !== "readme.md" &&
							f.toLowerCase() !== "readme" &&
							f.toLowerCase() !== "license",
					);
					if (!hasFilesAfter) {
						throw new Error(
							`Worktree remains empty after checkout attempt from ${baseBranch}`,
						);
					}
					this.logger.info("Explicit checkout populated the worktree.");
				} catch (checkoutError) {
					this.logger.error(
						"Failed to populate worktree:",
						(checkoutError as Error).message,
					);
					throw new Error("Failed to populate worktree files");
				}
			}

			// First, run the global setup script if configured
			if (globalSetupScript) {
				await this.runSetupScript(
					globalSetupScript,
					"global",
					workspacePath,
					issue,
				);
			}

			// Then, check for repository setup scripts (cross-platform)
			const isWindows = process.platform === "win32";
			const setupScripts = [
				{
					file: "cyrus-setup.sh",
					platform: "unix",
				},
				{
					file: "cyrus-setup.ps1",
					platform: "windows",
				},
				{
					file: "cyrus-setup.cmd",
					platform: "windows",
				},
				{
					file: "cyrus-setup.bat",
					platform: "windows",
				},
			];

			// Find the first available setup script for the current platform
			const availableScript = setupScripts.find((script) => {
				const scriptPath = join(repository.repositoryPath, script.file);
				const isCompatible = isWindows
					? script.platform === "windows"
					: script.platform === "unix";
				return existsSync(scriptPath) && isCompatible;
			});

			// Fallback: on Windows, try bash if no Windows scripts found (for Git Bash/WSL users)
			const fallbackScript =
				!availableScript && isWindows
					? setupScripts.find((script) => {
							const scriptPath = join(repository.repositoryPath, script.file);
							return script.platform === "unix" && existsSync(scriptPath);
						})
					: null;

			const scriptToRun = availableScript || fallbackScript;

			if (scriptToRun) {
				const scriptPath = join(repository.repositoryPath, scriptToRun.file);
				await this.runSetupScript(
					scriptPath,
					"repository",
					workspacePath,
					issue,
				);
			}

			return {
				path: workspacePath,
				isGitWorktree: true,
				baseBranch: baseBranch,
			};
		} catch (error) {
			this.logger.error(
				"Failed to create git worktree:",
				(error as Error).message,
			);
			// Fall back to regular directory if git worktree fails
			const fallbackPath = join(repository.workspaceBaseDir, issue.identifier);
			mkdirSync(fallbackPath, { recursive: true });
			return {
				path: fallbackPath,
				isGitWorktree: false,
			};
		}
	}
}
