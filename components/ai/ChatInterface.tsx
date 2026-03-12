"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Bot, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";

type ToolOutputPart = Extract<
  UIMessage["parts"][number],
  { type: `tool-${string}` | "dynamic-tool" }
>;

function isToolOutputPart(
  part: UIMessage["parts"][number]
): part is ToolOutputPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

const TOOL_LABELS: Record<string, string> = {
  getDashboardSnapshot: "Dashboard",
  getCourseOverview: "Course overview",
  getCourseTimeline: "Timeline",
  getCourseResources: "Resources",
  getSubmissionInsights: "Submissions",
  searchAssignments: "Searching",
  getTodayPlanSnapshot: "Today's plan",
  saveMemory: "Saving to memory",
  searchMemories: "Recalling memory",
  getPlannerEvents: "Planner events",
};

const MEMORY_TOOLS = new Set(["saveMemory", "searchMemories"]);

function ToolPill({ part }: { part: ToolOutputPart }) {
  const toolName = part.type.replace(/^tool-/, "");
  const label = TOOL_LABELS[toolName] ?? toolName;
  const isMemory = MEMORY_TOOLS.has(toolName);
  const isPending = part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";

  const output = !isPending && !isError && isRecord(part.output) ? part.output : null;
  const summary = output && typeof output.summary === "string" ? output.summary : null;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${
      isMemory
        ? "bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400"
        : "bg-muted/60 border-border/50 text-muted-foreground"
    }`}>
      {isPending ? (
        <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin inline-block" />
      ) : isError ? (
        <span className="text-red-500">!</span>
      ) : (
        <span className="opacity-60">✓</span>
      )}
      {summary ?? label}
    </span>
  );
}

type SessionMeta = {
  messageCount: number;
  summaryCount: number;
  compactionThreshold: number;
  summary: string | null;
};

export function ChatInterface({
  chatId,
  contextData,
  botName,
}: {
  chatId: string;
  contextData: string;
  botName?: string | null;
}) {
  const [input, setInput] = useState("");
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: chatId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          message: messages[messages.length - 1],
          context: contextData,
        },
      }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function fetchSession(ignoreSignal?: { current: boolean }) {
    const res = await fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`);
    if (!res.ok) return;
    const data: { messages?: UIMessage[]; messageCount?: number; summaryCount?: number; compactionThreshold?: number; summary?: string | null } = await res.json();
    if (ignoreSignal?.current) return;
    if (Array.isArray(data.messages)) setMessages(data.messages);
    setSessionMeta({
      messageCount: data.messageCount ?? 0,
      summaryCount: data.summaryCount ?? 0,
      compactionThreshold: data.compactionThreshold ?? 30,
      summary: data.summary ?? null,
    });
  }

  useEffect(() => {
    const signal = { current: false };
    fetchSession(signal);
    return () => { signal.current = true; };
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh session meta after each AI response completes
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready") {
      fetchSession();
    }
    prevStatus.current = status;
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  }

  const visibleMessages = messages
    .filter((m) => m.role !== "system")
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
  const hasSummary = sessionMeta && sessionMeta.summaryCount > 0;
  const messagesUntilCompaction = sessionMeta
    ? Math.max(0, sessionMeta.compactionThreshold - sessionMeta.messageCount)
    : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      {/* Messages */}
      <div className="flex-1 pb-28">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 mx-auto">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">{botName ? `Hey, I'm ${botName}` : "AI Assistant"}</h2>
              <p className="text-muted-foreground max-w-xs leading-relaxed">
                Ask about deadlines, get study strategies, or talk through your coursework.
              </p>
            </motion.div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {/* Compaction divider — shown when prior context was summarized */}
            {hasSummary && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 py-1"
              >
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-xs text-muted-foreground/60 px-2 flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 inline-block" />
                  Context summarized {sessionMeta.summaryCount > 1 ? `(${sessionMeta.summaryCount}x)` : ""}
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {visibleMessages.map((m) => {
                const text = extractMessageText(m);
                const toolParts = m.parts.filter(isToolOutputPart);
                const isUser = m.role === "user";

                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-foreground/60" />
                      </div>
                    )}

                    <div className={`flex flex-col gap-2 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
                      {toolParts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {toolParts.map((part) => (
                            <ToolPill key={part.toolCallId} part={part} />
                          ))}
                        </div>
                      )}

                      {text && (
                        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          isUser
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted/50 text-foreground rounded-tl-sm"
                        }`}>
                          {isUser ? (
                            <span>{text}</span>
                          ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-foreground/60" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-muted/50 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </motion.div>
            )}

            {error && (
              <div className="max-w-lg rounded-xl bg-red-500/5 border border-red-300/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error.message}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Sticky input bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur-md px-6 pt-3 pb-4">
        {sessionMeta && visibleMessages.length > 0 && (
          <div className="max-w-3xl mx-auto flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
              {messagesUntilCompaction !== null && (
                <span className={messagesUntilCompaction <= 5 ? "text-amber-500/70" : ""}>
                  {messagesUntilCompaction} before compaction
                </span>
              )}
              {sessionMeta.summaryCount > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 inline-block" />
                    summarized {sessionMeta.summaryCount}x
                  </span>
                </>
              )}
            </div>
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex items-center gap-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="flex-1 bg-muted rounded-2xl px-4 py-3 text-sm border-0 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60 transition-shadow"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-xl h-11 w-11 shrink-0"
            disabled={isLoading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
