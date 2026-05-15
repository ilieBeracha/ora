"use client";

import {
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  History,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Search,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { WidgetList } from "@/components/widgets/widget-renderer";
import {
  buildChatContextSourceLabel,
  buildDirectSuggestions,
  buildFocusBriefContent,
  describeDirectSuggestion,
  type AssistantSuggestion,
  type ChatOpenContext,
} from "@/lib/chat/context";
import type { ChatWidget } from "@/lib/chat/widgets";

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  body: string;
  toolName?: string;
  widgets?: ChatWidget[];
};

type ChatResponse = {
  sessionId: string | null;
  reply: string;
  tools: Array<{
    toolName: string;
    status?: "success" | "error";
    result: unknown;
  }>;
  widgets: ChatWidget[];
};

type ChatSnapshot = {
  sessionId: string | null;
  messages: Array<AssistantMessage & { createdAt?: string }>;
  sessions?: ChatSessionListItem[];
};

type ChatSessionListItem = {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type ChatHistoryTurn = {
  role: "assistant" | "user";
  content: string;
};

type ChatContextMode = "focused" | "clean" | "thread";
type ChatViewMode = "direct" | "explore";

type AssistantRailTarget = ChatOpenContext & {
  key: string;
  label: string;
  detail: string;
  prompt: string;
  sourceLabel: string;
};

const chatSessionStorageKey = "ora-chat-session-id";
const chatContextModeStorageKey = "ora-chat-context-mode";

const contextModeOptions: Array<{
  value: ChatContextMode;
  label: string;
  description: string;
}> = [
  {
    value: "focused",
    label: "Recent",
    description: "Uses the current page and the last few messages.",
  },
  {
    value: "clean",
    label: "This page",
    description: "Uses the current page without earlier chat messages.",
  },
  {
    value: "thread",
    label: "Full thread",
    description: "Uses more of this chat session for follow-up questions.",
  },
];

const initialMessages: AssistantMessage[] = [
  {
    id: "intro",
    role: "assistant",
    body: "Ask about your store data. Chat is read-only; approved actions still move through the Signal flow.",
  },
];

export function AssistantChat() {
  const pathname = usePathname();
  const [messages, setMessages] = useState(initialMessages);
  const [directMessages, setDirectMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("Reading connected tools");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [directSessionId, setDirectSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [contextMode, setContextMode] = useState<ChatContextMode>("focused");
  const [chatViewMode, setChatViewMode] = useState<ChatViewMode>("explore");
  const [mounted, setMounted] = useState(false);
  const [activeContext, setActiveContext] = useState<ChatOpenContext | null>(
    null,
  );
  const [railTargets, setRailTargets] = useState<AssistantRailTarget[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const activeChatScopeRef = useRef<ChatViewMode>("explore");
  const streamAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const submittingRef = useRef(false);
  const isDirectMode = chatViewMode === "direct";
  const activeMessages = isDirectMode ? directMessages : messages;
  const pageContext = useMemo(() => buildPageContext(pathname), [pathname]);
  const suggestions = useMemo(
    () =>
      isDirectMode
        ? buildDirectSuggestions(activeContext ?? pageContext)
        : buildContextualSuggestions(messages),
    [activeContext, isDirectMode, messages, pageContext],
  );
  const suggestionTitle = useMemo(
    () =>
      isDirectMode
        ? "Start with"
        : buildSuggestionTitle(messages),
    [isDirectMode, messages],
  );
  const visibleContext = activeContext ?? pageContext;
  const contextActions = useMemo(
    () => buildContextActions(visibleContext),
    [visibleContext],
  );
  const collapsedShortcuts = useMemo(
    () => buildCollapsedShortcuts(visibleContext),
    [visibleContext],
  );
  const openChatFromContextTarget = useCallback(
    (target: HTMLElement, event?: { preventDefault: () => void }) => {
      if (pending) return false;

      const prompt = getChatContextPrompt(target);
      if (!prompt) return false;

      if (target.dataset.chatPreventNav === "true") {
        event?.preventDefault();
      }

      const context = {
        ...readChatContext(target),
        defaultPrompt: prompt,
      };

      setIsOpen(true);
      if (context.source === "topbar") {
        setActiveContext(null);
        setChatViewMode("explore");
      } else {
        setActiveContext(context);
        setChatViewMode("direct");
        setDirectSessionId(null);
        setDirectMessages([]);
      }

      return true;
    },
    [pending],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let ignore = false;
    const storedSessionId = window.localStorage.getItem(chatSessionStorageKey);
    const storedContextMode = window.localStorage.getItem(
      chatContextModeStorageKey,
    );

    if (isContextMode(storedContextMode)) {
      setContextMode(storedContextMode);
    }

    fetch(buildChatSnapshotUrl(storedSessionId))
      .then((response) => response.json() as Promise<ChatSnapshot>)
      .then((snapshot) => {
        if (ignore) return;

        applySnapshot(snapshot);
      })
      .catch(() => {
        if (!ignore) {
          window.localStorage.removeItem(chatSessionStorageKey);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setActiveContext(null);
    setChatViewMode("explore");
    setIsHistoryOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isDirectMode) {
      setIsHistoryOpen(false);
    }
  }, [isDirectMode]);

  useEffect(() => {
    if (!mounted) return undefined;

    const updateRailTargets = () => {
      setRailTargets(readRailTargets());
    };
    const frameId = window.requestAnimationFrame(updateRailTargets);
    const timeoutId = window.setTimeout(updateRailTargets, 250);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [mounted, pathname]);

  useEffect(() => {
    function targetIsInsidePanel(target: EventTarget | null) {
      return target instanceof Node && panelRef.current?.contains(target);
    }

    function handlePointerDown(event: PointerEvent) {
      if (getChatContextTarget(event.target)) return;
      if (targetIsInsidePanel(event.target)) return;

      setIsOpen(false);
    }

    function handleFocusIn(event: FocusEvent) {
      if (getChatContextTarget(event.target)) return;
      if (targetIsInsidePanel(event.target)) return;

      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [openChatFromContextTarget]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function handleContextClick(event: globalThis.MouseEvent) {
      const target = getChatContextTarget(event.target);
      if (!target) return;

      openChatFromContextTarget(target, event);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleContextClick);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleContextClick);
    };
  }, [openChatFromContextTarget]);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatViewMode, directMessages, messages, pending]);

  function applySnapshot(snapshot: ChatSnapshot) {
    setSessionId(snapshot.sessionId);
    setSessions(snapshot.sessions ?? []);

    if (snapshot.sessionId) {
      window.localStorage.setItem(chatSessionStorageKey, snapshot.sessionId);
    } else {
      window.localStorage.removeItem(chatSessionStorageKey);
    }

    setMessages(snapshot.messages.length > 0 ? snapshot.messages : initialMessages);
  }

  async function loadSnapshot(targetSessionId?: string | null) {
    const response = await fetch(buildChatSnapshotUrl(targetSessionId));
    applySnapshot((await response.json()) as ChatSnapshot);
  }

  async function refreshSessionList(targetSessionId = sessionId) {
    const response = await fetch(buildChatSnapshotUrl(targetSessionId));
    const snapshot = (await response.json()) as ChatSnapshot;
    setSessions(snapshot.sessions ?? []);
  }

  function startNewChat() {
    if (pending) return;

    setInput("");
    setIsOpen(true);
    setIsHistoryOpen(false);
    if (isDirectMode) {
      setDirectSessionId(null);
      setDirectMessages([]);
    } else {
      setSessionId(null);
      setMessages(initialMessages);
      window.localStorage.removeItem(chatSessionStorageKey);
    }
  }

  function selectSession(targetSessionId: string) {
    if (pending) return;

    setIsHistoryOpen(false);

    if (targetSessionId === sessionId) return;

    setIsOpen(true);
    setChatViewMode("explore");
    setActiveContext(null);
    setIsHistoryOpen(false);
    void loadSnapshot(targetSessionId);
  }

  function changeContextMode(nextMode: ChatContextMode) {
    setContextMode(nextMode);
    window.localStorage.setItem(chatContextModeStorageKey, nextMode);
  }

  function closeChat() {
    setIsHistoryOpen(false);
    setIsOpen(false);
  }

  function openRestingChat() {
    if (pending) return;

    setIsOpen(true);
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await sendChatMessage(input);
  }

  function submitPrompt(prompt: string, context?: ChatOpenContext | null) {
    void sendChatMessage(prompt, context);
  }

  async function sendChatMessage(
    rawMessage: string,
    contextOverride?: ChatOpenContext | null,
  ) {
    const message = rawMessage.trim();
    if (!message || pending || submittingRef.current) return;

    const runScope = chatViewMode;
    const currentMessages =
      runScope === "direct" ? directMessages : messages;
    const currentSessionId =
      runScope === "direct" ? directSessionId : sessionId;
    const appendMessage =
      runScope === "direct" ? setDirectMessages : setMessages;

    const userMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      body: message,
    };
    const history = buildConversationHistory(currentMessages);
    const context = contextOverride ?? activeContext ?? pageContext;

    submittingRef.current = true;
    activeChatScopeRef.current = runScope;
    setIsOpen(true);
    appendMessage((current) => [...current, userMessage]);
    setInput("");
    setPending(true);
    setPendingLabel("Starting");
    cancelledRef.current = false;

    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          history,
          sessionId: currentSessionId,
          scope: runScope === "direct" ? "direct" : "general",
          contextMode: runScope === "direct" ? "clean" : contextMode,
          context,
        }),
        signal: abortController.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        await readChatEventStream(response, (event, data) => {
          handleChatStreamEvent(event, data);
        });
        return;
      }

      if (!contentType.includes("application/json")) {
        throw new Error("The chat route returned an unreadable response.");
      }

      addAssistantResponse((await response.json()) as ChatResponse);
    } catch (error) {
      if (cancelledRef.current || isAbortError(error)) {
        return;
      }

      appendMessage((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          body:
            error instanceof Error
              ? error.message
              : "Ora could not reach the chat route. Try again.",
        },
      ]);
    } finally {
      submittingRef.current = false;
      setPending(false);
      setPendingLabel("Reading connected tools");
      activeRunIdRef.current = null;
      streamAbortRef.current = null;
    }
  }

  async function cancelPendingRun() {
    cancelledRef.current = true;
    setPendingLabel("Stopping");

    const runId = activeRunIdRef.current;

    if (runId) {
      await fetch(`/api/chat/runs/${runId}/cancel`, {
        method: "POST",
      }).catch(() => undefined);
    }

    streamAbortRef.current?.abort();
    submittingRef.current = false;
    setPending(false);
    activeRunIdRef.current = null;
    streamAbortRef.current = null;

    const appendMessage =
      activeChatScopeRef.current === "direct" ? setDirectMessages : setMessages;

    appendMessage((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        body: "Stopped.",
      },
    ]);
  }

  function handleSuggestion(
    message: string,
    event?: MouseEvent<HTMLButtonElement>,
    context?: ChatOpenContext | null,
  ) {
    event?.currentTarget.blur();
    submitPrompt(message, context ?? (isDirectMode ? visibleContext : null));
  }

  function handleContextAction(
    prompt: string,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    event?.currentTarget.blur();
    submitPrompt(prompt, visibleContext);
  }

  function handleCollapsedShortcut(
    prompt: string,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    event?.currentTarget.blur();
    submitPrompt(prompt, visibleContext);
  }

  function handleRailTarget(
    target: AssistantRailTarget,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    if (pending) return;

    event?.currentTarget.blur();
    const context: ChatOpenContext = {
      source: target.source,
      title: target.title ?? target.label,
      description: target.description ?? target.detail,
      defaultPrompt: target.prompt,
      href: target.href,
      signalId: target.signalId,
      actionPlanId: target.actionPlanId,
      objectType: target.objectType,
      objectId: target.objectId,
    };

    setActiveContext(context);
    setChatViewMode("direct");
    setDirectSessionId(null);
    setDirectMessages([]);
    setIsOpen(true);
  }

  function handleChatStreamEvent(event: string, data: unknown) {
    if (event === "run" && isRecord(data) && typeof data.runId === "string") {
      activeRunIdRef.current = data.runId;
      return;
    }

    if (
      event === "session" &&
      isRecord(data) &&
      typeof data.sessionId === "string"
    ) {
      if (activeChatScopeRef.current === "direct") {
        setDirectSessionId(data.sessionId);
      } else {
        setSessionId(data.sessionId);
        window.localStorage.setItem(chatSessionStorageKey, data.sessionId);
      }
      return;
    }

    if (
      event === "status" &&
      isRecord(data) &&
      typeof data.message === "string"
    ) {
      setPendingLabel(data.message);
      return;
    }

    if (event === "tool" && isRecord(data) && typeof data.toolName === "string") {
      setPendingLabel(
        data.status === "failed"
          ? `Retrying after ${data.toolName} failed`
          : data.status === "complete"
          ? `Read ${data.toolName}`
          : `Using ${data.toolName}`,
      );
      return;
    }

    if (event === "complete" && isChatResponse(data)) {
      addAssistantResponse(data);
      return;
    }

    if (
      event === "cancelled" &&
      isRecord(data) &&
      typeof data.message === "string" &&
      !cancelledRef.current
    ) {
      const message = data.message;
      const appendMessage =
        activeChatScopeRef.current === "direct"
          ? setDirectMessages
          : setMessages;

      appendMessage((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          body: message,
        },
      ]);
      return;
    }

    if (event === "error") {
      throw new Error(
        isRecord(data) && typeof data.message === "string"
          ? data.message
          : "Ora could not answer from connected tools.",
      );
    }
  }

  function addAssistantResponse(data: ChatResponse) {
    const appendMessage =
      activeChatScopeRef.current === "direct" ? setDirectMessages : setMessages;

    if (activeChatScopeRef.current === "direct") {
      setDirectSessionId(data.sessionId);
    } else {
      setSessionId(data.sessionId);
    }

    if (data.sessionId && activeChatScopeRef.current === "explore") {
      window.localStorage.setItem(chatSessionStorageKey, data.sessionId);
    }

    if (data.sessionId) {
      void refreshSessionList(data.sessionId);
    }

    appendMessage((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        body: data.reply,
        toolName: data.tools[0]?.toolName,
        widgets: data.widgets ?? [],
      },
    ]);
  }

  const isExpanded = isOpen;
  const showStoreBrief = !isDirectMode && isStoreIntroState(activeMessages);
  const showSuggestionCard =
    !isDirectMode &&
    !showStoreBrief &&
    !latestAssistantHasFollowups(activeMessages);
  const panelClassName = [
    "assistant-panel",
    isExpanded ? "assistant-panel-active" : "",
    isDirectMode ? "assistant-panel-direct" : "assistant-panel-explore",
  ]
    .filter(Boolean)
    .join(" ");
  const panelTitle = isDirectMode ? "Focused chat" : "Store chat";
  const inputPlaceholder = pending
    ? "Reading connected data..."
    : isDirectMode
    ? "Ask about this selection"
    : "Ask about your store";
  const collapsedContextTitle = visibleContext.title ?? "current page";
  const previewTarget = railTargets[0];

  const panel = (
    <aside
      aria-label="Signal assistant"
      className={panelClassName}
      ref={panelRef}
    >
      {!isExpanded ? (
        <div className="assistant-collapsed">
          <button
            aria-label={`Open chat for ${collapsedContextTitle}`}
            className="assistant-collapsed-trigger"
            onClick={openRestingChat}
            type="button"
          >
            <span className="assistant-collapsed-icon">
              <MessageSquareText size={16} aria-hidden="true" />
            </span>
            <span className="assistant-collapsed-copy">
              <strong>Ask Ora</strong>
              <small>{collapsedContextTitle}</small>
            </span>
          </button>
          <div className="assistant-collapsed-shortcuts" aria-label="Quick chat prompts">
            <span>Quick asks</span>
            {collapsedShortcuts.map((shortcut) => (
              <button
                disabled={pending}
                key={`${shortcut.label}:${shortcut.prompt}`}
                onClick={(event) =>
                  handleCollapsedShortcut(shortcut.prompt, event)
                }
                type="button"
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          {previewTarget ? (
            <div
              className="assistant-collapsed-preview"
              aria-label="Chat preview"
            >
              <button
                disabled={pending}
                onClick={(event) => handleRailTarget(previewTarget, event)}
                type="button"
              >
                <span className="assistant-preview-image" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="assistant-preview-copy">
                  <small>{previewTarget.sourceLabel} preview</small>
                  <strong>{previewTarget.label}</strong>
                  <em>{previewTarget.detail}</em>
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isExpanded ? (
        <>
          <div className="assistant-handle" />
          <div className="assistant-panel-header">
            <div className="assistant-panel-heading">
              <div className="assistant-panel-title">
                <MessageSquareText size={17} aria-hidden="true" />
                {panelTitle}
              </div>
              <span title={visibleContext.description}>
                {visibleContext.title}
              </span>
            </div>
            <div className="assistant-panel-actions">
              {!isDirectMode ? (
                <>
                  <div className="assistant-session-picker">
                    <button
                      aria-expanded={isHistoryOpen}
                      aria-haspopup="menu"
                      className="assistant-session-toggle"
                      disabled={pending}
                      onClick={() => setIsHistoryOpen((current) => !current)}
                      type="button"
                    >
                      <History size={15} aria-hidden="true" />
                      Chats
                    </button>
                    {isHistoryOpen ? (
                      <div className="assistant-session-popover" role="menu">
                        <div className="assistant-session-popover-head">
                          <strong>Recent chats</strong>
                          <span>{sessions.length}</span>
                        </div>
                        {sessions.length === 0 ? (
                          <p>No saved chats yet.</p>
                        ) : (
                          sessions.slice(0, 8).map((session) => (
                            <button
                              aria-current={
                                session.id === sessionId ? "true" : undefined
                              }
                              className="assistant-session-option"
                              disabled={pending}
                              key={session.id}
                              onClick={() => selectSession(session.id)}
                              role="menuitem"
                              type="button"
                            >
                              <strong>
                                {cleanChatDisplayCopy(session.title)}
                              </strong>
                              <span>
                                {session.preview
                                  ? cleanChatDisplayCopy(session.preview)
                                  : "No messages yet"}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                  <label className="assistant-memory-control">
                    <span>Memory</span>
                    <select
                      aria-label="Chat memory"
                      disabled={pending}
                      onChange={(event) =>
                        changeContextMode(event.target.value as ChatContextMode)
                      }
                      value={contextMode}
                    >
                      {contextModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    aria-label="Start a new chat"
                    disabled={pending}
                    onClick={startNewChat}
                    type="button"
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </>
              ) : null}
              <button
                aria-label="Close chat"
                onClick={closeChat}
                type="button"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className={`assistant-context-bar${
              isDirectMode ? " assistant-context-bar-direct" : ""
            }`}
          >
            <span>{activeContext ? "Selected" : "Page"}</span>
            <strong title={visibleContext.description}>
              {visibleContext.title}
            </strong>
            {!isDirectMode ? (
              <div>
                {contextActions.map((action) => (
                  <button
                    disabled={pending}
                    key={action.label}
                    onClick={(event) =>
                      handleContextAction(action.prompt, event)
                    }
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
                {activeContext ? (
                  <button
                    disabled={pending}
                    onClick={() => setActiveContext(null)}
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {isExpanded ? (
        <div className="assistant-body">
          <div className="assistant-conversation">
            <div className="assistant-thread" aria-live="polite" ref={threadRef}>
              {showStoreBrief ? (
                <AssistantStoreBrief
                  context={visibleContext}
                  onPrompt={handleSuggestion}
                  pending={pending}
                />
              ) : null}

              {isDirectMode ? (
                <AssistantFocusBrief
                  context={visibleContext}
                  onPrompt={handleSuggestion}
                  pending={pending}
                  suggestions={suggestions}
                />
              ) : null}

              {activeMessages
                .filter(
                  (message) => !(showStoreBrief && message.id === "intro"),
                )
                .map((message) =>
                  message.role === "user" ? (
                    <div className="assistant-message-user" key={message.id}>
                      <div className="assistant-name">You</div>
                      <p>{cleanChatDisplayCopy(message.body)}</p>
                    </div>
                  ) : (
                    <div
                      className="assistant-message assistant-message-system"
                      key={message.id}
                    >
                      <MessageSquareText size={18} aria-hidden="true" />
                      <div>
                        <div className="assistant-name">
                          Signal assistant
                          {message.toolName ? (
                            <span className="assistant-tool">
                              {message.toolName}
                            </span>
                          ) : null}
                        </div>
                        <AssistantFormattedText
                          text={cleanChatDisplayCopy(message.body)}
                        />
                        <WidgetList
                          allowChatOpen={false}
                          onPrompt={handleSuggestion}
                          widgets={message.widgets ?? []}
                        />
                      </div>
                    </div>
                  ),
                )}

              {showSuggestionCard ? (
                <div className="assistant-card">
                  <MessageSquareText size={18} aria-hidden="true" />
                  <div>
                    <div className="assistant-name">{suggestionTitle}</div>
                    <div className="assistant-suggestions">
                      {suggestions.map((suggestion) => (
                        <button
                          disabled={pending}
                          key={`${suggestion.label}:${suggestion.prompt}`}
                          onClick={(event) =>
                            handleSuggestion(suggestion.prompt, event)
                          }
                          type="button"
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {pending ? (
                <div className="assistant-message assistant-message-system assistant-loading">
                  <LoaderCircle
                    className="assistant-loader-icon"
                    size={18}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="assistant-name">Signal assistant</div>
                    <p>{pendingLabel}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <form
              action="/api/chat"
              className="assistant-input"
              onSubmit={submitMessage}
            >
              <input
                aria-label={
                  isDirectMode
                    ? "Ask about this selection"
                    : "Ask about connected data"
                }
                disabled={pending}
                onChange={(event) => setInput(event.target.value)}
                placeholder={inputPlaceholder}
                value={input}
              />
              <button
                data-pending={pending ? "true" : undefined}
                disabled={!pending && !input.trim()}
                onClick={pending ? cancelPendingRun : undefined}
                type={pending ? "button" : "submit"}
                aria-label={pending ? "Stop response" : "Send message"}
              >
                {pending ? (
                  <X size={17} aria-hidden="true" />
                ) : (
                  <Search size={17} aria-hidden="true" />
                )}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </aside>
  );

  return isExpanded && mounted ? createPortal(panel, document.body) : panel;
}

function buildChatSnapshotUrl(sessionId?: string | null) {
  const params = new URLSearchParams({ includeSessions: "1" });

  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  return `/api/chat?${params.toString()}`;
}

function isContextMode(value: unknown): value is ChatContextMode {
  return value === "focused" || value === "clean" || value === "thread";
}

function buildPageContext(pathname: string): ChatOpenContext {
  if (pathname === "/today") {
    return {
      source: "page",
      title: "Today",
      description: "Durable patterns and concrete examples from active Signals.",
      href: pathname,
      defaultPrompt:
        "Summarize the durable pattern in Today and the one Signal to review first.",
    };
  }

  if (pathname === "/signals") {
    return {
      source: "page",
      title: "Signal center",
      description: "All Signals filtered by status.",
      href: pathname,
      defaultPrompt:
        "Summarize these Signals and point out the most important pattern.",
    };
  }

  if (pathname.startsWith("/signals/")) {
    const signalId = getSignalIdFromPathname(pathname);

    return {
      source: "page",
      title: "Signal detail",
      description: "Evidence, recommendation, action plan, approval, execution, and outcome for one Signal.",
      href: pathname,
      signalId: signalId ?? undefined,
      objectType: "signal",
      objectId: signalId ?? undefined,
      defaultPrompt:
        "Summarize this Signal, the evidence that matters, and the safest next step.",
    };
  }

  if (pathname === "/actions") {
    return {
      source: "page",
      title: "Actions",
      description: "Approved actions, execution status, verification, and outcomes.",
      href: pathname,
      defaultPrompt:
        "Summarize action status and flag anything that needs follow-up.",
    };
  }

  if (pathname === "/connections") {
    return {
      source: "page",
      title: "Connections",
      description: "Connected commerce systems and sync status.",
      href: pathname,
      defaultPrompt:
        "Summarize connected systems and what data Ora can read from them.",
    };
  }

  if (pathname.startsWith("/settings") || pathname === "/invite") {
    return {
      source: "page",
      title: "Settings",
      description: "Account, company, invitations, and app configuration.",
      href: pathname,
      defaultPrompt:
        "Summarize what can be managed here.",
    };
  }

  return {
    source: "page",
    title: "Current page",
    description: "The current Ora workspace view.",
    href: pathname,
    defaultPrompt: "Summarize this context and what I should do next.",
  };
}

function buildContextActions(context: ChatOpenContext): AssistantSuggestion[] {
  const title = context.title ?? "this context";

  if (context.href === "/actions" || context.title === "Actions") {
    return [
      {
        label: "Needs approval",
        prompt: "Which ActionPlans need approval, and what is blocking execution?",
      },
      {
        label: "Ready to run",
        prompt: "Which approved ActionPlans are ready to execute, and which are blocked?",
      },
      {
        label: "Outcomes",
        prompt: "Which executed ActionPlans still need outcome follow-up?",
      },
    ];
  }

  return [
    {
      label: "Explain",
      prompt:
        context.defaultPrompt ??
        `Summarize ${title} in operator terms. Do not talk about the UI.`,
    },
    {
      label: "Next move",
      prompt: `What should I review next for ${title}? Keep it focused and practical.`,
    },
    {
      label: "Data",
      prompt: `What connected data should I inspect to validate ${title}?`,
    },
  ];
}

function buildCollapsedShortcuts(context: ChatOpenContext): AssistantSuggestion[] {
  const title = context.title ?? "this context";
  const isSelectedContext = context.source && context.source !== "page";

  if (isSelectedContext) {
    return buildDirectSuggestions(context).slice(0, 3);
  }

  if (title === "Actions") {
    return [
      {
        label: "Needs approval",
        prompt: "Which ActionPlans need approval, and what should I open first?",
      },
      {
        label: "Ready to run",
        prompt: "Which ActionPlans can be executed now?",
      },
      {
        label: "Blocked",
        prompt: "Which ActionPlans are blocked, and what is the exact blocker?",
      },
    ];
  }

  if (title === "Today" || title === "Signal center") {
    return [
      {
        label: "Top Signal",
        prompt:
          context.defaultPrompt ??
          "Summarize the most important Signals and tell me which one deserves attention first.",
      },
      {
        label: "Next step",
        prompt: `What should I review next for ${title}? Keep it focused and practical.`,
      },
      {
        label: "Data to check",
        prompt: `What connected data should I inspect to validate ${title}?`,
      },
    ];
  }

  return [
    {
      label: "Explain",
      prompt:
        context.defaultPrompt ??
        `Summarize ${title} in operator terms. Do not talk about the UI.`,
    },
    {
      label: "Next step",
      prompt: `What should I review next for ${title}? Keep it focused and practical.`,
    },
    {
      label: "Data to check",
      prompt: `What connected data should I inspect to validate ${title}?`,
    },
  ];
}

function readRailTargets(): AssistantRailTarget[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-chat-explain='true'][data-chat-title]",
    ),
  );
  const targets: AssistantRailTarget[] = [];
  const seen = new Set<string>();

  for (const element of elements) {
    if (element.closest(".assistant-panel")) continue;
    if (shouldSkipRailTarget(element.dataset.chatSource)) continue;

    const context = readChatContext(element);
    const title = cleanChatDisplayCopy(context.title ?? "").trim();
    if (!title) continue;

    const dedupeKey =
      context.objectId ??
      context.signalId ??
      [context.source, title].filter(Boolean).join(":");
    const key = [
      context.objectType,
      context.objectId,
      context.signalId,
      context.source,
      title,
    ]
      .filter(Boolean)
      .join(":");

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const prompt =
      getChatContextPrompt(element) ??
      `Explain ${title} in operator terms and keep it practical.`;
    const detail = buildRailTargetDetail(context, element.dataset.chatSource);

    targets.push({
      ...context,
      key,
      label: title,
      detail,
      prompt,
      sourceLabel: buildChatContextSourceLabel(element.dataset.chatSource),
      defaultPrompt: prompt,
    });

    if (targets.length >= 6) break;
  }

  return targets;
}

function shouldSkipRailTarget(source: string | undefined) {
  return (
    source === "topbar" ||
    source === "page-header" ||
    source === "empty-state" ||
    source === "chat-widget"
  );
}

function buildRailTargetDetail(
  context: ChatOpenContext,
  source: string | undefined,
) {
  const description = cleanChatDisplayCopy(context.description ?? "").trim();

  if (description) return truncateRailCopy(description);

  if (source === "today-trend-card") return "Today insight";
  if (source === "today-lead-insight") return "Main Today insight";
  if (source === "today-memory-card") return "Concrete example";
  if (source === "signal-card") return "Open Signal";
  if (source === "action-card") return "Action status";
  if (source === "signal-section") return "Signal detail";
  if (source === "signal-lifecycle") return "Signal flow step";

  return "Ask Ora about this";
}

function truncateRailCopy(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 74
    ? `${normalized.slice(0, 71).trim()}...`
    : normalized;
}

function AssistantStoreBrief({
  context,
  onPrompt,
  pending,
}: {
  context: ChatOpenContext;
  onPrompt: (
    prompt: string,
    event?: MouseEvent<HTMLButtonElement>,
    context?: ChatOpenContext | null,
  ) => void;
  pending: boolean;
}) {
  const title = cleanChatDisplayCopy(context.title ?? "Today");
  const actions = buildStoreMountActions(context);

  return (
    <section className="assistant-store-brief" aria-label="Store chat brief">
      <div className="assistant-store-brief-copy">
        <span>Store chat</span>
        <strong>{title}</strong>
        <p>
          Ask one focused question, then move the result into Signal review,
          evidence, or the next approved action.
        </p>
      </div>

      <div className="assistant-store-brief-actions">
        {actions.map((action) => (
          <button
            disabled={pending}
            key={`${action.label}:${action.prompt}`}
            onClick={(event) => onPrompt(action.prompt, event, context)}
            type="button"
          >
            <strong>{action.label}</strong>
            <small>{action.detail}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function buildStoreMountActions(context: ChatOpenContext) {
  const title = context.title ?? "this page";

  if (title === "Actions" || context.href === "/actions") {
    return [
      {
        label: "Needs approval",
        detail: "Find plans waiting on an exact approval.",
        prompt: "Which ActionPlans need approval, and what is blocking execution?",
      },
      {
        label: "Ready to run",
        detail: "Separate executable plans from blocked ones.",
        prompt: "Which approved ActionPlans are ready to execute, and which are blocked?",
      },
      {
        label: "Outcome follow-up",
        detail: "Check executed plans that still need measurement.",
        prompt: "Which executed ActionPlans still need outcome follow-up?",
      },
    ];
  }

  if (title === "Signal center" || context.href === "/signals") {
    return [
      {
        label: "Priority Signal",
        detail: "Choose the one Signal to open first.",
        prompt:
          context.defaultPrompt ??
          "Summarize these Signals and point out the most important pattern.",
      },
      {
        label: "Common evidence",
        detail: "Find the repeated proof behind open Signals.",
        prompt: "What evidence pattern appears across the open Signals?",
      },
      {
        label: "Next review",
        detail: "Name the safest review step.",
        prompt: "Which Signal should I review next, and what exact evidence should I inspect first?",
      },
    ];
  }

  if (context.href?.startsWith("/signals/")) {
    return [
      {
        label: "Explain Signal",
        detail: "Meaning, evidence, and recommendation.",
        prompt:
          context.defaultPrompt ??
          `Summarize this Signal, the evidence that matters, and the safest next step for ${title}.`,
      },
      {
        label: "Action state",
        detail: "Approval, execution, and outcome status.",
        prompt: `What is the action-plan, approval, execution, and outcome status for ${title}?`,
      },
      {
        label: "Validate data",
        detail: "Connected facts to confirm before acting.",
        prompt: `What connected data should I inspect to validate ${title}?`,
      },
    ];
  }

  if (title === "Connections" || context.href === "/connections") {
    return [
      {
        label: "Data coverage",
        detail: "What Ora can safely read now.",
        prompt:
          context.defaultPrompt ??
          "Summarize connected systems and what data Ora can read from them.",
      },
      {
        label: "Sync risk",
        detail: "Which source might be stale or incomplete.",
        prompt: "Which connected source has the biggest coverage or sync risk for Signal evidence?",
      },
      {
        label: "Best read",
        detail: "The next useful read-only question.",
        prompt: "What is the best read-only question to ask from the connected systems right now?",
      },
    ];
  }

  return [
    {
      label: title === "Today" ? "Top Signal" : "Explain page",
      detail:
        title === "Today"
          ? "Find the Signal that deserves attention first."
          : "Summarize where this page fits in the Signal flow.",
      prompt:
        context.defaultPrompt ??
        "Summarize the durable pattern in Today and the one Signal to review first.",
    },
    {
      label: "Find evidence",
      detail: "Pull the facts behind the current operating pattern.",
      prompt: `Show the evidence I should check for ${title}. Keep it tied to Signals.`,
    },
    {
      label: "Next approval",
      detail: "Identify the safest review or action-plan step.",
      prompt: `What should I approve or review next for ${title}? Keep it inside the Signal flow.`,
    },
  ];
}

function AssistantFocusBrief({
  context,
  onPrompt,
  pending,
  suggestions,
}: {
  context: ChatOpenContext;
  onPrompt: (
    prompt: string,
    event?: MouseEvent<HTMLButtonElement>,
    context?: ChatOpenContext | null,
  ) => void;
  pending: boolean;
  suggestions: AssistantSuggestion[];
}) {
  const title = cleanChatDisplayCopy(context.title ?? "This selection");
  const description = cleanChatDisplayCopy(
    context.description ??
      "Ask for the explanation, the connected facts, or the safest next move.",
  );
  const brief = buildFocusBriefContent(context);

  return (
    <section className="assistant-focus-brief" aria-label="Focused chat brief">
      <div className="assistant-focus-preview">
        <div className="assistant-focus-meta">
          <span>{brief.sourceLabel}</span>
          {brief.secondaryLabel ? <small>{brief.secondaryLabel}</small> : null}
        </div>
        <div className="assistant-focus-copy">
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <div className="assistant-focus-path" aria-label="Signal workflow">
          {brief.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </div>

      <div className="assistant-focus-actions">
        <div className="assistant-focus-actions-head">
          <span>Ask next</span>
          <strong>{brief.actionTitle}</strong>
        </div>
        {suggestions.slice(0, 3).map((suggestion) => (
          <button
            disabled={pending}
            key={`${suggestion.label}:${suggestion.prompt}`}
            onClick={(event) => onPrompt(suggestion.prompt, event, context)}
            type="button"
          >
            <strong>{suggestion.label}</strong>
            <small>{suggestion.detail ?? describeDirectSuggestion(suggestion.label)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function getChatContextTarget(target: EventTarget | null) {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
      ? target.parentElement
      : null;

  if (!element) return null;
  if (element.closest(".assistant-panel")) return null;

  const trigger = element.closest<HTMLElement>("[data-chat-open]");

  if (!trigger) return null;

  return (
    trigger.closest<HTMLElement>(
      "[data-chat-prompt],[data-chat-explain]",
    ) ?? null
  );
}

function getChatContextPrompt(element: HTMLElement) {
  const prompt = element.dataset.chatPrompt?.trim();
  if (prompt) return prompt;

  const title =
    element.dataset.chatTitle?.trim() ||
    element.getAttribute("aria-label")?.trim() ||
    element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120);

  if (!title) return null;

  return `Summarize "${title}" and what matters operationally.`;
}

function readChatContext(element: HTMLElement): ChatOpenContext {
  return {
    source: element.dataset.chatSource,
    title:
      element.dataset.chatTitle ||
      element.getAttribute("aria-label") ||
      undefined,
    description: element.dataset.chatDescription,
    href: window.location.pathname,
    signalId:
      element.dataset.chatSignalId ??
      getSignalIdFromPathname(window.location.pathname) ??
      undefined,
    actionPlanId: element.dataset.chatActionPlanId,
    objectType: element.dataset.chatObjectType,
    objectId: element.dataset.chatObjectId,
    widgetType: readChatWidgetType(element.dataset.chatWidgetType),
    dataSummary: element.dataset.chatDataSummary,
  };
}

function readChatWidgetType(value: string | undefined) {
  if (
    value === "kpi_card" ||
    value === "scorecard_grid" ||
    value === "stat_list" ||
    value === "data_table" ||
    value === "bar_chart" ||
    value === "product_card" ||
    value === "alert_card"
  ) {
    return value;
  }

  return undefined;
}

function getSignalIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/signals\/([^/?#]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function AssistantFormattedText({ text }: { text: string }) {
  const formatted = formatAssistantText(text);

  if (formatted.steps.length === 0) {
    return (
      <div className="assistant-formatted-text">
        {formatted.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="assistant-formatted-text">
      {formatted.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <ol className="assistant-step-list">
        {formatted.steps.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            <span>{step.body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatAssistantText(text: string) {
  const normalized = text.trim();
  const stepRegex = /(?:^|\s)(\d+)\.\s+([^:]{2,72}):\s*/g;
  const matches = [...normalized.matchAll(stepRegex)];

  if (matches.length < 2) {
    return {
      paragraphs: splitParagraphs(normalized),
      steps: [] as Array<{ title: string; body: string }>,
    };
  }

  const firstIndex = matches[0].index ?? 0;
  const prefix = normalized.slice(0, firstIndex).trim();
  const steps = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index ?? normalized.length
        : normalized.length;

    return {
      title: match[2].trim(),
      body: normalized.slice(start, end).trim(),
    };
  });

  return {
    paragraphs: splitParagraphs(prefix),
    steps,
  };
}

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function cleanChatDisplayCopy(value: string) {
  return value
    .replace(
      /^Based on Signal detail, what should I review or do next\?/i,
      "What should I review next for this Signal?",
    )
    .replace(
      /^You clicked on a Signal detail page that shows comprehensive information about a specific Signal, including/i,
      "This Signal detail brings together",
    )
    .replace(
      /^You clicked on a Signal detail page, which shows comprehensive information about a specific Signal\. This includes/i,
      "This Signal detail brings together",
    )
    .replace(
      /^You clicked on a Signal detail page/i,
      "This Signal detail",
    )
    .replace(/\bwhat the user clicked\b/gi, "the current context")
    .trim();
}

function buildSuggestionTitle(messages: AssistantMessage[]) {
  const context = getSuggestionContext(messages);

  if (context.productName) return "Suggested reads for this product";
  if (context.mode === "marketing") return "Suggested marketing reads";
  if (context.mode === "customers") return "Suggested customer reads";
  if (context.mode === "sales") return "Suggested sales reads";
  if (context.mode === "inventory") return "Suggested inventory reads";

  return "Suggested connected reads";
}

function latestAssistantHasFollowups(messages: AssistantMessage[]) {
  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.id !== "intro");

  return Boolean(
    latestAssistant?.widgets?.some((widget) => widget.type === "followup_chips"),
  );
}

function isStoreIntroState(messages: AssistantMessage[]) {
  return messages.length === 1 && messages[0]?.id === "intro";
}

function buildContextualSuggestions(
  messages: AssistantMessage[],
): AssistantSuggestion[] {
  const context = getSuggestionContext(messages);
  const productName = context.productName;

  if (productName) {
    return uniqueSuggestions([
      {
        label: "Product detail",
        prompt: `Give me the full product detail for "${productName}"`,
      },
      {
        label: "Sales evidence",
        prompt: `Show sales, orders, and revenue for "${productName}" over the last 90 days`,
      },
      {
        label: "Inventory",
        prompt: `Show inventory and variant stock for "${productName}"`,
      },
      {
        label: "Selling basics",
        prompt: `What catalog, product-page, or metafield risks do you see for "${productName}"?`,
      },
      {
        label: "Campaign fit",
        prompt: `Are there recent campaigns, flows, or audiences that mention or relate to "${productName}"?`,
      },
    ]);
  }

  if (context.mode === "marketing") {
    return uniqueSuggestions([
      {
        label: "Campaign performance",
        prompt: "Show recent campaign performance and the most important metric to watch",
      },
      {
        label: "Revenue metric",
        prompt: "Find the Klaviyo revenue metric and summarize the last 30 days",
      },
      {
        label: "Live flows",
        prompt: "Show live flows and what each one is responsible for",
      },
      {
        label: "Audience segments",
        prompt: "Show active customer segments and what they are for",
      },
      {
        label: "Recent events",
        prompt: "Show recent marketing events that matter for store performance",
      },
    ]);
  }

  if (context.mode === "customers") {
    return uniqueSuggestions([
      {
        label: "Best customers",
        prompt: "Show the highest value customers or profiles available from connected data",
      },
      {
        label: "Segments",
        prompt: "Show customer segments and explain which ones are most actionable",
      },
      {
        label: "Recent activity",
        prompt: "Show recent customer or profile events from connected systems",
      },
      {
        label: "Repeat buyers",
        prompt: "Find repeat-buyer evidence from Shopify and Klaviyo data",
      },
      {
        label: "At-risk customers",
        prompt: "Look for signs of customer segments becoming at-risk",
      },
    ]);
  }

  if (context.mode === "sales") {
    return uniqueSuggestions([
      {
        label: "Top sellers",
        prompt: "Show top-selling products over the last 90 days with revenue and units",
      },
      {
        label: "Sales trend",
        prompt: "Show revenue, order count, and average order value by week for the last 90 days",
      },
      {
        label: "Recent orders",
        prompt: "Show recent paid orders and the products driving them",
      },
      {
        label: "Low stock sellers",
        prompt: "Which products with sales momentum have low or zero inventory?",
      },
      {
        label: "Refund pressure",
        prompt: "Show recent refunds and whether any product stands out",
      },
    ]);
  }

  if (context.mode === "inventory") {
    return uniqueSuggestions([
      {
        label: "Zero stock",
        prompt: "Show active products or variants with zero available inventory",
      },
      {
        label: "Low stock",
        prompt: "Show low-stock variants and the product they belong to",
      },
      {
        label: "Demand risk",
        prompt: "Cross-check top sellers against inventory risk",
      },
      {
        label: "SKU view",
        prompt: "Show variant inventory with SKUs for the most urgent items",
      },
      {
        label: "Catalog impact",
        prompt: "Which unavailable active products are most visible in the catalog?",
      },
    ]);
  }

  return uniqueSuggestions([
    {
      label: "Store snapshot",
      prompt: "Give me a store snapshot from connected systems",
    },
    {
      label: "Top sellers",
      prompt: "Show top-selling products over the last 90 days",
    },
    {
      label: "Inventory risk",
      prompt: "Show active products or variants with inventory risk",
    },
    {
      label: "Recent campaigns",
      prompt: "Show recent campaigns and flows from connected marketing tools",
    },
    {
      label: "Customer metrics",
      prompt: "Show customer, profile, and segment metrics from connected systems",
    },
  ]);
}

function getSuggestionContext(messages: AssistantMessage[]) {
  const recent = messages.filter((message) => message.id !== "intro").slice(-6);
  const lastAssistant = [...recent]
    .reverse()
    .find((message) => message.role === "assistant");
  const text = recent
    .map((message) => `${message.body} ${message.toolName ?? ""}`)
    .join(" ")
    .toLowerCase();
  const lastTool = lastAssistant?.toolName ?? "";
  const productName = extractProductName(lastAssistant?.widgets ?? []);

  if (
    lastTool.includes("campaign") ||
    lastTool.includes("flow") ||
    lastTool.includes("metric") ||
    lastTool.includes("event") ||
    /\b(campaign|flow|klaviyo|email|sms|metric|marketing)\b/.test(text)
  ) {
    return { mode: "marketing", productName };
  }

  if (
    lastTool.includes("customer") ||
    lastTool.includes("profile") ||
    lastTool.includes("segment") ||
    /\b(customer|profile|segment|audience|vip|repeat|lapsed)\b/.test(text)
  ) {
    return { mode: "customers", productName };
  }

  if (
    lastTool.includes("inventory") ||
    /\b(inventory|stock|sku|variant|unavailable|out of stock|low stock)\b/.test(
      text,
    )
  ) {
    return { mode: "inventory", productName };
  }

  if (
    lastTool.includes("sales") ||
    lastTool.includes("orders") ||
    /\b(sales|seller|revenue|order|aov|refund|checkout)\b/.test(text)
  ) {
    return { mode: "sales", productName };
  }

  if (productName) return { mode: "product", productName };

  return { mode: "default", productName: null };
}

function extractProductName(widgets: ChatWidget[]) {
  for (const widget of [...widgets].reverse()) {
    if (widget.type === "product_card") return widget.props.name;

    if (widget.type === "data_table") {
      const row = widget.props.rows[0];
      const value =
        row?.product ??
        row?.title ??
        row?.productTitle ??
        row?.name ??
        row?.Product;

      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return null;
}

function uniqueSuggestions(suggestions: AssistantSuggestion[]) {
  const seen = new Set<string>();
  const unique: AssistantSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = `${suggestion.label}:${suggestion.prompt}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(suggestion);
  }

  return unique.slice(0, 2);
}

async function readChatEventStream(
  response: Response,
  onEvent: (event: string, data: unknown) => void,
) {
  if (!response.body) {
    throw new Error("The chat stream did not open.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk);

      if (parsed) {
        onEvent(parsed.event, parsed.data);
      }
    }
  }

  const parsed = parseSseChunk(buffer);

  if (parsed) {
    onEvent(parsed.event, parsed.data);
  }
}

function parseSseChunk(chunk: string) {
  const lines = chunk.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  return {
    event,
    data: JSON.parse(dataLines.join("\n")) as unknown,
  };
}

function isChatResponse(value: unknown): value is ChatResponse {
  return (
    isRecord(value) &&
    typeof value.sessionId !== "undefined" &&
    typeof value.reply === "string" &&
    Array.isArray(value.tools) &&
    Array.isArray(value.widgets)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildConversationHistory(messages: AssistantMessage[]): ChatHistoryTurn[] {
  return messages
    .filter((message) => message.id !== "intro")
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: summarizeMessageForHistory(message),
    }))
    .filter((turn) => turn.content.trim().length > 0);
}

function summarizeMessageForHistory(message: AssistantMessage) {
  const parts = [
    message.toolName ? `Tool used: ${message.toolName}` : "",
    message.body,
    summarizeWidgetsForHistory(message.widgets ?? []),
  ].filter(Boolean);

  return parts.join("\n").slice(0, 2000);
}

function summarizeWidgetsForHistory(widgets: ChatWidget[]) {
  return widgets
    .map((widget) => {
      if (widget.type === "kpi_card") {
        const unit = widget.props.unit ? ` ${widget.props.unit}` : "";
        return `Widget KPI: ${widget.props.label}: ${widget.props.value}${unit}`;
      }

      if (widget.type === "scorecard_grid") {
        const cards = widget.props.cards
          .map((card) => `${card.label}: ${card.value}${card.unit ? ` ${card.unit}` : ""}`)
          .join("; ");
        return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${cards}`;
      }

      if (widget.type === "stat_list") {
        const items = widget.props.items
          .map((item) => `${item.label}: ${item.value}`)
          .join("; ");
        return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${items}`;
      }

      if (widget.type === "bar_chart") {
        const rows = widget.props.data
          .slice(0, 5)
          .map(
            (row) =>
              `${String(row[widget.props.xKey] ?? "Unknown")}: ${String(
                row[widget.props.yKey] ?? "",
              )}`,
          )
          .join("; ");
        return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${rows}`;
      }

      if (widget.type === "product_card") {
        const metrics = widget.props.metrics
          ?.map((metric) => `${metric.label}: ${metric.value}`)
          .join("; ");
        return `Widget product: ${widget.props.name}${
          metrics ? `; ${metrics}` : ""
        }`;
      }

      if (widget.type === "alert_card") {
        return `Widget alert: ${widget.props.title}${
          widget.props.body ? `; ${widget.props.body}` : ""
        }`;
      }

      if (widget.type === "followup_chips") {
        return `Widget follow-ups: ${widget.props.prompts
          .map((prompt) => prompt.label)
          .join("; ")}`;
      }

      const columns = widget.props.columns.map((column) => column.key);
      const rows = widget.props.rows
        .slice(0, 5)
        .map((row) =>
          columns
            .map((key) => `${key}: ${String(row[key] ?? "")}`)
            .join(", "),
        )
        .join(" | ");

      return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${rows}`;
    })
    .filter(Boolean)
    .join("\n");
}
