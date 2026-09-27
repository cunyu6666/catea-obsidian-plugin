/**
 * [WHO]: parseLlmJson, extractLlmJsonText
 * [FROM]: No internal dependencies; uses JSON.parse and balanced-brace scanning
 * [TO]: Consumed by mem-core LLM extraction, consolidation, insights, and extension diagnostics
 * [HERE]: packages/mem-core/src/llm-json.ts - tolerant JSON boundary normalizer for structured LLM responses
 */

export function parseLlmJson<T>(raw: string): T {
	const text = extractLlmJsonText(raw);
	return JSON.parse(text) as T;
}

export function extractLlmJsonText(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) throw new SyntaxError("LLM returned empty output");

	for (const fenced of extractFencedJsonCandidates(trimmed)) {
		if (canParseJson(fenced)) return fenced.trim();
	}

	if (canParseJson(trimmed)) return trimmed;

	const balanced = extractFirstBalancedJson(trimmed);
	if (balanced) return balanced;

	// Last resort: try to repair truncated JSON (common with smaller models hitting token limits)
	const repaired = repairTruncatedJson(trimmed);
	if (repaired) return repaired;

	return trimmed;
}

export function hasParseableLlmJson(raw: string): boolean {
	try {
		parseLlmJson<unknown>(raw);
		return true;
	} catch {
		return false;
	}
}

function extractFencedJsonCandidates(value: string): string[] {
	const candidates: string[] = [];
	const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
	for (const match of value.matchAll(fencePattern)) {
		if (typeof match[1] === "string") candidates.push(match[1]);
	}
	return candidates;
}

function canParseJson(value: string): boolean {
	try {
		JSON.parse(value.trim());
		return true;
	} catch {
		return false;
	}
}

function extractFirstBalancedJson(value: string): string | undefined {
	for (let start = 0; start < value.length; start++) {
		const first = value[start];
		if (first !== "{" && first !== "[") continue;

		const closeForOpen = new Map<string, string>([
			["{", "}"],
			["[", "]"],
		]);
		const stack: string[] = [closeForOpen.get(first)!];
		let inString = false;
		let escaped = false;

		for (let index = start + 1; index < value.length; index++) {
			const ch = value[index]!;
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (ch === "\\") {
					escaped = true;
				} else if (ch === "\"") {
					inString = false;
				}
				continue;
			}

			if (ch === "\"") {
				inString = true;
				continue;
			}

			const close = closeForOpen.get(ch);
			if (close) {
				stack.push(close);
				continue;
			}

			if (ch === stack[stack.length - 1]) {
				stack.pop();
				if (stack.length === 0) {
					const candidate = value.slice(start, index + 1).trim();
					if (canParseJson(candidate)) return candidate;
					break;
				}
			}
		}
	}
	return undefined;
}

/**
 * Attempt to repair truncated JSON by closing open braces/brackets and
 * terminating unterminated strings. Common with smaller models that hit
 * token limits mid-JSON output.
 */
function repairTruncatedJson(value: string): string | undefined {
	// Find the start of JSON
	const jsonStart = findJsonStart(value);
	if (jsonStart < 0) return undefined;

	let s = value.slice(jsonStart);
	if (s.length < 2) return undefined;

	// Track state
	const stack: string[] = [];
	let inString = false;
	let escaped = false;
	let lastKeyEnd = -1; // track if we're mid-value (after a colon)

	for (let i = 0; i < s.length; i++) {
		const ch = s[i]!;
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === "\"") {
				inString = false;
			}
			continue;
		}

		if (ch === "\"") {
			inString = true;
			continue;
		}

		if (ch === "{") { stack.push("}"); continue; }
		if (ch === "[") { stack.push("]"); continue; }
		if (ch === ":") { lastKeyEnd = i; continue; }

		if ((ch === "}" || ch === "]") && stack.length > 0 && stack[stack.length - 1] === ch) {
			stack.pop();
		}
	}

	// Nothing open — not truncated
	if (!inString && stack.length === 0) return undefined;

	// Build repair suffix
	let repair = "";

	// Close unterminated string
	if (inString) {
		// Escape any trailing backslash
		if (escaped) repair += "\\";
		repair += '"';
	}

	// If we were mid-value (after colon), add a null placeholder
	if (lastKeyEnd >= 0) {
		// Check if there's anything after the last colon that looks like a value
		const afterColon = s.slice(lastKeyEnd + 1).trim();
		if (!afterColon || afterColon === '"' || afterColon === "null") {
			repair += "null";
		}
	}

	// Close all open structures
	while (stack.length > 0) {
		repair += stack.pop();
	}

	const candidate = s + repair;
	return canParseJson(candidate) ? candidate : undefined;
}

/** Find the index of the first { or [ that starts a JSON value, skipping noise. */
function findJsonStart(value: string): number {
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (ch === "{" || ch === "[") return i;
	}
	return -1;
}
