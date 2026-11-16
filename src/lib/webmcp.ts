// WebMCP (https://webmachinelearning.github.io/webmcp/): a page can offer tools to
// the AI agent of the browser. The API is a W3C Community Group draft in a Chrome
// origin trial (Chrome 149+, token in PUBLIC_WEBMCP_OT_TOKEN), so everything here is
// feature-detected and does nothing where it is missing.

export type ToolAnnotations = { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean };
export type Tool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: ToolAnnotations;
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
};
type ModelContext = { registerTool(tool: Tool, options?: { signal?: AbortSignal }): Promise<void> };

/** document.modelContext (the spec), or an early build's navigator.modelContext; null without WebMCP. */
export function modelContext(): ModelContext | null {
  const d = (globalThis as { document?: { modelContext?: ModelContext } }).document?.modelContext;
  const n = (globalThis as { navigator?: { modelContext?: ModelContext } }).navigator?.modelContext;
  const mc = d ?? n;
  return mc && typeof mc.registerTool === 'function' ? mc : null;
}

type AgentSubmit = SubmitEvent & { agentInvoked?: boolean; respondWith?: (p: Promise<unknown>) => void };

/**
 * A form an agent filled (declarative WebMCP: <form toolname>) and the person
 * submitted: tell the agent how it went. Call it in the submit handler, after
 * preventDefault(), with a promise of the message the page shows.
 */
export function agentReply(ev: Event, outcome: Promise<unknown>): void {
  const e = ev as AgentSubmit;
  if (e.agentInvoked && typeof e.respondWith === 'function') {
    try {
      e.respondWith(outcome);
    } catch {
      /* an older build without respondWith semantics: the page still shows the result */
    }
  }
}
