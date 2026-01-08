import type { AgentRunnerConfig, SDKMessage } from "cyrus-core";

export interface ZhipuRunnerConfig extends AgentRunnerConfig {
	apiKey?: string;
	baseURL?: string;
	model?: string;
}

export interface ZhipuRunnerEvents {
	message: (message: SDKMessage) => void;
	error: (error: Error) => void;
	complete: (messages: SDKMessage[]) => void;
}

export interface ZhipuSessionInfo {
	sessionId: string | null;
	startedAt: Date;
	isRunning: boolean;
}
