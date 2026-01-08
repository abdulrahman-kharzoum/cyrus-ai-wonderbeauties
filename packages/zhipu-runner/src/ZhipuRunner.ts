import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import OpenAI from "openai";
import dotenv from "dotenv";
import type {
	IAgentRunner,
	IMessageFormatter,
	AgentMessage,
	AgentSessionInfo,
} from "cyrus-core";
import { ZhipuMessageFormatter } from "./formatter.js";
import type { ZhipuRunnerConfig, ZhipuRunnerEvents } from "./types.js";

export declare interface ZhipuRunner {
	on<K extends keyof ZhipuRunnerEvents>(
		event: K,
		listener: ZhipuRunnerEvents[K],
	): this;
	emit<K extends keyof ZhipuRunnerEvents>(
		event: K,
		...args: Parameters<ZhipuRunnerEvents[K]>
	): boolean;
}

/**
 * Zhipu AI Runner for Cyrus
 *
 * Implements IAgentRunner using Zhipu's OpenAI-compatible API.
 * This runner is designed for lightweight tasks like planning and simple questions.
 */
export class ZhipuRunner extends EventEmitter implements IAgentRunner {
	readonly supportsStreamingInput = false;

	private config: ZhipuRunnerConfig;
	private client: OpenAI;
	private messages: AgentMessage[] = [];
	private isRunningFlag = false;
	private formatter: IMessageFormatter;
	private sessionInfo: AgentSessionInfo | null = null;

	constructor(config: ZhipuRunnerConfig) {
		super();
		this.config = config;
		this.formatter = new ZhipuMessageFormatter();

		// Load environment variables from the repository .env file
		if (this.config.workingDirectory) {
			this.loadRepositoryEnv(this.config.workingDirectory);
		}

		const apiKey = config.apiKey || process.env.ZHIPU_API_KEY;
		if (!apiKey) {
			throw new Error("ZHIPU_API_KEY is required");
		}

		this.client = new OpenAI({
			apiKey: apiKey,
			baseURL: config.baseURL || "https://api.z.ai/v1",
		});

		if (this.config.onMessage) this.on("message", this.config.onMessage as any);
		if (this.config.onError) this.on("error", this.config.onError as any);
		if (this.config.onComplete) this.on("complete", this.config.onComplete as any);
	}

	async start(prompt: string): Promise<AgentSessionInfo> {
		if (this.isRunningFlag) {
			throw new Error("Session already running");
		}

		const sessionId = crypto.randomUUID();
		this.sessionInfo = {
			sessionId,
			startedAt: new Date(),
			isRunning: true,
		};
		this.isRunningFlag = true;
		this.messages = [];

		// Add initial system message if provided
		if (this.config.appendSystemPrompt) {
			const systemMsg: AgentMessage = {
				type: "system",
				subtype: "init",
				uuid: crypto.randomUUID(),
				session_id: sessionId,
				model: this.config.model || "glm-4.7",
				claude_code_version: "zhipu-adapter",
				cwd: this.config.workingDirectory || process.cwd(),
			} as any;
			this.emitMessage(systemMsg);
		}

		// Initial user message
		const userMsg: AgentMessage = {
			type: "user",
			message: {
				role: "user",
				content: prompt,
			},
			session_id: sessionId,
		} as any;
		this.emitMessage(userMsg);

		try {
			await this.runAgentLoop(sessionId);
		} catch (error) {
			console.error("[ZhipuRunner] Error in agent loop:", error);
			this.emit("error", error as Error);
		} finally {
			this.isRunningFlag = false;
			if (this.sessionInfo) this.sessionInfo.isRunning = false;
			this.emit("complete", this.messages);
		}

		return this.sessionInfo;
	}

	private async runAgentLoop(sessionId: string) {
		let turnCount = 0;
		const maxTurns = this.config.maxTurns || 10;

		const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

		// Add system prompt
		if (this.config.appendSystemPrompt) {
			openaiMessages.push({
				role: "system",
				content: this.config.appendSystemPrompt,
			});
		}

		// Add messages from history (mapping Assistant/User messages)
		for (const msg of this.messages) {
			if (msg.type === "user" && "message" in msg) {
				openaiMessages.push({
					role: "user",
					content: typeof msg.message.content === "string" ? msg.message.content : JSON.stringify(msg.message.content),
				});
			} else if (msg.type === "assistant" && "message" in msg) {
				// Handle tool calls in history if we want to be thorough, but for start it's simple
				openaiMessages.push({
					role: "assistant",
					content: typeof msg.message.content === "string" ? msg.message.content : JSON.stringify(msg.message.content),
				});
			}
		}

		while (this.isRunningFlag && turnCount < maxTurns) {
			turnCount++;

			// Call Zhipu AI
			// Note: GLM-4.7 "thinking" parameter is passed via model_extra or similar if available,
			// for now we use standard completion.
			const response = await this.client.chat.completions.create({
				model: this.config.model || "glm-4.7",
				messages: openaiMessages,
				temperature: 0.7,
				// @ts-ignore - "thinking" might not be in official types yet
				thinking: { type: "enabled" },
			});

			const choice = response.choices[0];
			if (!choice) break;

			const assistantMsg = choice.message;
			openaiMessages.push(assistantMsg);

			// Emit as Cyrus message
			const cyrusAssistantMsg: AgentMessage = {
				type: "assistant",
				uuid: crypto.randomUUID(),
				session_id: sessionId,
				message: {
					role: "assistant",
					content: [{ type: "text", text: assistantMsg.content || "" }],
				},
			} as any;
			this.emitMessage(cyrusAssistantMsg);

			// If no tool calls, we are done (for planning/simple tasks)
			if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
				// Emit result
				const resultMsg: AgentMessage = {
					type: "result",
					subtype: "success",
					uuid: crypto.randomUUID(),
					session_id: sessionId,
					is_error: false,
					result: assistantMsg.content || "",
					usage: {
						input_tokens: response.usage?.prompt_tokens || 0,
						output_tokens: response.usage?.completion_tokens || 0,
					},
				} as any;
				this.emitMessage(resultMsg);
				break;
			}

			// Handle tool calls (though mostly we expect text for planning)
			// For now, we'll just log and fail if a tool is requested but we don't have tool execution logic here
			// In a full implementation, we'd need to call the tools and append results.
			// Since Cyrus EdgeWorker handles tool execution for Claude, we might need to adapt.
			// However, for Ask Mode, we don't really expect complex tool use.
			console.log("[ZhipuRunner] Tool calls not yet implemented in this loop", assistantMsg.tool_calls);
			break;
		}
	}

	private emitMessage(message: AgentMessage) {
		this.messages.push(message);
		this.emit("message", message);
	}

	stop(): void {
		this.isRunningFlag = false;
	}

	isRunning(): boolean {
		return this.isRunningFlag;
	}

	getMessages(): AgentMessage[] {
		return [...this.messages];
	}

	getFormatter(): IMessageFormatter {
		return this.formatter;
	}

	/**
	 * Load environment variables from a .env file in the working directory
	 * Does not override existing process.env values
	 */
	private loadRepositoryEnv(workingDirectory: string): void {
		try {
			const envPath = join(workingDirectory, ".env");

			if (existsSync(envPath)) {
				// Load but don't override existing env vars
				const result = dotenv.config({
					path: envPath,
					override: false, // Existing process.env takes precedence
				});

				if (result.error) {
					console.warn(
						`[ZhipuRunner] Failed to parse .env file:`,
						result.error,
					);
				} else if (result.parsed && Object.keys(result.parsed).length > 0) {
					console.log(`[ZhipuRunner] Loaded environment variables from .env`);
				}
			}
		} catch (error) {
			console.warn(`[ZhipuRunner] Error loading repository .env:`, error);
		}
	}
}
