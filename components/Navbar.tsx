"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import { readLocalJson, writeLocalJson } from "@/lib/client-storage";

const BOT_NAME_KEY = "canvas-bot-name";

function BotOnboardingSheet({ onDone }: { onDone: (name: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  function submit() {
    const name = value.trim();
    if (!name) return;
    writeLocalJson(BOT_NAME_KEY, name);
    onDone(name);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black"
        onClick={() => onDone("Canvas")}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg bg-card border border-border rounded-t-3xl p-8 pb-12 shadow-2xl mx-4 mb-0"
      >
        <button
          onClick={() => onDone("Canvas")}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">One quick thing</h2>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              What do you want to call your AI? You can pick anything — a name that makes it feel like yours.
            </p>
          </div>

          <div className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Aria, Scout, Max..."
              className="w-full bg-muted border-0 rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
              maxLength={24}
            />
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
            >
              {value.trim() ? `Meet ${value.trim()}` : "Set a name"}
            </button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            You can always rename it later.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Navbar() {
  const router = useRouter();
  const [botName, setBotName] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = readLocalJson<string>(BOT_NAME_KEY);
    if (stored) {
      setBotName(stored);
    } else {
      const t = setTimeout(() => setShowOnboarding(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function handleOnboardingDone(name: string) {
    setBotName(name);
    setShowOnboarding(false);
  }

  function handleChatClick() {
    router.push("/chat");
  }

  return (
    <>
      <nav className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-8 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="font-semibold text-base tracking-tight hover:text-primary transition-colors"
          >
            Personal Canvas
          </button>

          {mounted && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.2 }}
              onClick={handleChatClick}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <MessageSquare className="w-4 h-4" />
              {botName ? `Chat with ${botName}` : "Chat"}
            </motion.button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {showOnboarding && (
          <BotOnboardingSheet onDone={handleOnboardingDone} />
        )}
      </AnimatePresence>
    </>
  );
}
