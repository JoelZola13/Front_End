"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useHttpAgent } from "./providers/agui-provider";

type ServiceLookupService = {
  id?: number | string;
  name?: string;
  address?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  email?: string | null;
  overview?: string | null;
  detailUrl?: string | null;
  primaryCategory?: string | null;
  tags?: string[] | null;
};

type ServiceLookupMetadata = {
  category?: string;
  location?: string | null;
  totalFound?: number;
  services?: ServiceLookupService[];
};

type AgentUGIResponseToolsMetadata = {
  service_lookup?: ServiceLookupMetadata[];
  [key: string]: unknown;
} | null;

type AgentUGIResponseMetadata = {
  routing?: Record<string, unknown>;
  needsIdentified?: string[];
  nextActions?: string[];
  tools?: AgentUGIResponseToolsMetadata;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: AgentUGIResponseMetadata;
  variant?: "default" | "callout";
  serviceGroups?: ServiceLookupMetadata[];
  nextActions?: string[];
  needsIdentified?: string[];
};

type AgentUGIMessage = {
  id: string;
  role: ChatMessage["role"];
  content: string | Array<{ type: "text"; text: string }>;
  name?: string;
};

type AgentUGIResponseMessage = {
  role: string;
  content: Array<{ type: "text"; text: string }> | unknown;
  metadata?: AgentUGIResponseMetadata;
};

type RunAgentResponsePayload = {
  newMessages: AgentUGIResponseMessage[];
  sessionId?: string;
};

type HistoryEntryState = "active" | "default" | "disabled";

type HistoryEntry = {
  id: string;
  label: string;
  icon: string;
  state?: Exclude<HistoryEntryState, "default">;
  actions?: string[];
  onClick?: () => void;
};

type StoredMessage = {
  id: string;
  role: ChatMessage["role"];
  content: string;
  metadata?: AgentUGIResponseMetadata;
  serviceGroups?: ServiceLookupMetadata[];
  nextActions?: string[];
  needsIdentified?: string[];
  createdAt: string;
};

type StoredSession = {
  sessionId: string;
  title: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
};

type SessionHistoryBuckets = {
  today: StoredSession[];
  yesterday: StoredSession[];
  last7Days: StoredSession[];
  monthly: Record<string, StoredSession[]>;
};

const LOCAL_STORAGE_KEY = "streetbot:sessions";

const palette = {
  background: "#1F2027",
  surface: "#343640",
  surfaceMuted: "#2A2C36",
  surfaceSoft: "#292B34",
  textPrimary: "#DDDDE2",
  textSecondary: "#AFAFAF",
  accent: "#FFD600",
  border: "rgba(188, 189, 208, 0.18)",
};

const layout = {
  pagePaddingTop: 12,
  pagePaddingRight: 72,
  pagePaddingBottom: 64,
  pagePaddingLeft: 32,
  sidebarWidth: 296,
  sidebarRadius: 0,
  compactSidebarWidth: 72,
  contentGap: 0,
  mainRadius: 36,
  mainPaddingX: 72,
  mainPaddingY: 48,
  topBarHeight: 56,
  heroIllustrationWidth: 168,
  heroIllustrationHeight: 110,
  heroDescriptionMax: 720,
  heroDescriptionSpacing: 28,
  heroExamplesLabelSpacing: 40,
  promptSpacing: 16,
  promptMinWidth: 280,
  composerMaxWidth: 720,
  composerGap: 16,
  composerButtonSize: 42,
  mainContentMaxWidth: 720,
  heroVerticalOffset: 160,
  composerBottomOffset: 12,
  composerStackHeight: 118,
};

const sidebarPanelStyle: CSSProperties = {
  backgroundColor: "rgba(20, 21, 29, 0.96)",
  borderColor: "rgba(188, 189, 208, 0.12)",
  color: palette.textSecondary,
  padding: "16px 18px 24px",
  zIndex: 80,
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: layout.sidebarWidth,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  borderRight: "1px solid rgba(188, 189, 208, 0.08)",
};

const HISTORY_ENTRY_ICON_PATH = "/streetbot/history-bubble.svg";

const globalResponsiveStyles = `
  .sidebar-panel .new-chat-button {
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }
  .sidebar-panel .new-chat-button:hover {
    background-color: ${palette.accent};
    color: ${palette.accent};
    border-color: ${palette.accent} !important;
    text-shadow: 0 0 8px rgba(31, 32, 39, 0.65);
  }
  .sidebar-panel .history-entry,
  .sidebar-panel .archive-entry {
    background: transparent;
    border-color: transparent;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }
  .sidebar-panel .history-entry:hover,
  .sidebar-panel .archive-entry:hover {
    background: rgba(44, 45, 56, 0.85);
    border-color: rgba(188, 189, 208, 0.18);
  }
  .sidebar-panel .history-entry:hover .history-entry-label,
  .sidebar-panel .archive-entry:hover {
    color: ${palette.textSecondary} !important;
  }

  /* Desktop layout */
  @media (min-width: 1201px) {
    .sidebar-panel {
      display: flex !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      bottom: 0 !important;
    }
    .content-wrapper {
      padding-left: ${layout.sidebarWidth + layout.contentGap}px !important;
    }
    .chat-container {
      left: 50% !important;
      transform: translateX(-50%) !important;
    }
  }

  /* Hide sidebar on tablets and below */
  @media (max-width: 1200px) {
    .sidebar-panel {
      display: none !important;
    }
    .content-wrapper {
      padding-left: ${layout.pagePaddingLeft}px !important;
      padding-right: ${layout.pagePaddingLeft}px !important;
    }
    .chat-container {
      left: 50% !important;
      transform: translateX(-50%) !important;
      margin-top: 80px !important;
      margin-bottom: 180px !important;
    }
    .composer-container {
      left: 50% !important;
    }
  }
  
  /* Tablet adjustments */
  @media (max-width: 900px) {
    .chat-container {
      width: 90% !important;
      max-width: 600px !important;
      margin-top: 60px !important;
    }
    .composer-container {
      width: 90% !important;
      max-width: 600px !important;
    }
    .hero-illustration {
      width: 150px !important;
      height: auto !important;
    }
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    .content-wrapper {
      padding: 12px !important;
    }
    .chat-container {
      width: 100% !important;
      max-width: 100% !important;
      margin-top: 40px !important;
      margin-bottom: 160px !important;
    }
    .chat-container main > div {
      padding-left: 16px !important;
      padding-right: 16px !important;
    }
    .composer-container {
      width: calc(100% - 24px) !important;
      max-width: 100% !important;
      bottom: 8px !important;
    }
    .hero-illustration {
      width: 120px !important;
      height: auto !important;
    }
  }
  
  /* Extra small screens */
  @media (max-width: 480px) {
    .chat-container {
      margin-top: 24px !important;
    }
    .chat-container main > div {
      padding-left: 12px !important;
      padding-right: 12px !important;
    }
    .hero-illustration {
      width: 100px !important;
    }
  }
`;

const newChatButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 16px",
  borderRadius: 18,
  border: "1px solid rgba(188, 189, 208, 0.18)",
  backgroundColor: "rgba(35, 36, 44, 0.82)",
  color: palette.textPrimary,
  fontSize: 13,
  fontFamily: "Rubik, sans-serif",
  letterSpacing: "0.08em",
  textTransform: "none",
};

const sidebarToggleButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 12,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  backgroundColor: "transparent",
  color: palette.textSecondary,
  cursor: "pointer",
};

const surfaceCardStyle: CSSProperties = {
  backgroundColor: "rgba(44, 45, 56, 0.85)",
  borderColor: "rgba(188, 189, 208, 0.18)",
  color: palette.textSecondary,
};

const mainPanelStyle: CSSProperties = {
  backgroundColor: palette.background,
  borderRadius: `${layout.mainRadius}px`,
  width: "100%",
  maxWidth: layout.mainContentMaxWidth,
  margin: `${layout.heroVerticalOffset}px auto 0`,
};

const mainContentStyle: CSSProperties = {
  width: "100%",
  paddingBottom: 48,
};

const topBarBaseStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 30,
  width: "100%",
  display: "flex",
  alignItems: "center",
  backgroundColor: palette.background,
  borderBottom: "1px solid rgba(188, 189, 208, 0.04)",
  paddingTop: 10,
  paddingBottom: 10,
};

const topBarInnerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 12,
};

const versionLabelStyle: CSSProperties = {
  fontSize: 14,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: palette.accent,
  fontFamily: "Rubik, sans-serif",
};

const versionLabelTransitionStyle: CSSProperties = {
  transition: "transform 0.2s ease, opacity 0.2s ease",
};

const compactHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const compactHeaderActionsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
  marginTop: 18,
};

const sidebarSearchStyle: CSSProperties = {
  position: "relative",
  marginTop: 16,
};

const sidebarSearchInputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 18px 12px 42px",
  borderRadius: 18,
  border: "1px solid rgba(188, 189, 208, 0.16)",
  backgroundColor: "rgba(35, 36, 44, 0.92)",
  color: palette.textPrimary,
  fontSize: 13,
};

const sidebarSearchIconStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: 16,
  transform: "translateY(-50%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(188, 189, 208, 0.56)",
  fontSize: 14,
};

const compactSidebarPanelStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: layout.compactSidebarWidth,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 18,
  paddingTop: layout.pagePaddingTop,
  paddingBottom: layout.pagePaddingBottom,
  borderRight: "1px solid rgba(188, 189, 208, 0.08)",
  backgroundColor: "rgba(20, 21, 29, 0.92)",
  backdropFilter: "blur(18px)",
  zIndex: 80,
};

const compactIconButtonStyle: CSSProperties = {
  ...sidebarToggleButtonStyle,
  borderRadius: 16,
  width: 36,
  height: 36,
  borderColor: "rgba(188, 189, 208, 0.16)",
  color: palette.textPrimary,
};

const contentWrapperBaseStyle: CSSProperties = {
  position: "relative",
  minHeight: `calc(100vh - ${layout.pagePaddingBottom}px)`,
  paddingTop: layout.topBarHeight + layout.pagePaddingTop,
  paddingRight: layout.pagePaddingRight,
  paddingBottom: layout.pagePaddingBottom,
  paddingLeft: layout.sidebarWidth + layout.contentGap,
};

const chatContainerStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  paddingTop: 0,
  paddingBottom: layout.composerStackHeight + layout.composerBottomOffset,
};

const composerContainerBaseStyle: CSSProperties = {
  position: "fixed",
  left: `calc(50% + ${(layout.sidebarWidth + layout.contentGap) / 2}px)`,
  transform: "translateX(-50%)",
  bottom: layout.composerBottomOffset,
  width: layout.composerMaxWidth,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 18,
  zIndex: 10,
};

const quickButtonStyle: CSSProperties = {
  backgroundColor: "rgba(36, 37, 46, 0.6)",
  borderColor: "rgba(188, 189, 208, 0.28)",
  boxShadow: "inset 0 0 0 1px rgba(188, 189, 208, 0.18)",
  color: palette.textPrimary,
  minWidth: layout.promptMinWidth,
  maxWidth: 360,
  whiteSpace: "normal",
  padding: "12px 24px",
  fontSize: "13px",
  fontFamily: "Rubik, sans-serif",
  fontWeight: 500,
  letterSpacing: "0.01em",
  borderRadius: 999,
};

const inputWrapperStyle: CSSProperties = {
  backgroundColor: "rgba(40, 41, 51, 0.55)",
  borderColor: "rgba(188, 189, 208, 0.22)",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.32)",
  height: 62,
  borderRadius: 999,
  backdropFilter: "blur(12px)",
  padding: "0 22px",
};

const sendButtonStyle: CSSProperties = {
  backgroundColor: "#5E6073",
  color: palette.background,
  boxShadow: "0 14px 26px rgba(0, 0, 0, 0.45)",
  width: layout.composerButtonSize,
  height: layout.composerButtonSize,
};

const getLoadingMessage = (userMessage: string): string => {
  const messageLower = userMessage.toLowerCase();

  if (
    messageLower.includes("housing") ||
    messageLower.includes("shelter") ||
    messageLower.includes("homeless") ||
    messageLower.includes("apartment") ||
    messageLower.includes("place to stay")
  ) {
    return "Searching for housing options near you…";
  }

  if (
    messageLower.includes("food") ||
    messageLower.includes("meal") ||
    messageLower.includes("hungry") ||
    messageLower.includes("eat") ||
    messageLower.includes("food bank")
  ) {
    return "Finding food resources in your area…";
  }

  if (
    messageLower.includes("medical") ||
    messageLower.includes("doctor") ||
    messageLower.includes("health") ||
    messageLower.includes("clinic") ||
    messageLower.includes("hospital") ||
    messageLower.includes("sick")
  ) {
    return "Looking up healthcare services for you…";
  }

  if (
    messageLower.includes("job") ||
    messageLower.includes("work") ||
    messageLower.includes("employment") ||
    messageLower.includes("hire") ||
    messageLower.includes("career")
  ) {
    return "Searching for employment resources…";
  }

  if (
    messageLower.includes("legal") ||
    messageLower.includes("lawyer") ||
    messageLower.includes("court") ||
    messageLower.includes("rights")
  ) {
    return "Finding legal assistance options…";
  }

  if (
    messageLower.includes("mental") ||
    messageLower.includes("counseling") ||
    messageLower.includes("therapy") ||
    messageLower.includes("depression") ||
    messageLower.includes("anxiety")
  ) {
    return "Locating mental health support services…";
  }

  if (
    messageLower.includes("transport") ||
    messageLower.includes("bus") ||
    messageLower.includes("ride") ||
    messageLower.includes("get there")
  ) {
    return "Checking transportation options…";
  }

  if (
    messageLower.includes("help") ||
    messageLower.includes("support") ||
    messageLower.includes("need") ||
    messageLower.includes("assist")
  ) {
    return "Finding the best support options for you…";
  }

  if (
    messageLower.includes("near me") ||
    messageLower.includes("nearby") ||
    messageLower.includes("close") ||
    messageLower.includes("around here")
  ) {
    return "Searching for nearby services…";
  }

  const defaultMessages = [
    "Analyzing your request…",
    "Looking up available resources…",
    "Checking what help is available…",
    "Finding services that match your needs…",
  ];

  const index = userMessage.length % defaultMessages.length;
  return defaultMessages[index];
};

const messageBodyStyle: CSSProperties = {
  color: palette.textPrimary,
  fontSize: "16px",
  fontFamily: "Rubik, sans-serif",
  lineHeight: "30px",
  width: "100%",
};

const defaultMessageContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 8,
  paddingTop: 4,
  paddingBottom: 24,
  paddingLeft: 0,
  paddingRight: 0,
  marginBottom: 0,
  borderBottom: "1px solid rgba(188, 189, 208, 0.06)",
  backgroundColor: "transparent",
  boxShadow: "none",
};

const calloutContainerBaseStyle: CSSProperties = {
  backgroundColor: "rgba(26, 27, 34, 0.85)",
  borderColor: "rgba(188, 189, 208, 0.18)",
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 24,
  padding: "18px 24px",
};

const serviceGroupStyle: CSSProperties = {
  marginTop: 16,
  padding: "16px 18px",
  borderRadius: 18,
  border: "1px solid rgba(188, 189, 208, 0.18)",
  backgroundColor: "rgba(36, 37, 46, 0.35)",
};

const serviceNameStyle: CSSProperties = {
  color: palette.textPrimary,
  fontSize: "14px",
  fontFamily: "Rubik, sans-serif",
  fontWeight: 600,
};

const serviceMetaTextStyle: CSSProperties = {
  color: palette.textSecondary,
  fontSize: "12px",
  fontFamily: "Rubik, sans-serif",
  lineHeight: "20px",
};

const serviceTagStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2px 8px",
  marginRight: 6,
  marginTop: 8,
  borderRadius: 999,
  backgroundColor: "rgba(188, 189, 208, 0.12)",
  color: palette.textSecondary,
  fontSize: "11px",
  letterSpacing: "0.04em",
  fontFamily: "Rubik, sans-serif",
};

const messageLabelStyle: CSSProperties = {
  color: palette.textSecondary,
  fontSize: "12px",
  fontFamily: "Rubik, sans-serif",
  letterSpacing: "0.32em",
  textTransform: "uppercase",
};

const metadataLabelStyle: CSSProperties = {
  marginTop: 20,
  color: palette.textSecondary,
  fontSize: "12px",
  fontFamily: "Rubik, sans-serif",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

const metadataListStyle: CSSProperties = {
  marginTop: 8,
  paddingLeft: 18,
  color: palette.textPrimary,
  fontSize: "14px",
  fontFamily: "Rubik, sans-serif",
  lineHeight: "24px",
};

const serviceItemStyle: CSSProperties = {
  marginTop: 14,
};

const serviceLinkStyle: CSSProperties = {
  color: palette.accent,
  textDecoration: "underline",
  wordBreak: "break-word",
};

const serviceHeaderStyle: CSSProperties = {
  color: palette.textSecondary,
  fontSize: "11px",
  fontFamily: "Rubik, sans-serif",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

function getMessageContainerStyle(message: ChatMessage, isLast: boolean): CSSProperties {
  if (message.variant === "callout") {
    if (message.role === "user") {
      return {
        ...calloutContainerBaseStyle,
        backgroundColor: "rgba(36, 37, 46, 0.6)",
      };
    }

    if (message.role === "system") {
      return {
        ...calloutContainerBaseStyle,
        backgroundColor: "rgba(36, 37, 46, 0.5)",
      };
    }

    return calloutContainerBaseStyle;
  }

  return {
    ...defaultMessageContainerStyle,
    borderBottom: isLast ? "none" : defaultMessageContainerStyle.borderBottom,
    paddingBottom: isLast ? 0 : defaultMessageContainerStyle.paddingBottom,
  };
}

const markdownComponents: Components = {
  a({ node, ...props }) {
    return (
      <a
        {...props}
        style={{
          color: palette.accent,
          textDecoration: "underline",
          wordBreak: "break-word",
        }}
        target="_blank"
        rel="noreferrer noopener"
      />
    );
  },
  ul({ node, ...props }) {
    return (
      <ul
        {...props}
        style={{
          paddingLeft: "1.5rem",
          marginTop: "0.75rem",
          marginBottom: "0.75rem",
          listStyleType: "disc",
        }}
      />
    );
  },
  ol({ node, ...props }) {
    return (
      <ol
        {...props}
        style={{
          paddingLeft: "1.5rem",
          marginTop: "0.75rem",
          marginBottom: "0.75rem",
          listStyleType: "decimal",
        }}
      />
    );
  },
  li({ node, ...props }) {
    return <li {...props} style={{ marginBottom: "0.5rem" }} />;
  },
  strong({ node, ...props }) {
    return <strong {...props} style={{ color: palette.textPrimary }} />;
  },
  p({ node, ...props }) {
    return <p {...props} style={{ marginTop: "0.75rem" }} />;
  },
};

const EXAMPLE_PROMPTS = [
  "Write me a case statement",
  "I have a client that is looking for a place to stay",
  "Give me all the phone numbers for The food banks in my area",
] as const;

const toAgentMessages = (history: ChatMessage[]): AgentUGIMessage[] =>
  history.map((message) => ({
    id: message.id,
    role: message.role,
    content: [{ type: "text", text: message.content }],
  }));

function getDefaultSessionTitle(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Untitled chat";
  return trimmed.length <= 48 ? trimmed : `${trimmed.slice(0, 45)}…`;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function bucketSessions(sessions: StoredSession[]): SessionHistoryBuckets {
  const buckets: SessionHistoryBuckets = {
    today: [],
    yesterday: [],
    last7Days: [],
    monthly: {},
  };

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  sessions.forEach((session) => {
    const updatedAt = new Date(session.updatedAt);
    if (isSameDay(updatedAt, now)) {
      buckets.today.push(session);
      return;
    }
    if (isSameDay(updatedAt, yesterday)) {
      buckets.yesterday.push(session);
      return;
    }
    if (updatedAt >= sevenDaysAgo) {
      buckets.last7Days.push(session);
      return;
    }
    const monthKey = formatDateKey(updatedAt);
    if (!buckets.monthly[monthKey]) {
      buckets.monthly[monthKey] = [];
    }
    buckets.monthly[monthKey].push(session);
  });

  return buckets;
}

function readStoredSessions(): StoredSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredSession[];
  } catch (error) {
    console.warn("Failed to read Street Bot sessions", error);
    return [];
  }
}

function writeStoredSessions(next: StoredSession[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!next.length) {
      window.sessionStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Failed to persist Street Bot sessions", error);
  }
}

function upsertSession(sessions: StoredSession[], session: StoredSession): StoredSession[] {
  const index = sessions.findIndex((item) => item.sessionId === session.sessionId);
  if (index === -1) {
    return [...sessions, session];
  }
  const next = [...sessions];
  next[index] = session;
  return next;
}

function sortSessionsByUpdated(sessions: StoredSession[]): StoredSession[] {
  return [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function ArchiveSection({ groups }: { groups: string[] }) {
  return (
    <section className="space-y-2">
      {groups.map((group) => (
        <button
          key={group}
          type="button"
          className="archive-entry flex w-full items-center justify-between rounded-2xl border px-3 py-[6px] text-left text-xs transition"
          style={{
            borderColor: "rgba(188, 189, 208, 0.08)",
            letterSpacing: "0.1em",
            fontFamily: "Rubik, sans-serif",
            fontSize: "12px",
            color: "#BCBDD0",
          }}
        >
          <span>{group}</span>
          <span aria-hidden>›</span>
        </button>
      ))}
    </section>
  );
}

function HistorySection({ title, entries }: { title: string; entries: HistoryEntry[] }) {
  return (
    <section>
      <p
        className="uppercase"
        style={{
          color: "#60616F",
          fontSize: "10px",
          fontFamily: "Rubik, sans-serif",
          letterSpacing: "0.18em",
        }}
      >
        {title}
      </p>
      <ul className="mt-3 space-y-2.5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="history-entry flex items-center gap-2.5 rounded-3xl border px-3.5 py-2.5 transition"
            style={getHistoryEntryStyle(entry.state)}
            role={entry.onClick ? "button" : undefined}
            tabIndex={entry.onClick ? 0 : undefined}
            onClick={entry.onClick}
            onKeyDown={(event) => {
              if (!entry.onClick) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                entry.onClick();
              }
            }}
          >
            <span
              className="history-entry-icon inline-flex h-8 w-8 items-center justify-center rounded-full border"
              style={{ borderColor: "rgba(188, 189, 208, 0.18)" }}
            >
              <Image src={HISTORY_ENTRY_ICON_PATH} alt="History icon" width={15} height={15} />
            </span>
            <span
              className="history-entry-label flex-1 truncate"
              style={{
                color: palette.textPrimary,
                fontSize: "12px",
                fontFamily: "Rubik, sans-serif",
                lineHeight: "18px",
              }}
            >
              {entry.label}
            </span>
            {entry.actions?.length ? (
              <div className="flex items-center gap-1.5">
                {entry.actions.map((action, index) => (
                  <span
                    key={`${entry.label}-action-${index}`}
                    className="history-entry-action flex h-7 w-7 items-center justify-center rounded-full"
                  >
                    <Image src={action} alt="" width={13} height={13} />
                  </span>
                ))}
              </div>
            ) : null}
            {entry.state === "active" && (
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: palette.accent }} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function getHistoryEntryStyle(state: HistoryEntryState | undefined): CSSProperties {
  const base: CSSProperties = {
    backgroundColor: "transparent",
    borderColor: "transparent",
    opacity: 1,
  };

  if (state === "active") {
    return {
      ...base,
      borderColor: palette.accent,
      boxShadow: "0 0 0 1px rgba(255, 214, 0, 0.25)",
    };
  }

  if (state === "disabled") {
    return {
      ...base,
      color: palette.textSecondary,
      opacity: 0.45,
    };
  }

  return base;
}

export default function Home() {
  const agent = useHttpAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([]);
  const [historyGroups, setHistoryGroups] = useState<string[]>([]);
  const [historyEntriesToday, setHistoryEntriesToday] = useState<HistoryEntry[]>([]);
  const [historyEntriesYesterday, setHistoryEntriesYesterday] = useState<HistoryEntry[]>([]);
  const [searchResults, setSearchResults] = useState<HistoryEntry[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [hasInitializedSession, setHasInitializedSession] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const sessions = sortSessionsByUpdated(readStoredSessions());
    setStoredSessions(sessions);
  }, []);

  const handleSelectSession = useCallback(
    (id: string) => {
      const session = storedSessions.find((item) => item.sessionId === id);
      if (!session) return;

      setHasInitializedSession(true);
      setSessionId(session.sessionId);
      setMessages(
        session.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          metadata: message.metadata,
          serviceGroups: message.serviceGroups,
          nextActions: message.nextActions,
          needsIdentified: message.needsIdentified,
        })),
      );
      setInput("");
    },
    [storedSessions],
  );

  useEffect(() => {
    const normalizedSearch = sidebarSearch.trim().toLowerCase();
    const buckets = bucketSessions(storedSessions);

    const mapSessionToEntry = (session: StoredSession): HistoryEntry => ({
      id: session.sessionId,
      label: session.title,
      icon: HISTORY_ENTRY_ICON_PATH,
      state: session.sessionId === sessionId ? "active" : undefined,
      onClick: () => handleSelectSession(session.sessionId),
      actions: [],
    });

    if (normalizedSearch) {
      const filteredSessions = storedSessions.filter((session) =>
        session.title.toLowerCase().includes(normalizedSearch),
      );
      setSearchResults(filteredSessions.map(mapSessionToEntry));
      setHistoryEntriesToday([]);
      setHistoryEntriesYesterday([]);
      setHistoryGroups([]);
      return;
    }

    setSearchResults([]);
    setHistoryEntriesToday(buckets.today.map(mapSessionToEntry));
    setHistoryEntriesYesterday(buckets.yesterday.map(mapSessionToEntry));

    const archiveNames: string[] = [];
    Object.entries(buckets.monthly)
      .sort(([keyA], [keyB]) => (keyA > keyB ? -1 : 1))
      .forEach(([month, items]) => {
        archiveNames.push(`${month} (${items.length})`);
      });
    if (buckets.last7Days.length) {
      archiveNames.unshift(`Previous 7 days (${buckets.last7Days.length})`);
    }
    setHistoryGroups(archiveNames);
  }, [storedSessions, sessionId, handleSelectSession, sidebarSearch]);

  useEffect(() => {
    if (hasInitializedSession || sessionId || messages.length > 0 || !storedSessions.length) {
      return;
    }

    const [latest] = storedSessions;
    if (!latest) return;
    setHasInitializedSession(true);
    handleSelectSession(latest.sessionId);
  }, [storedSessions, sessionId, messages.length, handleSelectSession, hasInitializedSession]);

  const lastMessage = messages.at(-1);
  const hasMessages = messages.length > 0;
  const placeholder = useMemo(() => {
    if (!messages.length) {
      return "Ask Street Bot to find resource information, draft messages, or plan outreach.";
    }
    if (lastMessage?.role === "assistant") {
      return "What would you like to ask next?";
    }
    return "Type your follow-up for Street Bot";
  }, [messages, lastMessage]);

  const contentWrapperStyle = useMemo<CSSProperties>(() => {
    return {
      ...contentWrapperBaseStyle,
      paddingLeft: isSidebarOpen
        ? layout.sidebarWidth + layout.contentGap
        : layout.pagePaddingLeft,
      transition: "padding-left 0.3s ease",
    };
  }, [isSidebarOpen]);

  const chatListRef = useRef<HTMLUListElement | null>(null);
  const chatScrollAnchorRef = useRef<HTMLLIElement | null>(null);

  const composerContainerStyle = useMemo<CSSProperties>(() => {
    return {
      ...composerContainerBaseStyle,
      left: isSidebarOpen
        ? `calc(50% + ${(layout.sidebarWidth + layout.contentGap) / 2}px)`
        : "50%",
      transform: "translateX(-50%)",
      transition: "left 0.3s ease",
    };
  }, [isSidebarOpen]);

  const headerVersionStyle = useMemo<CSSProperties>(() => {
    return {
      ...versionLabelStyle,
      ...versionLabelTransitionStyle,
      opacity: 1,
      transform: isSidebarOpen ? "translateX(0)" : "translateX(-8px)",
    } satisfies CSSProperties;
  }, [isSidebarOpen]);

  const topBarStyle = useMemo<CSSProperties>(() => {
    const openInset = 24;
    const collapsedInset = 16;
    const paddingLeft = isSidebarOpen
      ? layout.sidebarWidth + openInset
      : layout.compactSidebarWidth + collapsedInset;
    return {
      ...topBarBaseStyle,
      paddingLeft,
      paddingRight: layout.pagePaddingRight,
      height: layout.topBarHeight,
      boxSizing: "border-box",
    } satisfies CSSProperties;
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!messages.length) return;
    if (typeof window === "undefined") return;

    const rafId = window.requestAnimationFrame(() => {
      const list = chatListRef.current;
      const anchor = chatScrollAnchorRef.current;
      const listNeedsScroll =
        list && Math.abs(list.scrollHeight - list.clientHeight) > 1 && list.scrollHeight > list.clientHeight;

      if (listNeedsScroll && list) {
        if (typeof list.scrollTo === "function") {
          list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
        } else {
          list.scrollTop = list.scrollHeight;
        }
        return;
      }

      if (anchor) {
        anchor.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
        return;
      }

      const scrollTarget = document.scrollingElement ?? document.documentElement;
      const maxScrollTop = scrollTarget.scrollHeight - window.innerHeight;
      window.scrollTo({ top: maxScrollTop > 0 ? maxScrollTop : scrollTarget.scrollHeight, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [messages]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };

    const storedUserMessage: StoredMessage = {
      id: userMessage.id,
      role: "user",
      content: userMessage.content,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");

    const loadingMessageId = `${userMessage.id}-loading`;
    const dynamicLoadingMessage = getLoadingMessage(userMessage.content);

    if (process.env.NODE_ENV !== "production") {
      console.log("Street Bot ▶ Loading message", dynamicLoadingMessage);
    }

    setMessages((prev) => [
      ...prev,
      {
        id: loadingMessageId,
        role: "assistant",
        content: dynamicLoadingMessage,
        variant: "callout",
      },
    ]);

    const currentSessionId = sessionId;
    if (currentSessionId) {
      setStoredSessions((prev) => {
        const existing = prev.find((session) => session.sessionId === currentSessionId);
        if (!existing) {
          return prev;
        }
        if (existing.messages.some((message) => message.id === storedUserMessage.id)) {
          return prev;
        }

        const updatedSession: StoredSession = {
          ...existing,
          messages: [...existing.messages, storedUserMessage],
          updatedAt: storedUserMessage.createdAt,
        };

        const nextSessions = sortSessionsByUpdated(
          prev.map((session) => (session.sessionId === currentSessionId ? updatedSession : session)),
        );
        writeStoredSessions(nextSessions);
        return nextSessions;
      });
    }

    startTransition(async () => {
      if (!agent) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${userMessage.id}-missing-agent`,
            role: "system",
            content:
              "Street Bot isn't connected to an agent yet. Set NEXT_PUBLIC_AGENT_URL and reload to chat.",
            variant: "callout",
          },
        ]);
        return;
      }

      try {
        const agentMessages = toAgentMessages(nextMessages);
        const runConfig = {
          messages: agentMessages as any,
          ...(sessionId ? { sessionId } : {}),
        };

        if (process.env.NODE_ENV !== "production") {
          console.log(
            "Street Bot ▶ Sending Agent UGI payload",
            JSON.stringify(runConfig, null, 2),
          );
        }

        const response = await fetch(agent.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(runConfig),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody || response.statusText}`);
        }

        const payload = (await response.json()) as RunAgentResponsePayload;

        if (process.env.NODE_ENV !== "production") {
          console.log(
            "Street Bot ◀ Received Agent UGI response",
            JSON.stringify(payload, null, 2),
          );
        }

        const maybeSessionId = payload.sessionId;
        if (maybeSessionId) {
          setSessionId(maybeSessionId);
        }

        const assistantMessages = (payload?.newMessages ?? []).map((message, index) => {
          const metadata = message.metadata;
          const rawServiceGroups = metadata?.tools?.service_lookup;
          const serviceGroups: ServiceLookupMetadata[] = Array.isArray(rawServiceGroups)
            ? rawServiceGroups
            : [];

          const role =
            message.role === "user" || message.role === "assistant"
              ? message.role
              : "assistant";

          return {
            id: `${userMessage.id}-assistant-${index}`,
            role: role as ChatMessage["role"],
            content: "content" in message ? extractText(message.content) : "",
            metadata,
            variant: serviceGroups.length > 0 ? "callout" : undefined,
            serviceGroups,
            nextActions: metadata?.nextActions ?? [],
            needsIdentified: metadata?.needsIdentified ?? [],
          } satisfies ChatMessage;
        });

        setMessages((prev) => {
          const withoutLoading = prev.filter((message) => message.id !== loadingMessageId);
          if (!assistantMessages.length) {
            return withoutLoading;
          }
          return [...withoutLoading, ...assistantMessages];
        });

        setStoredSessions((prev) => {
          if (!maybeSessionId) {
            return prev;
          }

          const now = new Date().toISOString();
          const existing = prev.find((session) => session.sessionId === maybeSessionId);
          const storedUserMessage: StoredMessage = {
            id: userMessage.id,
            role: "user",
            content: userMessage.content,
            createdAt: now,
          };
          const nextSession: StoredSession = {
            sessionId: maybeSessionId,
            title:
              existing?.title ??
              getDefaultSessionTitle(messages.find((msg) => msg.role === "user")?.content ?? userMessage.content),
            messages: [
              ...(existing?.messages ?? []),
              storedUserMessage,
              ...assistantMessages.map((assistantMessage) => ({
                id: assistantMessage.id,
                role: assistantMessage.role,
                content: assistantMessage.content,
                metadata: assistantMessage.metadata,
                serviceGroups: assistantMessage.serviceGroups,
                nextActions: assistantMessage.nextActions,
                needsIdentified: assistantMessage.needsIdentified,
                createdAt: now,
              })),
            ],
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          };

          const nextSessions = upsertSession(prev, nextSession).sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );

          writeStoredSessions(nextSessions);
          return nextSessions;
        });
      } catch (error) {
        console.error("Street Bot request failed", error);
        setMessages((prev) => {
          const withoutLoading = prev.filter((message) => message.id !== loadingMessageId);
          return [
            ...withoutLoading,
            {
              id: `${userMessage.id}-error`,
              role: "system",
              content:
                "We couldn't reach the Street Bot service. Check your agent URL or try again.",
              variant: "callout",
            },
          ];
        });
      }
    });
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setInput("");
  };

  return (
    <div
      className="min-h-screen text-white"
      style={{ backgroundColor: palette.background, position: "relative" }}
    >
      <style dangerouslySetInnerHTML={{ __html: globalResponsiveStyles }} />
      {!isSidebarOpen ? (
        <nav style={compactSidebarPanelStyle} aria-label="Collapsed sidebar">
          <div style={compactHeaderRowStyle}>
            <Image src="/streetbot/logo-mark.svg" alt="Street Bot" width={28} height={28} priority />
          </div>
          <div style={compactHeaderActionsStyle}>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              style={compactIconButtonStyle}
              aria-label="Open sidebar"
            >
              <Image src="/streetbot/icon-sidebar.svg" alt="Open sidebar" width={16} height={16} />
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              style={compactIconButtonStyle}
              aria-label="Start new chat"
            >
              <Image src="/streetbot/icon-edit.svg" alt="New chat" width={16} height={16} />
            </button>
          </div>
        </nav>
      ) : null}
      <header style={topBarStyle}>
        <div style={topBarInnerStyle}>
          <span style={headerVersionStyle} aria-hidden={!isSidebarOpen}>
            Street Bot 0.5
          </span>
        </div>
      </header>
      <div className="w-full content-wrapper" style={contentWrapperStyle}>
        {isSidebarOpen ? (
          <aside
            className="sidebar-panel flex flex-col justify-between border"
            style={{
              ...sidebarPanelStyle,
              borderRadius: layout.sidebarRadius,
              width: layout.sidebarWidth,
              position: "absolute",
              top: 0,
              left: 0,
              bottom: layout.composerBottomOffset,
            }}
          >
          <div className="space-y-7">
            <header className="flex items-center justify-between">
              <Image src="/streetbot/logo-mark.svg" alt="Street Bot" width={32} height={32} priority />
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                style={sidebarToggleButtonStyle}
                aria-label="Collapse sidebar"
              >
                <Image src="/streetbot/icon-sidebar.svg" alt="Collapse sidebar" width={15} height={15} />
              </button>
            </header>

            <button type="button" style={newChatButtonStyle} onClick={handleNewChat}>
              <Image src="/streetbot/icon-edit.svg" alt="Compose" width={14} height={14} />
              <span>New chat</span>
            </button>

            <div style={sidebarSearchStyle}>
              <span style={sidebarSearchIconStyle} aria-hidden>
                <Image src="/streetbot/icon-search.svg" alt="" width={14} height={14} />
              </span>
              <input
                type="search"
                value={sidebarSearch}
                onChange={(event) => setSidebarSearch(event.target.value)}
                placeholder="Search chats"
                style={sidebarSearchInputStyle}
              />
            </div>

            <div className="space-y-5">
              {sidebarSearch && !searchResults.length ? (
                <p
                  style={{
                    color: palette.textSecondary,
                    fontSize: "12px",
                    fontFamily: "Rubik, sans-serif",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  No matches found
                </p>
              ) : null}

              {searchResults.length ? (
                <HistorySection title="Search results" entries={searchResults} />
              ) : (
                <>
                  {historyEntriesToday.length ? (
                    <HistorySection title="Today" entries={historyEntriesToday} />
                  ) : null}
                  {historyEntriesYesterday.length ? (
                    <HistorySection title="Yesterday" entries={historyEntriesYesterday} />
                  ) : null}
                  {historyGroups.length ? <ArchiveSection groups={historyGroups} /> : null}
                </>
              )}
            </div>
          </div>

          <footer
            className="flex items-center justify-between rounded-3xl border px-3 py-2"
            style={surfaceCardStyle}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: "#23242E", letterSpacing: "0.04em" }}
              >
                JA
              </span>
              <div>
                <p
                  style={{
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontFamily: "Rubik, sans-serif",
                    fontWeight: 500,
                    letterSpacing: "0.01em",
                  }}
                >
                  Jessica Ali
                </p>
                <p
                  style={{
                    color: palette.textSecondary,
                    fontSize: "10px",
                    fontFamily: "Rubik, sans-serif",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Case Lead
                </p>
              </div>
            </div>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2F313C] text-base"
              aria-label="More options"
            >
              ···
            </button>
          </footer>
          </aside>
        ) : null}
        <div className="flex flex-col chat-container" style={chatContainerStyle}>
          <main className="flex flex-1 flex-col justify-between" style={mainPanelStyle}>
            <div
              className={`flex flex-1 flex-col ${
                hasMessages ? "space-y-6" : "items-center justify-center text-center"
              }`}
              style={{ padding: `${layout.mainPaddingY}px ${layout.mainPaddingX}px 0` }}
            >
              {hasMessages ? (
                <>
                  <ul ref={chatListRef} className="overflow-y-auto pr-2">
                  {messages.map((message, index) => {
                    const isLast = index === messages.length - 1;
                    const serviceGroups = message.serviceGroups ?? [];
                    const hasNextActions = Boolean(message.nextActions && message.nextActions.length);
                    const hasNeeds = Boolean(message.needsIdentified && message.needsIdentified.length);

                    return (
                      <li key={`${message.id}-${index}`} style={getMessageContainerStyle(message, isLast)}>
                        <div style={messageBodyStyle}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>

                        {hasNeeds ? (
                          <div>
                            <p style={metadataLabelStyle}>Needs Identified</p>
                            <ul style={metadataListStyle}>
                              {message.needsIdentified!.map((need) => (
                                <li key={`${message.id}-need-${need}`}>{need}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {hasNextActions ? (
                          <div>
                            <p style={metadataLabelStyle}>Suggested Next Steps</p>
                            <ul style={metadataListStyle}>
                              {message.nextActions!.map((action, actionIndex) => (
                                <li key={`${message.id}-action-${actionIndex}`}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {serviceGroups.length > 0
                          ? serviceGroups.map((group, groupIndex) => {
                              const services = group.services ?? [];
                              const remainingCount =
                                typeof group.totalFound === "number"
                                  ? Math.max(group.totalFound - services.length, 0)
                                  : 0;

                              return (
                                <div
                                  key={`${message.id}-service-group-${groupIndex}-${group.category ?? "any"}`}
                                  style={serviceGroupStyle}
                                >
                                  <div style={serviceHeaderStyle}>
                                    {group.category ? `${group.category} options` : "Service options"}
                                  </div>
                                  {group.location ? (
                                    <p style={serviceMetaTextStyle}>Serving: {group.location}</p>
                                  ) : null}

                                  {services.map((service, serviceIndex) => {
                                    const website = service.website ?? service.detailUrl;
                                    const showDivider = serviceIndex < services.length - 1;

                                    return (
                                      <div
                                        key={`${message.id}-service-${groupIndex}-${serviceIndex}-${service.id ?? "no-id"}`}
                                        style={{
                                          ...serviceItemStyle,
                                          borderBottom: showDivider
                                            ? "1px solid rgba(188, 189, 208, 0.12)"
                                            : "none",
                                          paddingBottom: showDivider ? 12 : 0,
                                        }}
                                      >
                                        {service.name ? (
                                          <div style={serviceNameStyle}>
                                            {serviceIndex + 1}. {service.name}
                                          </div>
                                        ) : null}
                                        {service.address ? (
                                          <p style={serviceMetaTextStyle}>Address: {service.address}</p>
                                        ) : null}
                                        {service.phoneNumber ? (
                                          <p style={serviceMetaTextStyle}>Phone: {service.phoneNumber}</p>
                                        ) : null}
                                        {service.email ? (
                                          <p style={serviceMetaTextStyle}>Email: {service.email}</p>
                                        ) : null}
                                        {website ? (
                                          <p style={serviceMetaTextStyle}>
                                            Website: {" "}
                                            <a
                                              href={website}
                                              target="_blank"
                                              rel="noreferrer noopener"
                                              style={serviceLinkStyle}
                                            >
                                              {website}
                                            </a>
                                          </p>
                                        ) : null}
                                        {service.overview ? (
                                          <p style={serviceMetaTextStyle}>{service.overview}</p>
                                        ) : null}
                                        {service.tags && service.tags.length ? (
                                          <div>
                                            {service.tags.map((tag) => (
                                              <span key={`${service.id ?? serviceIndex}-tag-${tag}`} style={serviceTagStyle}>
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}

                                  {remainingCount > 0 ? (
                                    <p style={{ ...serviceMetaTextStyle, marginTop: 12 }}>
                                      …and {remainingCount} more option(s) available.
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })
                          : null}
                      </li>
                    );
                  })}
                  </ul>
                  <div
                    ref={chatScrollAnchorRef}
                    aria-hidden="true"
                    style={{ height: 1, margin: 0, padding: 0 }}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <Image
                    src="/streetbot/hero-illustration.svg"
                    alt="Street Bot"
                    width={layout.heroIllustrationWidth}
                    height={layout.heroIllustrationHeight}
                    priority
                    className="hero-illustration"
                  />
                  <p
                    style={{
                      color: palette.textPrimary,
                      fontSize: "16px",
                      fontFamily: "Rubik, sans-serif",
                      lineHeight: "30px",
                      maxWidth: layout.heroDescriptionMax,
                      marginTop: `${layout.heroDescriptionSpacing}px`,
                    }}
                  >
                    Street Bot is a Social Work bot that was created by Street Voices in order to
                    help connect users with free and subsidized services.
                  </p>
                  <p
                    className="uppercase"
                    style={{
                      color: palette.textSecondary,
                      fontSize: "12px",
                      fontFamily: "Rubik, sans-serif",
                      letterSpacing: "0.38em",
                      marginTop: `${layout.heroExamplesLabelSpacing}px`,
                    }}
                  >
                    Examples
                  </p>
                  <div
                    className="mt-5 flex flex-col items-center gap-3 md:flex-row"
                    style={{ columnGap: layout.promptSpacing, rowGap: layout.promptSpacing }}
                  >
                    {EXAMPLE_PROMPTS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleExampleClick(item)}
                        className="rounded-full border px-6 py-3 text-sm"
                        style={quickButtonStyle}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
        <div className="composer-container" style={composerContainerStyle}>
          <form
            onSubmit={handleSubmit}
            className="flex w-full items-center rounded-full border"
            style={{
              ...inputWrapperStyle,
              columnGap: layout.composerGap,
              maxWidth: layout.composerMaxWidth,
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent placeholder:text-[#60616F] focus:outline-none"
              style={{
                color: palette.textPrimary,
                fontSize: "16px",
                fontFamily: "Rubik, sans-serif",
              }}
            />
            <button
              type="button"
              className="flex items-center justify-center rounded-full bg-transparent"
              style={{
                color: palette.textSecondary,
              }}
              aria-label="Record audio"
            >
              <Image src="/streetbot/icon-mic.svg" alt="Microphone" width={18} height={25} />
            </button>
            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="flex items-center justify-center rounded-full text-lg transition disabled:cursor-not-allowed disabled:opacity-60"
              style={sendButtonStyle}
            >
              <span style={{ transform: "translateX(2px)", fontSize: "18px" }}>➤</span>
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

function extractText(content: unknown) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part !== "object" || part === null) return "";
      const maybeText = (part as { text?: string }).text;
      if (typeof maybeText === "string") return maybeText;
      const children = (part as { children?: Array<{ text?: string }> }).children;
      if (Array.isArray(children)) {
        return children
          .map((child) => (typeof child?.text === "string" ? child.text : ""))
          .join("");
      }
      return "";
    })
    .join("\n");
}
