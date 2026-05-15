import { describe, expect, it } from "vitest";

import {
  directIntroForContext,
  suggestionsForContext,
} from "@/lib/chat/suggestions";

describe("suggestionsForContext", () => {
  it("returns exactly three suggestions for every supported source", () => {
    const sources = [
      "signal-detail-hero",
      "signal-lifecycle",
      "signal-path-panel",
      "signal-section",
      "signal-card",
      "action-card",
      "signal-next-action",
      "signal-facts",
      "empty-state",
      "page",
      "page-header",
      "topbar",
      "unknown-source",
    ];

    for (const source of sources) {
      const result = suggestionsForContext({ source, title: "Something" });
      expect(result.length, source).toBe(3);
      for (const suggestion of result) {
        expect(suggestion.label.length, source).toBeGreaterThan(0);
        expect(suggestion.prompt.length, source).toBeGreaterThan(0);
      }
    }
  });

  it("returns signal-aware questions for the signal hero", () => {
    const result = suggestionsForContext({
      source: "signal-detail-hero",
      title: "Best sellers are out of stock",
    });

    expect(result.map((item) => item.label)).toEqual([
      "Why it matters",
      "Top evidence",
      "Next safe step",
    ]);
    expect(result[0].prompt.toLowerCase()).toContain("signal");
  });

  it("returns step-specific questions for each lifecycle step", () => {
    const evidence = suggestionsForContext({
      source: "signal-lifecycle",
      title: "Evidence",
      description: "3 records",
    });
    expect(evidence.map((item) => item.label)).toEqual([
      "Strongest",
      "Reliability",
      "Gaps",
    ]);

    const approval = suggestionsForContext({
      source: "signal-lifecycle",
      title: "Approval",
      description: "Approved",
    });
    expect(approval.map((item) => item.label)).toEqual([
      "Why approval",
      "Exact payload",
      "Approval state",
    ]);
    expect(approval[2].prompt).toContain("Approved");

    const execution = suggestionsForContext({
      source: "signal-lifecycle",
      title: "Execution",
      description: "Not run",
    });
    expect(execution[0].prompt).toContain("Not run");

    const outcome = suggestionsForContext({
      source: "signal-lifecycle",
      title: "Outcome",
    });
    expect(outcome.map((item) => item.label)).toEqual([
      "What changed",
      "Measurement",
      "Enough?",
    ]);
  });

  it("returns section-specific questions for signal sections", () => {
    const evidence = suggestionsForContext({
      source: "signal-section",
      title: "Evidence",
    });
    expect(evidence.map((item) => item.label)).toEqual([
      "Strongest",
      "Reliability",
      "Gaps",
    ]);

    const recommended = suggestionsForContext({
      source: "signal-section",
      title: "Recommended action",
    });
    expect(recommended.map((item) => item.label)).toEqual([
      "Why this",
      "Risk",
      "Expected impact",
    ]);

    const approvalSection = suggestionsForContext({
      source: "signal-section",
      title: "Approval, execution, outcome",
    });
    expect(approvalSection.map((item) => item.label)).toEqual([
      "Approval",
      "Execution",
      "Outcome",
    ]);
  });

  it("returns approval/execution/outcome chips for action cards", () => {
    const result = suggestionsForContext({
      source: "action-card",
      title: "Restock kit",
    });

    expect(result.map((item) => item.label)).toEqual([
      "Approval",
      "Execution",
      "Outcome",
    ]);
    expect(result[0].prompt).toContain("Restock kit");
  });

  it("uses page-aware suggestions for page sources", () => {
    const today = suggestionsForContext({
      source: "page-header",
      href: "/today",
      title: "Signals that need attention now",
    });
    expect(today.map((item) => item.label)).toEqual([
      "Top Signal",
      "What's new",
      "Safe to skip",
    ]);

    const signals = suggestionsForContext({
      source: "page-header",
      href: "/signals",
      title: "Signal center",
    });
    expect(signals[0].label).toBe("By severity");

    const actions = suggestionsForContext({
      source: "page-header",
      href: "/actions",
      title: "Execution history",
    });
    expect(actions[0].label).toBe("Failures");

    const connections = suggestionsForContext({
      source: "page-header",
      href: "/connections",
      title: "Connections",
    });
    expect(connections[0].label).toBe("Sync status");

    const settings = suggestionsForContext({
      source: "page-header",
      href: "/settings",
      title: "Settings",
    });
    expect(settings[0].label).toBe("Members");

    const signalDetail = suggestionsForContext({
      source: "page-header",
      href: "/signals/abc",
      title: "Signal detail",
    });
    expect(signalDetail.map((item) => item.label)).toEqual([
      "Why matters",
      "Evidence",
      "Next step",
    ]);
  });

  it("returns onboarding-focused suggestions for empty states", () => {
    const result = suggestionsForContext({
      source: "empty-state",
      title: "No open Signals yet",
    });

    expect(result.map((item) => item.label)).toEqual([
      "Where to start",
      "Data needed",
      "Next move",
    ]);
  });

  it("uses object type for customer group context", () => {
    const result = suggestionsForContext({
      source: "signal-section",
      title: "Lapsed VIPs",
      objectType: "customer_group",
    });

    expect(result.map((item) => item.label)).toEqual([
      "Members",
      "Value",
      "Campaign fit",
    ]);
  });

  it("uses object type for recommendation and action plan", () => {
    const recommendation = suggestionsForContext({
      source: "unknown",
      objectType: "recommendation",
      title: "Restock",
    });
    expect(recommendation[0].label).toBe("Why this");

    const actionPlan = suggestionsForContext({
      source: "unknown",
      objectType: "action_plan",
      title: "Restock",
    });
    expect(actionPlan[0].label).toBe("Preview payload");
  });

  it("falls back to a generic three-option set when nothing matches", () => {
    const result = suggestionsForContext({
      source: "totally-unknown",
      title: "Mystery card",
    });

    expect(result.map((item) => item.label)).toEqual([
      "Explain",
      "Why it matters",
      "Next step",
    ]);
    expect(result[0].prompt).toContain("Mystery card");
  });

  it("uses defaultPrompt for the generic Explain prompt when provided", () => {
    const result = suggestionsForContext({
      source: "totally-unknown",
      title: "Whatever",
      defaultPrompt: "Custom prompt please",
    });

    expect(result[0].prompt).toBe("Custom prompt please");
  });
});

describe("directIntroForContext", () => {
  it("produces a tailored intro per source", () => {
    expect(
      directIntroForContext({ source: "signal-detail-hero", title: "X" }),
    ).toMatch(/Scoped to this Signal/i);

    expect(
      directIntroForContext({
        source: "signal-lifecycle",
        title: "Approval",
        description: "Approved",
      }),
    ).toContain("Approved");

    expect(
      directIntroForContext({
        source: "signal-section",
        title: "Evidence",
      }),
    ).toContain("Evidence");

    expect(
      directIntroForContext({ source: "action-card", title: "Restock kit" }),
    ).toContain("Restock kit");

    expect(
      directIntroForContext({ source: "signal-next-action", title: "Next" }),
    ).toMatch(/next action/i);

    expect(
      directIntroForContext({
        source: "empty-state",
        title: "No Signals yet",
      }),
    ).toContain("No Signals yet");

    expect(
      directIntroForContext({
        source: "page-header",
        title: "Today",
      }),
    ).toContain("Today");
  });

  it("falls back to a generic intro for unknown sources", () => {
    expect(
      directIntroForContext({
        source: "totally-unknown",
        title: "Mystery card",
      }),
    ).toContain("Mystery card");
  });
});
