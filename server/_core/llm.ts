import type { Content, Part, Tool as GeminiTool } from "@google/genai";
import { createGeminiClient, GEMINI_STANDARD_MODEL } from "../gemini";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[],
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const assertApiKey = () => {
  if (!ENV.geminiApiKey.trim()) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
};

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function toGeminiPart(part: MessageContent): Promise<Part> {
  if (typeof part === "string") {
    return { text: part };
  }
  if (part.type === "text") {
    return { text: part.text };
  }
  if (part.type === "image_url") {
    const inline = parseDataUrl(part.image_url.url);
    if (inline) {
      return { inlineData: inline };
    }
    const resp = await fetch(part.image_url.url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch image (${resp.status})`);
    }
    const mimeType = resp.headers.get("content-type") || "image/png";
    const data = Buffer.from(await resp.arrayBuffer()).toString("base64");
    return { inlineData: { mimeType, data } };
  }
  if (part.type === "file_url") {
    const inline = parseDataUrl(part.file_url.url);
    if (inline) {
      return { inlineData: inline };
    }
    const resp = await fetch(part.file_url.url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch file (${resp.status})`);
    }
    const mimeType = part.file_url.mime_type || resp.headers.get("content-type") || "application/octet-stream";
    const data = Buffer.from(await resp.arrayBuffer()).toString("base64");
    return { inlineData: { mimeType, data } };
  }
  throw new Error("Unsupported message content part");
}

const RETRY_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 10_000;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }
  return false;
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }
      const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      await sleep(cap / 2 + Math.random() * (cap / 2));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    maxTokens,
    max_tokens,
  } = params;

  const systemParts: string[] = [];
  const contents: Content[] = [];

  for (const msg of messages) {
    const items = ensureArray(msg.content);
    if (msg.role === "system") {
      for (const item of items) {
        systemParts.push(typeof item === "string" ? item : item.type === "text" ? item.text : JSON.stringify(item));
      }
      continue;
    }

    const parts: Part[] = [];
    for (const item of items) {
      parts.push(await toGeminiPart(item));
    }

    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  const explicitFormat = responseFormat || response_format;
  const schemaWrapper = outputSchema || output_schema;

  const config: Record<string, unknown> = {};
  if (systemParts.length > 0) {
    config.systemInstruction = systemParts.join("\n\n");
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    config.maxOutputTokens = resolvedMaxTokens;
  }

  if (explicitFormat?.type === "json_object") {
    config.responseMimeType = "application/json";
  } else if (explicitFormat?.type === "json_schema" && explicitFormat.json_schema?.schema) {
    config.responseMimeType = "application/json";
    config.responseJsonSchema = explicitFormat.json_schema.schema;
  } else if (schemaWrapper?.schema) {
    config.responseMimeType = "application/json";
    config.responseJsonSchema = schemaWrapper.schema;
  }

  if (tools && tools.length > 0) {
    const geminiTools: GeminiTool[] = [
      {
        functionDeclarations: tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parametersJsonSchema: tool.function.parameters,
        })),
      },
    ];
    config.tools = geminiTools;
  }

  const resolvedModel = model || GEMINI_STANDARD_MODEL;
  const ai = createGeminiClient();
  const response = await withBackoff(() =>
    ai.models.generateContent({
      model: resolvedModel,
      contents,
      config,
    }),
  );

  const toolCalls: ToolCall[] = (response.functionCalls ?? []).map((call, idx) => ({
    id: call.id || `call_${idx + 1}`,
    type: "function",
    function: {
      name: call.name || "",
      arguments: JSON.stringify(call.args ?? {}),
    },
  }));

  const usage = response.usageMetadata;

  return {
    id: response.responseId || `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: response.text ?? "",
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    ...(usage
      ? {
          usage: {
            prompt_tokens: usage.promptTokenCount ?? 0,
            completion_tokens: usage.candidatesTokenCount ?? 0,
            total_tokens: usage.totalTokenCount ?? 0,
          },
        }
      : {}),
  };
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();

  const ai = createGeminiClient();
  const pager = await ai.models.list();
  const data: ModelInfo[] = [];

  for await (const model of pager) {
    if (!model.name) continue;
    data.push({
      id: model.name.replace(/^models\//, ""),
      object: "model",
      created: 0,
      owned_by: "google",
    });
  }

  return {
    object: "list",
    data,
  };
}
