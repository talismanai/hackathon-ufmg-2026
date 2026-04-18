import "dotenv/config";
import path from "node:path";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openaiEnabled: process.env.OPENAI_ENABLED !== "false",
  workflow2FastMode: process.env.WORKFLOW2_FAST_MODE !== "false",
  agentTranscriptDir:
    process.env.AGENT_TRANSCRIPT_DIR ??
    path.resolve(process.cwd(), "logs", "agent-traces")
};
