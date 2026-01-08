import { describe, expect, it, vi, beforeEach } from "vitest";
import { exec } from "node:child_process";
import { handleRepository } from "../../src/handlers/repository";

// Mock dependencies
vi.mock("node:child_process", () => ({
	exec: vi.fn((cmd, cb) => {
		if (cb) cb(null, { stdout: "", stderr: "" });
		return {} as any;
	}),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	rmSync: vi.fn(),
}));

describe("handleRepository", () => {
	const cyrusHome = "/mock/home/.cyrus";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should detect GitLab platform from gitlab.com URL", async () => {
		const payload = {
			repository_url: "https://gitlab.com/org/repo.git",
			repository_name: "repo",
		};

		await handleRepository(payload, cyrusHome);

		expect(exec).toHaveBeenCalledWith(
			expect.stringContaining("git clone"),
			expect.any(Function)
		);
		expect(exec).not.toHaveBeenCalledWith(
			expect.stringContaining("gh repo clone"),
			expect.any(Function)
		);
	});

	it("should detect GitLab platform from self-hosted GitLab URL", async () => {
		const payload = {
			repository_url: "https://gitlab.wonderbeauties.com/org/repo.git",
			repository_name: "repo",
		};

		await handleRepository(payload, cyrusHome);

		expect(exec).toHaveBeenCalledWith(
			expect.stringContaining("git clone"),
			expect.any(Function)
		);
	});

	it("should default to GitHub for github.com URL", async () => {
		const payload = {
			repository_url: "https://github.com/org/repo.git",
			repository_name: "repo",
		};

		await handleRepository(payload, cyrusHome);

		expect(exec).toHaveBeenCalledWith(
			expect.stringContaining("gh repo clone"),
			expect.any(Function)
		);
	});

	it("should respect explicit gitPlatform in payload", async () => {
		const payload = {
			repository_url: "https://custom-git.com/org/repo.git",
			repository_name: "repo",
			gitPlatform: "gitlab" as const,
		};

		await handleRepository(payload, cyrusHome);

		expect(exec).toHaveBeenCalledWith(
			expect.stringContaining("git clone"),
			expect.any(Function)
		);
	});
});
