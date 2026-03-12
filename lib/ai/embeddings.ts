import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed } from "ai";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const EMBEDDING_MODEL = openrouter.embedding("nvidia/llama-nemotron-embed-vl-1b-v2");
export const EMBEDDING_DIMS = 2048;

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
  });
  return embedding;
}
