"use client";

import { createContext, useContext, useMemo } from "react";
import { HttpAgent } from "@ag-ui/client";

type HttpAgentContextValue = HttpAgent | null;

const HttpAgentContext = createContext<HttpAgentContextValue>(null);

export function AguiProvider({ children }: { children: React.ReactNode }) {
  const agentUrl = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_AGENT_URL?.trim();
    if (envUrl) {
      return envUrl;
    }

    if (typeof window === "undefined") {
      return undefined;
    }

    try {
      const current = new URL(window.location.href);
      const isDevPort = current.port === "3000";
      const base = isDevPort
        ? `${current.protocol}//${current.hostname}:8000`
        : current.origin;

      return `${base.replace(/\/$/, "")}/agui/run-agent`;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to derive Agent URL from window.location", error);
      }
      return undefined;
    }
  }, []);

  const agent = useMemo<HttpAgentContextValue>(() => {
    if (!agentUrl) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "NEXT_PUBLIC_AGENT_URL is not set. Street Bot UI will render in read-only mode.",
        );
      }
      return null;
    }
    return new HttpAgent({ url: agentUrl });
  }, [agentUrl]);

  return <HttpAgentContext.Provider value={agent}>{children}</HttpAgentContext.Provider>;
}

export function useHttpAgent() {
  return useContext(HttpAgentContext);
}
