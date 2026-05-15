export type ChatContextWidgetType =
  | "kpi_card"
  | "scorecard_grid"
  | "stat_list"
  | "data_table"
  | "bar_chart"
  | "product_card"
  | "alert_card";

export type ChatOpenContext = {
  source?: string;
  title?: string;
  description?: string;
  defaultPrompt?: string;
  href?: string;
  signalId?: string;
  actionPlanId?: string;
  objectType?: string;
  objectId?: string;
  widgetType?: ChatContextWidgetType;
  dataSummary?: string;
};

export type AssistantSuggestion = {
  label: string;
  prompt: string;
  detail?: string;
};

export type ChatContextKind =
  | "action_plan"
  | "alert_widget"
  | "bar_chart_widget"
  | "connection"
  | "data_table_widget"
  | "evidence"
  | "kpi_widget"
  | "lifecycle"
  | "product_widget"
  | "recommendation"
  | "scorecard_widget"
  | "signal"
  | "stat_list_widget"
  | "store_overview";

export type AssistantFocusBriefContent = {
  sourceLabel: string;
  secondaryLabel: string | null;
  actionTitle: string;
  flow: [string, string, string];
};

export function resolveChatContextKind(
  context: ChatOpenContext,
): ChatContextKind {
  const source = context.source ?? "";
  const objectType = context.objectType ?? "";
  const title = (context.title ?? "").toLowerCase();

  if (source === "topbar" || objectType === "store_overview") {
    return "store_overview";
  }

  if (source === "connection-card" || objectType === "connection") {
    return "connection";
  }

  if (context.widgetType === "kpi_card") return "kpi_widget";
  if (context.widgetType === "scorecard_grid") return "scorecard_widget";
  if (context.widgetType === "stat_list") return "stat_list_widget";
  if (context.widgetType === "data_table") return "data_table_widget";
  if (context.widgetType === "bar_chart") return "bar_chart_widget";
  if (context.widgetType === "product_card") return "product_widget";
  if (context.widgetType === "alert_card") return "alert_widget";

  if (
    objectType === "action_plan" ||
    source === "action-card" ||
    title.includes("action plan")
  ) {
    return "action_plan";
  }

  if (
    source === "signal-facts" ||
    objectType === "signal_facts" ||
    (source === "signal-section" && title.includes("evidence")) ||
    (source === "signal-section" && title.includes("what happened"))
  ) {
    return "evidence";
  }

  if (objectType === "recommendation" || title.includes("recommended")) {
    return "recommendation";
  }

  if (
    objectType === "signal_lifecycle_step" ||
    objectType === "signal_path_step" ||
    objectType === "signal_mutation_path" ||
    objectType === "next_action" ||
    source === "signal-lifecycle" ||
    source === "signal-path-panel" ||
    source === "signal-next-action"
  ) {
    return "lifecycle";
  }

  return "signal";
}

export function buildChatContextSourceLabel(source: string | undefined) {
  if (source === "today-trend-card") return "Trend";
  if (source === "today-lead-insight") return "Main";
  if (source === "today-memory-card") return "Signal";
  if (source === "signal-card") return "Signal";
  if (source === "signal-detail-hero") return "Signal";
  if (source === "action-card") return "Action";
  if (source === "connection-card") return "Data";
  if (source === "signal-section") return "Detail";
  if (source === "signal-lifecycle") return "Step";
  if (source === "signal-next-action") return "Next";
  if (source === "signal-facts") return "Facts";
  if (source === "signal-path-panel") return "Flow";
  if (source === "chat-widget") return "Widget";
  if (source === "empty-state") return "Empty state";
  if (source === "page") return "Page";

  return "Ask";
}

export function buildFocusBriefContent(
  context: ChatOpenContext,
): AssistantFocusBriefContent {
  const kind = resolveChatContextKind(context);
  const sourceLabel = buildChatContextSourceLabel(context.source);

  if (kind === "action_plan") {
    return {
      sourceLabel: "Action",
      secondaryLabel: "Plan",
      actionTitle: "Move the plan forward",
      flow: ["Review", "Approve", "Execute"],
    };
  }

  if (kind === "connection") {
    return {
      sourceLabel: "Data",
      secondaryLabel: "Connection",
      actionTitle: "Check data coverage",
      flow: ["Source", "Coverage", "Sync"],
    };
  }

  if (kind === "evidence") {
    return {
      sourceLabel,
      secondaryLabel: context.signalId ? "Signal" : null,
      actionTitle: "Check the proof",
      flow: ["Facts", "Examples", "Decision"],
    };
  }

  if (kind === "recommendation") {
    return {
      sourceLabel,
      secondaryLabel: context.signalId ? "Signal" : null,
      actionTitle: "Turn advice into a plan",
      flow: ["Why", "Risk", "Plan"],
    };
  }

  if (kind === "lifecycle") {
    return {
      sourceLabel: "Step",
      secondaryLabel: context.signalId ? "Signal" : null,
      actionTitle: "Understand this step",
      flow: ["State", "Blocker", "Move"],
    };
  }

  if (kind === "product_widget") {
    return {
      sourceLabel: "Product",
      secondaryLabel: "Widget",
      actionTitle: "Inspect product evidence",
      flow: ["Product", "Sales", "Inventory"],
    };
  }

  if (kind === "kpi_widget") {
    return {
      sourceLabel: "Metric",
      secondaryLabel: "Widget",
      actionTitle: "Explain the metric",
      flow: ["Metric", "Cause", "Action"],
    };
  }

  if (kind === "scorecard_widget") {
    return {
      sourceLabel: "Scorecard",
      secondaryLabel: "Widget",
      actionTitle: "Read the scorecard",
      flow: ["Compare", "Driver", "Risk"],
    };
  }

  if (kind === "stat_list_widget") {
    return {
      sourceLabel: "Stats",
      secondaryLabel: "Widget",
      actionTitle: "Read the stats",
      flow: ["Values", "Pattern", "Next read"],
    };
  }

  if (kind === "data_table_widget") {
    return {
      sourceLabel: "Table",
      secondaryLabel: "Widget",
      actionTitle: "Find the important rows",
      flow: ["Rows", "Pattern", "Check"],
    };
  }

  if (kind === "bar_chart_widget") {
    return {
      sourceLabel: "Chart",
      secondaryLabel: "Widget",
      actionTitle: "Find the driver",
      flow: ["Ranking", "Driver", "Risk"],
    };
  }

  if (kind === "alert_widget") {
    return {
      sourceLabel: "Alert",
      secondaryLabel: "Widget",
      actionTitle: "Resolve the alert",
      flow: ["Meaning", "Evidence", "Move"],
    };
  }

  return {
    sourceLabel,
    secondaryLabel: context.signalId ? "Signal" : null,
    actionTitle: "Choose a focused question",
    flow: ["Signal", "Evidence", "Action"],
  };
}

export function describeDirectSuggestion(label: string) {
  if (label === "Explain") return "Plain-language meaning and why it matters.";
  if (label === "Show data") return "Connected facts behind this selection.";
  if (label === "Next step") return "Safest review, approval, or follow-up.";
  if (label === "Key rows") return "Rows that carry the decision.";
  if (label === "Main driver") return "Largest contributor or movement.";
  if (label === "Risk check") return "What could make this unsafe to act on.";

  return "Ask about this selection.";
}

export function buildDirectSuggestions(
  context: ChatOpenContext,
): AssistantSuggestion[] {
  const title = context.title ?? "this item";
  const kind = resolveChatContextKind(context);

  if (kind === "action_plan") {
    return [
      {
        label: "Review plan",
        detail: "What the plan will do and what it will not do.",
        prompt: `Review this ActionPlan for ${title}. Tell me what it does, what it will not change automatically, and what must happen before execution.`,
      },
      {
        label: "Approval",
        detail: "Whether the exact payload can be locked.",
        prompt: `Can this ActionPlan for ${title} be approved now? Explain the exact approval condition and any blocker.`,
      },
      {
        label: "Execution",
        detail: "Where the run step is blocked or ready.",
        prompt: `Can this ActionPlan for ${title} be executed now? If not, give the exact blocker and the next operator action.`,
      },
    ];
  }

  if (kind === "connection") {
    return [
      {
        label: "Readable data",
        detail: "What Ora can safely inspect from this source.",
        prompt: `What can Ora read from ${title}, and which Signal questions can that data support?`,
      },
      {
        label: "Sync status",
        detail: "Whether the source looks current enough.",
        prompt: `Check the connection context for ${title}. What sync or coverage risk should I care about before trusting the data?`,
      },
      {
        label: "Best next read",
        detail: "The most useful read-only question for this source.",
        prompt: `What is the best next read-only question to ask about ${title} inside the Signal flow?`,
      },
    ];
  }

  if (kind === "evidence") {
    return [
      {
        label: "Key facts",
        detail: "Summarize the proof without repeated text.",
        prompt: `Summarize the key evidence for ${title}. Group repeated records and keep only the facts that prove or weaken the Signal.`,
      },
      {
        label: "Examples",
        detail: "Show concrete affected products or records.",
        prompt: `Show the concrete examples behind ${title}. Keep the list short and explain why each example matters.`,
      },
      {
        label: "Validate",
        detail: "What connected data should confirm it.",
        prompt: `What connected data should I check to validate the evidence for ${title}?`,
      },
    ];
  }

  if (kind === "recommendation") {
    return [
      {
        label: "Why this",
        detail: "Reasoning, risk, and expected impact.",
        prompt: `Explain why this recommendation is the right move for ${title}. Include risk and confidence.`,
      },
      {
        label: "Plan from it",
        detail: "How it becomes one exact action.",
        prompt: `How should this recommendation become an ActionPlan for ${title}? Keep it to one exact operator action.`,
      },
      {
        label: "Risk check",
        detail: "What could go wrong before approval.",
        prompt: `What should I check before approving work based on this recommendation for ${title}?`,
      },
    ];
  }

  if (kind === "lifecycle") {
    return [
      {
        label: "Current state",
        detail: "What this workflow step means now.",
        prompt: `Explain the current ${title} step in the Signal flow and what state it is in.`,
      },
      {
        label: "Blocker",
        detail: "The thing preventing the next step.",
        prompt: `What blocks the ${title} step from moving forward? Be specific.`,
      },
      {
        label: "Move forward",
        detail: "The next concrete operator action.",
        prompt: `What is the next concrete move for the ${title} step? Include approval or execution constraints if relevant.`,
      },
    ];
  }

  if (kind === "product_widget") {
    return [
      {
        label: "Product read",
        detail: "Use the selected product facts first.",
        prompt: `Explain the product context for ${title}. Use the selected product facts first, then say which connected read would validate demand or risk.`,
      },
      {
        label: "Sales evidence",
        detail: "Orders, revenue, and units behind it.",
        prompt: `Show sales evidence for ${title}. Include revenue, units, and the date window used.`,
      },
      {
        label: "Inventory risk",
        detail: "Stock or variant issues that affect action.",
        prompt: `Check inventory risk for ${title}. Focus on stock, variants, and whether action is blocked.`,
      },
    ];
  }

  if (kind === "kpi_widget") {
    return [
      {
        label: "Explain KPI",
        detail: "Meaning, movement, and operational weight.",
        prompt: `Explain this KPI for ${title}. Use the selected metric value and call out why it matters operationally.`,
      },
      {
        label: "Main driver",
        detail: "What likely caused the number.",
        prompt: `What likely drove the ${title} KPI, and what connected data should confirm it?`,
      },
      {
        label: "Next step",
        detail: "The safest review or action-plan move.",
        prompt: `What should I review next because of the ${title} KPI? Keep it inside the Signal flow.`,
      },
    ];
  }

  if (kind === "scorecard_widget") {
    return [
      {
        label: "Read scorecard",
        detail: "Which metrics matter together.",
        prompt: `Read this scorecard for ${title}. Compare the selected metrics and tell me what matters most.`,
      },
      {
        label: "Main driver",
        detail: "Largest movement or strongest signal.",
        prompt: `Which metric in ${title} is the strongest driver, and what should I inspect to validate it?`,
      },
      {
        label: "Risk check",
        detail: "What could make the scorecard misleading.",
        prompt: `What could be misleading in this ${title} scorecard before I turn it into an action?`,
      },
    ];
  }

  if (kind === "stat_list_widget") {
    return [
      {
        label: "Read stats",
        detail: "Meaning of the listed values.",
        prompt: `Explain these stats for ${title}. Use the selected values and name the useful next read.`,
      },
      {
        label: "Compare values",
        detail: "Which value changes the decision.",
        prompt: `Which value in ${title} matters most, and why?`,
      },
      {
        label: "Next data",
        detail: "The read that confirms the pattern.",
        prompt: `What connected data should I inspect next to validate ${title}?`,
      },
    ];
  }

  if (kind === "data_table_widget") {
    return [
      {
        label: "Key rows",
        detail: "Rows that carry the decision.",
        prompt: `Identify the key rows in ${title}. Use the selected table rows and explain why those rows matter.`,
      },
      {
        label: "Pattern",
        detail: "The relationship across the rows.",
        prompt: `What pattern do you see in this ${title} table, and what should I not overread?`,
      },
      {
        label: "Validate",
        detail: "The connected read that should confirm it.",
        prompt: `What connected data would validate the pattern in ${title}?`,
      },
    ];
  }

  if (kind === "bar_chart_widget") {
    return [
      {
        label: "Main pattern",
        detail: "What the ranking or movement says.",
        prompt: `Explain the main pattern in ${title}. Use the selected chart values and call out the driver.`,
      },
      {
        label: "Top driver",
        detail: "The bar that changes the decision.",
        prompt: `Which item drives ${title}, and what connected data should I inspect for it?`,
      },
      {
        label: "Risk check",
        detail: "What the chart might hide.",
        prompt: `What risk or missing context could make this ${title} chart misleading?`,
      },
    ];
  }

  if (kind === "alert_widget") {
    return [
      {
        label: "Why it matters",
        detail: "Meaning, severity, and impact.",
        prompt: `Explain this alert for ${title}. Say why it matters and what it affects.`,
      },
      {
        label: "Evidence",
        detail: "Facts that prove or weaken it.",
        prompt: `What evidence supports this alert for ${title}, and what should I verify?`,
      },
      {
        label: "Next step",
        detail: "The safest review or action-plan move.",
        prompt: `What is the next safe step for this alert about ${title}?`,
      },
    ];
  }

  return [
    {
      label: "Explain",
      detail: "Plain-language meaning and why it matters.",
      prompt:
        context.defaultPrompt ??
        `Explain ${title} in operator terms and keep it practical.`,
    },
    {
      label: "Evidence",
      detail: "Facts that prove or weaken this.",
      prompt: `Show the connected data behind ${title}. Keep only the facts needed to validate it.`,
    },
    {
      label: "Next action",
      detail: "The safest review, approval, or run step.",
      prompt: `What is the next safe step for ${title}? Include approval or execution constraints if relevant.`,
    },
  ];
}
