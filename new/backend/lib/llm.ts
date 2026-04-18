import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { z } from "zod";

import { env } from "../config/env.js";
import {
  appendAgentTranscript,
  type AgentTraceContext
} from "./agent-transcript.js";

type StructuredCallOptions<TSchema extends z.ZodTypeAny> = {
  systemPrompt: string;
  userPrompt: string;
  schema: TSchema;
  fallback: () => Promise<z.infer<TSchema>> | z.infer<TSchema>;
  trace?: AgentTraceContext;
};

type TextCallOptions = {
  systemPrompt: string;
  userPrompt: string;
  fallback: () => Promise<string> | string;
  trace?: AgentTraceContext;
};

function createChatModel(): ChatOpenAI {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY nao configurada.");
  }

  return new ChatOpenAI({
    apiKey: env.openaiApiKey,
    model: env.openaiModel,
    temperature: 0.1,
    maxRetries: 2
  });
}

function coerceMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

export function isOpenAIConfigured(): boolean {
  return Boolean(env.openaiApiKey) && env.openaiEnabled && env.nodeEnv !== "test";
}

export async function invokeStructuredWithFallback<TSchema extends z.ZodTypeAny>({
  systemPrompt,
  userPrompt,
  schema,
  fallback,
  trace
}: StructuredCallOptions<TSchema>): Promise<z.infer<TSchema>> {
  if (!isOpenAIConfigured()) {
    const fallbackResult = await fallback();
    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "fallback",
        input: {
          mode: "structured"
        },
        output: fallbackResult,
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          fallbackReason: "OPENAI_API_KEY nao configurada."
        }
      });
    }
    return fallbackResult;
  }

  try {
    const model = createChatModel().withStructuredOutput(schema);
    const result = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);

    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "llm_success",
        input: {
          mode: "structured"
        },
        output: result,
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          modelOutput: result
        }
      });
    }

    return result;
  } catch (error) {
    const fallbackResult = await fallback();
    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "fallback",
        input: {
          mode: "structured"
        },
        output: fallbackResult,
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          fallbackReason: "Falha na chamada LLM; usando fallback deterministico.",
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido."
        }
      });
    }
    return fallbackResult;
  }
}

export async function invokeTextWithFallback({
  systemPrompt,
  userPrompt,
  fallback,
  trace
}: TextCallOptions): Promise<string> {
  if (!isOpenAIConfigured()) {
    const fallbackText = await fallback();
    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "fallback",
        input: {
          mode: "text"
        },
        output: fallbackText,
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          fallbackReason: "OPENAI_API_KEY nao configurada."
        }
      });
    }
    return fallbackText;
  }

  try {
    const model = createChatModel();
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);
    const text = coerceMessageText(response.content);

    if (text) {
      if (trace) {
        await appendAgentTranscript({
          ...trace,
          phase: "llm",
          status: "llm_success",
          input: {
            mode: "text"
          },
          output: text,
          discussion: {
            provider: "openai",
            model: env.openaiModel,
            systemPrompt,
            userPrompt,
            modelOutput: text
          }
        });
      }

      return text;
    }

    const fallbackText = await fallback();
    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "fallback",
        input: {
          mode: "text"
        },
        output: fallbackText,
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          fallbackReason: "Resposta vazia do modelo; usando fallback deterministico."
        }
      });
    }
    return fallbackText;
  } catch (error) {
    const fallbackText = await fallback();
    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "fallback",
        input: {
          mode: "text"
        },
        output: fallbackText,
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          fallbackReason: "Falha na chamada LLM; usando fallback deterministico.",
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido."
        }
      });
    }
    return fallbackText;
  }
}

type ToolCallingOptions = {
  systemPrompt: string;
  userPrompt: string;
  tools: StructuredToolInterface[];
  fallback: () => Promise<AIMessage> | AIMessage;
  trace?: AgentTraceContext;
};

export type ExecutedToolCall = {
  id: string;
  name: string;
  args: unknown;
  status: "success" | "error";
  result?: unknown;
  errorMessage?: string;
};

export async function invokeToolCallingWithFallback({
  systemPrompt,
  userPrompt,
  tools,
  fallback,
  trace
}: ToolCallingOptions): Promise<AIMessage> {
  if (!isOpenAIConfigured()) {
    const fallbackMessage = await fallback();
    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "fallback",
        input: {
          mode: "tool_calling"
        },
        output: {
          content: fallbackMessage.content,
          toolCalls: fallbackMessage.tool_calls ?? []
        },
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          fallbackReason: "OPENAI_API_KEY nao configurada."
        }
      });
    }
    return fallbackMessage;
  }

  try {
    const model = createChatModel().bindTools(tools);
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ] satisfies BaseMessage[]);

    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "llm_success",
        input: {
          mode: "tool_calling"
        },
        output: {
          content: response.content,
          toolCalls: response.tool_calls ?? []
        },
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          modelOutput: {
            content: response.content,
            toolCalls: response.tool_calls ?? []
          }
        }
      });
    }

    return response;
  } catch (error) {
    const fallbackMessage = await fallback();
    if (trace) {
      await appendAgentTranscript({
        ...trace,
        phase: "llm",
        status: "fallback",
        input: {
          mode: "tool_calling"
        },
        output: {
          content: fallbackMessage.content,
          toolCalls: fallbackMessage.tool_calls ?? []
        },
        discussion: {
          provider: "openai",
          model: env.openaiModel,
          systemPrompt,
          userPrompt,
          fallbackReason: "Falha na chamada com tools; usando fallback deterministico.",
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido."
        }
      });
    }
    return fallbackMessage;
  }
}

export async function executeToolCallsFromMessage({
  message,
  tools,
  trace,
  executionLabel
}: {
  message: AIMessage;
  tools: StructuredToolInterface[];
  trace?: AgentTraceContext;
  executionLabel?: string;
}): Promise<ExecutedToolCall[]> {
  const toolRegistry = new Map(tools.map((tool) => [tool.name, tool]));
  const toolCalls = message.tool_calls ?? [];
  const executedToolCalls: ExecutedToolCall[] = [];

  for (const toolCall of toolCalls) {
    const tool = toolRegistry.get(toolCall.name);

    if (!tool) {
      executedToolCalls.push({
        id: toolCall.id ?? `missing_${toolCall.name}`,
        name: toolCall.name,
        args: toolCall.args,
        status: "error",
        errorMessage: `Tool ${toolCall.name} nao registrada.`
      });
      continue;
    }

    try {
      const result = await tool.invoke(toolCall.args);
      executedToolCalls.push({
        id: toolCall.id ?? `${toolCall.name}_${executedToolCalls.length + 1}`,
        name: toolCall.name,
        args: toolCall.args,
        status: "success",
        result
      });
    } catch (error) {
      executedToolCalls.push({
        id: toolCall.id ?? `${toolCall.name}_${executedToolCalls.length + 1}`,
        name: toolCall.name,
        args: toolCall.args,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Erro desconhecido."
      });
    }
  }

  if (trace) {
    await appendAgentTranscript({
      ...trace,
      phase: "node",
      status: executedToolCalls.some((toolCall) => toolCall.status === "error")
        ? "error"
        : "success",
      input: {
        mode: "tool_execution",
        executionLabel: executionLabel ?? "tool_execution",
        toolCalls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args
        }))
      },
      output: {
        toolResults: executedToolCalls
      },
      discussion: {
        provider: "langchain_tools",
        model: env.openaiModel
      }
    });
  }

  return executedToolCalls;
}

export function buildToolResearchPayload(
  message: AIMessage,
  executedToolCalls: ExecutedToolCall[]
): Record<string, unknown> {
  return {
    requestedToolCalls: (message.tool_calls ?? []).map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      args: toolCall.args
    })),
    toolResults: executedToolCalls.map((toolCall) => ({
      name: toolCall.name,
      toolCallId: toolCall.id,
      status: toolCall.status,
      result:
        toolCall.status === "success"
          ? toolCall.result
          : {
              error: toolCall.errorMessage ?? "Erro desconhecido."
            }
    }))
  };
}
