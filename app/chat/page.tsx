"use client";

import { useState, useEffect } from "react";
import { ChatInterface } from "@/components/ai/ChatInterface";
import { readLocalJson } from "@/lib/client-storage";

export default function ChatPage() {
  const [botName, setBotName] = useState<string | null>(null);

  useEffect(() => {
    setBotName(readLocalJson<string>("canvas-bot-name"));
  }, []);

  return (
    <div className="bg-background">
      <ChatInterface
        chatId="general-chat"
        contextData=""
        botName={botName}
      />
    </div>
  );
}
