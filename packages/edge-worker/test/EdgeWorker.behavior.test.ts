import { describe, expect, it, vi } from "vitest";
import { EdgeWorker } from "../src/EdgeWorker.js";
import { ProcedureAnalyzer } from "../src/procedures/ProcedureAnalyzer.js";
import type { EdgeWorkerConfig } from "cyrus-core";

describe("EdgeWorker Targeted Behavior Tests", () => {
	const mockConfig: EdgeWorkerConfig = {
		proxyUrl: "http://localhost:3000",
		cyrusHome: "/tmp/test-cyrus-home",
		repositories: [],
	};

	const edgeWorker = new EdgeWorker(mockConfig);

	describe("Model Selection (determineRunnerFromLabels)", () => {
		it("should default to Sonnet for planning tasks even with repo labels", () => {
			const selection = (edgeWorker as any).determineRunnerFromLabels(
				["some-repo"],
				"planning",
			);
			expect(selection.runnerType).toBe("claude");
			expect(selection.modelOverride).toBe("sonnet");
		});

		it("should use Gemini Flash for planning tasks if 'gemini' label is present", () => {
			const selection = (edgeWorker as any).determineRunnerFromLabels(
				["gemini", "some-repo"],
				"planning",
			);
			expect(selection.runnerType).toBe("gemini");
			expect(selection.modelOverride).toBe("gemini-2.5-flash");
		});

		it("should still use Opus if explicitly requested via label", () => {
			const selection = (edgeWorker as any).determineRunnerFromLabels(
				["opus", "some-repo"],
				"planning",
			);
			expect(selection.runnerType).toBe("claude");
			expect(selection.modelOverride).toBe("opus");
		});

		it("should default to Zhipu GLM-4.7 for planning tasks without specific runner labels", () => {
			const selection = (edgeWorker as any).determineRunnerFromLabels(
				[],
				"planning",
			);
			expect(selection.runnerType).toBe("zhipu");
			expect(selection.modelOverride).toBe("glm-4.7");
		});
	});

	describe("Ask Mode Routing (ProcedureAnalyzer)", () => {
		const analyzer = new ProcedureAnalyzer({
			cyrusHome: "/tmp/test-cyrus-home",
		});

		it("should detect @ask in labels", async () => {
			const decision = await analyzer.determineRoutine("Simple request", ["@ask"]);
			expect(decision.classification).toBe("planning");
			expect(decision.procedure.name).toBe("plan-mode");
		});

		it("should detect [ASK MODE] in labels", async () => {
			const decision = await analyzer.determineRoutine("Simple request", ["[ASK MODE]"]);
			expect(decision.classification).toBe("planning");
			expect(decision.procedure.name).toBe("plan-mode");
		});

		it("should detect @ask in text", async () => {
			const decision = await analyzer.determineRoutine("@ask How does this work?", []);
			expect(decision.classification).toBe("planning");
			expect(decision.procedure.name).toBe("plan-mode");
		});
	});
});
