import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { chatApi } from "@/api/misc";
import { ErrorState, PageLoader } from "@/components/shared/States";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { buildSocketUrl } from "@/hooks/useNotificationSocket";
import { formatTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { ChatMessage } from "@/types/api";

export function ChatRoomPage({ backTo }: { backTo: string }) {
  const { id = "" } = useParams();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [live, setLive] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number>();

  const conversation = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => chatApi.detail(id),
    enabled: Boolean(id),
  });

  const history = useQuery({
    queryKey: ["messages", id],
    queryFn: () => chatApi.messages(id),
    enabled: Boolean(id),
  });

  // History arrives newest-first from DRF; the thread reads oldest-first.
  const messages = useMemo(() => {
    const past = [...(history.data?.results ?? [])].reverse();
    const seen = new Set(past.map((message) => message.id));
    return [...past, ...live.filter((message) => !seen.has(message.id))];
  }, [history.data, live]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!id) return;
    let closedByUs = false;
    let attempt = 0;
    let retryTimer: number | undefined;

    const connect = () => {
      const url = buildSocketUrl(`/chat/${id}/`);
      if (!url) return;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        socket.send(JSON.stringify({ type: "read" }));
      };

      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data) as {
            type: string;
            data?: ChatMessage;
            name?: string;
            message?: string;
          };
          if (frame.type === "message" && frame.data) {
            setLive((current) =>
              current.some((message) => message.id === frame.data!.id)
                ? current
                : [...current, frame.data!],
            );
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["chat", "unread"] });
            socket.send(JSON.stringify({ type: "read" }));
          } else if (frame.type === "typing" && frame.name) {
            setTypingName(frame.name);
            window.clearTimeout(typingTimerRef.current);
            typingTimerRef.current = window.setTimeout(() => setTypingName(null), 3000);
          } else if (frame.type === "error" && frame.message) {
            toast.error(frame.message);
          }
        } catch {
          // A malformed frame must not kill the thread.
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (closedByUs) return;
        attempt += 1;
        retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempt, 30_000));
      };
    };

    connect();

    return () => {
      closedByUs = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(typingTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [id, queryClient]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "message", text }));
      return;
    }
    // Socket down — the REST endpoint still delivers the message.
    try {
      const message = await chatApi.send(id, text);
      setLive((current) => [...current, message]);
    } catch {
      setDraft(text);
      toast.error("Xabar yuborilmadi. Qaytadan urinib ko'ring.");
    }
  };

  if (conversation.isLoading || history.isLoading) return <PageLoader className="py-24" />;
  if (conversation.isError || !conversation.data) {
    return (
      <div className="container py-10">
        <ErrorState message="Suhbat topilmadi." onRetry={() => void conversation.refetch()} />
      </div>
    );
  }

  const other = conversation.data.participant;

  return (
    <div className="container flex max-w-3xl flex-col py-6" style={{ minHeight: "70vh" }}>
      <div className="flex items-center gap-3 border-b border-border/80 pb-4">
        <Link to={backTo} className="rounded-full p-2 hover:bg-accent" aria-label="Orqaga">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar className="h-10 w-10">
          {other?.avatar && <AvatarImage src={other.avatar} alt="" />}
          <AvatarFallback>
            {initials(other?.name ?? conversation.data.stadium_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{other?.name ?? "Suhbatdosh"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {typingName ? `${typingName} yozmoqda…` : conversation.data.stadium_name}
          </p>
        </div>
        {!connected && (
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title="Real vaqt ulanishi yo'q — xabarlar baribir yuboriladi"
          >
            <WifiOff className="h-4 w-4" />
            Oflayn
          </span>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Suhbatni birinchi xabar bilan boshlang.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.sender === user?.id;
            return (
              <div
                key={message.id}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-4 py-2 text-sm",
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {formatTime(message.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border/80 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const socket = socketRef.current;
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "typing" }));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          maxLength={2000}
          placeholder="Xabar yozing…"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full"
          disabled={!draft.trim()}
          aria-label="Yuborish"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
