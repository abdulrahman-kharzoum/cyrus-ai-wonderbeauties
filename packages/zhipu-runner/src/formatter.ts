import type { IMessageFormatter } from "cyrus-core";

/**
 * Zhipu Message Formatter
 *
 * Implements message formatting for Zhipu AI tool messages.
 */
export class ZhipuMessageFormatter implements IMessageFormatter {
	formatTodoWriteParameter(jsonContent: string): string {
		try {
			const data = JSON.parse(jsonContent);
			if (!data.todos || !Array.isArray(data.todos)) {
				return jsonContent;
			}

			const todos = data.todos as Array<{
				id: string;
				content: string;
				status: string;
				priority: string;
			}>;

			let formatted = "\n";
			todos.forEach((todo, index) => {
				let statusEmoji = "";
				if (todo.status === "completed") {
					statusEmoji = "✅ ";
				} else if (todo.status === "in_progress") {
					statusEmoji = "🔄 ";
				} else if (todo.status === "pending") {
					statusEmoji = "⏳ ";
				}

				formatted += `${statusEmoji}${todo.content}`;
				if (index < todos.length - 1) {
					formatted += "\n";
				}
			});

			return formatted;
		} catch (error) {
			return jsonContent;
		}
	}

	formatToolParameter(toolName: string, toolInput: any): string {
		if (typeof toolInput === "string") {
			return toolInput;
		}

		try {
			switch (toolName) {
				case "Bash":
					return toolInput.command || JSON.stringify(toolInput);
				case "Read":
				case "Edit":
				case "Write":
					return toolInput.file_path || JSON.stringify(toolInput);
				case "Grep":
				case "Glob":
					return toolInput.pattern || JSON.stringify(toolInput);
				case "WebFetch":
					return toolInput.url || JSON.stringify(toolInput);
				case "WebSearch":
					return toolInput.query || JSON.stringify(toolInput);
				default:
					return JSON.stringify(toolInput);
			}
		} catch (error) {
			return JSON.stringify(toolInput);
		}
	}

	formatToolActionName(
		toolName: string,
		toolInput: any,
		isError: boolean,
	): string {
		if (
			(toolName === "Bash" || toolName === "↪ Bash") &&
			toolInput?.description
		) {
			const baseName = isError ? `${toolName} (Error)` : toolName;
			return `${baseName} (${toolInput.description})`;
		}
		return isError ? `${toolName} (Error)` : toolName;
	}

	formatToolResult(
		toolName: string,
		toolInput: any,
		result: string,
		isError: boolean,
	): string {
		if (isError) {
			return `\`\`\`\n${result}\n\`\`\``;
		}

		try {
			switch (toolName) {
				case "Bash": {
					let formatted = "";
					if (toolInput.command && !toolInput.description) {
						formatted += `\`\`\`bash\n${toolInput.command}\n\`\`\`\n\n`;
					}
					if (result?.trim()) {
						formatted += `\`\`\`\n${result}\n\`\`\``;
					} else {
						formatted += "*No output*";
					}
					return formatted;
				}
				case "Read":
					if (result?.trim()) {
						let lang = "";
						if (toolInput.file_path) {
							const ext = toolInput.file_path.split(".").pop()?.toLowerCase();
							const langMap: Record<string, string> = {
								ts: "typescript",
								tsx: "typescript",
								js: "javascript",
								py: "python",
								sh: "bash",
								json: "json",
								md: "markdown",
							};
							lang = langMap[ext || ""] || "";
						}
						return `\`\`\`${lang}\n${result}\n\`\`\``;
					}
					return "*Empty file*";
				default:
					if (result?.trim()) {
						if (result.includes("\n") && result.length > 100) {
							return `\`\`\`\n${result}\n\`\`\``;
						}
						return result;
					}
					return "*Completed*";
			}
		} catch (error) {
			return result || "";
		}
	}
}
