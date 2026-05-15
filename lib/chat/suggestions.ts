export type ChatSuggestion = {
  label: string;
  prompt: string;
};

export type ChatSuggestionContext = {
  source?: string;
  title?: string;
  description?: string;
  defaultPrompt?: string;
  href?: string;
  signalId?: string;
  actionPlanId?: string;
  objectType?: string;
  objectId?: string;
};

export function suggestionsForContext(
  context: ChatSuggestionContext,
): ChatSuggestion[] {
  const source = (context.source ?? "").trim();
  const objectType = (context.objectType ?? "").trim();
  const title = (context.title ?? "this item").trim();

  if (source === "signal-detail-hero") {
    return [
      {
        label: "Why it matters",
        prompt:
          "Why does this Signal matter for the business? Explain impact and confidence in operator terms.",
      },
      {
        label: "Top evidence",
        prompt:
          "Show the strongest evidence behind this Signal and call out anything thin or missing.",
      },
      {
        label: "Next safe step",
        prompt:
          "What is the next safe step for this Signal — approve, review evidence, or wait for more data?",
      },
    ];
  }

  if (source === "signal-lifecycle" || source === "signal-path-panel") {
    return suggestionsForLifecycleStep(title, context.description);
  }

  if (source === "signal-section") {
    return suggestionsForSignalSection(title, objectType);
  }

  if (source === "signal-card") {
    return [
      {
        label: "Why it matters",
        prompt: `Why does this Signal matter operationally: "${title}"?`,
      },
      {
        label: "Top evidence",
        prompt: `Show the strongest evidence behind this Signal: "${title}".`,
      },
      {
        label: "Next step",
        prompt: `What's the next safe step for this Signal: "${title}"?`,
      },
    ];
  }

  if (source === "action-card") {
    return [
      {
        label: "Approval",
        prompt: `What is the approval state for "${title}" — who approved and when?`,
      },
      {
        label: "Execution",
        prompt: `What is the execution state for "${title}" — tool, status, and any errors?`,
      },
      {
        label: "Outcome",
        prompt: `What is the outcome for "${title}" — measured impact and verification?`,
      },
    ];
  }

  if (source === "signal-next-action") {
    return [
      {
        label: "Why next",
        prompt:
          "Why is this the next action for this Signal? What's blocking the other steps?",
      },
      {
        label: "What changes",
        prompt:
          "What will change for the store if I approve this exact payload?",
      },
      {
        label: "Unblock",
        prompt: "What do I need to do to unblock this next step?",
      },
    ];
  }

  if (source === "signal-facts") {
    return [
      {
        label: "Severity",
        prompt: "Why this severity? What would raise or lower it?",
      },
      {
        label: "Scope",
        prompt: "What is actually affected — be precise about the scope.",
      },
      {
        label: "Detection",
        prompt: "When was this detected and what scan or trigger produced it?",
      },
    ];
  }

  if (objectType === "customer_group") {
    return [
      {
        label: "Who's in here",
        prompt: `Who is in the "${title}" customer group and what defines membership?`,
      },
      {
        label: "Group value",
        prompt: `What is the estimated value and lifetime spend for the "${title}" group?`,
      },
      {
        label: "Campaign fit",
        prompt: `What campaign, flow, or audience would land best with the "${title}" group?`,
      },
    ];
  }

  if (objectType === "recommendation") {
    return [
      {
        label: "Why this",
        prompt:
          "Explain why this recommendation matters and how confident Ora is.",
      },
      {
        label: "Risk",
        prompt: "What are the risks of acting on this recommendation?",
      },
      {
        label: "Expected impact",
        prompt: "What is the expected impact if we follow it?",
      },
    ];
  }

  if (objectType === "action_plan") {
    return [
      {
        label: "Preview payload",
        prompt: "Show the exact payload this action plan would execute.",
      },
      {
        label: "Why this action",
        prompt: "Why is this the right action versus alternatives?",
      },
      {
        label: "Risk and impact",
        prompt: "What is the risk and expected impact of this action plan?",
      },
    ];
  }

  if (source === "empty-state") {
    return [
      {
        label: "Where to start",
        prompt: `Nothing is here yet for "${title}". What do I need to connect or set up first to fill this view?`,
      },
      {
        label: "Data needed",
        prompt: `What data does Ora need so "${title}" stops being empty?`,
      },
      {
        label: "Next move",
        prompt: `Given "${title}" is empty, what is the highest-leverage next move?`,
      },
    ];
  }

  if (source === "page" || source === "page-header") {
    return suggestionsForPage(context);
  }

  if (source === "topbar") {
    return [
      {
        label: "Store snapshot",
        prompt:
          "Give me a concise snapshot of the store ecosystem from connected systems.",
      },
      {
        label: "Top Signals",
        prompt: "Summarize the top open Signals that need attention right now.",
      },
      {
        label: "Connections",
        prompt:
          "What systems are connected and what data can Ora read from each?",
      },
    ];
  }

  return [
    {
      label: "Explain",
      prompt:
        context.defaultPrompt ?? `Explain "${title}" in operator terms.`,
    },
    {
      label: "Why it matters",
      prompt: `Why does "${title}" matter operationally?`,
    },
    {
      label: "Next step",
      prompt: `What is the next safe step for "${title}"?`,
    },
  ];
}

function suggestionsForLifecycleStep(
  stepTitle: string,
  stepDetail: string | undefined,
): ChatSuggestion[] {
  const step = stepTitle.toLowerCase().trim();
  const detailNote = stepDetail ? ` (current: ${stepDetail})` : "";

  if (step === "signal") {
    return [
      {
        label: "What detected",
        prompt:
          "What detected this Signal and which evidence triggered it first?",
      },
      {
        label: "Confidence",
        prompt: "How confident is this Signal and what drives the score?",
      },
      {
        label: "Severity",
        prompt: "Why this severity for the Signal and what would change it?",
      },
    ];
  }

  if (step === "evidence") {
    return [
      {
        label: "Strongest",
        prompt:
          "What are the strongest evidence records behind this Signal?",
      },
      {
        label: "Reliability",
        prompt:
          "How reliable is this evidence? Where could it be wrong or stale?",
      },
      {
        label: "Gaps",
        prompt: "What evidence is thin or missing that I should verify?",
      },
    ];
  }

  if (step === "recommendation") {
    return [
      {
        label: "Why this",
        prompt:
          "Why is this the recommended action and how confident is Ora?",
      },
      {
        label: "Risk",
        prompt: "What are the risks of acting on this recommendation?",
      },
      {
        label: "Expected impact",
        prompt: "What is the expected impact if we follow it?",
      },
    ];
  }

  if (step === "action plan") {
    return [
      {
        label: "Preview payload",
        prompt: "Show the exact payload this action plan would execute.",
      },
      {
        label: "Why blocked",
        prompt:
          "What is blocking this action plan from approval or execution?",
      },
      {
        label: "What changes",
        prompt: "What changes for the store if this plan is executed?",
      },
    ];
  }

  if (step === "approval") {
    return [
      {
        label: "Why approval",
        prompt:
          "Why does this action require approval and what does approval lock in?",
      },
      {
        label: "Exact payload",
        prompt:
          "Show the exact payload approval will lock for execution.",
      },
      {
        label: "Approval state",
        prompt: `What is the current approval state for this Signal${detailNote}?`,
      },
    ];
  }

  if (step === "execution") {
    return [
      {
        label: "Status",
        prompt: `What is the execution status and which tool would run${detailNote}?`,
      },
      {
        label: "Last error",
        prompt:
          "Was there an execution error? Show the message and likely cause.",
      },
      {
        label: "Block",
        prompt: "What is blocking execution from running right now?",
      },
    ];
  }

  if (step === "outcome") {
    return [
      {
        label: "What changed",
        prompt:
          "What changed after the action ran and how was it measured?",
      },
      {
        label: "Measurement",
        prompt: "How is the outcome measured for this Signal?",
      },
      {
        label: "Enough?",
        prompt:
          "Was the outcome enough or does another action follow this one?",
      },
    ];
  }

  return [
    {
      label: "Explain step",
      prompt: `Explain the "${stepTitle}" step for this Signal${detailNote}.`,
    },
    {
      label: "Current state",
      prompt: `What is the current state of "${stepTitle}" for this Signal${detailNote}?`,
    },
    {
      label: "Next step",
      prompt: `What is the next safe step after "${stepTitle}"?`,
    },
  ];
}

function suggestionsForSignalSection(
  sectionTitle: string,
  objectType: string,
): ChatSuggestion[] {
  const title = sectionTitle.trim();

  if (title === "What happened") {
    return [
      {
        label: "Why now",
        prompt:
          "Why did this Signal trigger now? What conditions were met?",
      },
      {
        label: "Scope",
        prompt:
          "What scope is affected — products, customers, store, or other?",
      },
      {
        label: "Next read",
        prompt: "What should I read next to validate this Signal?",
      },
    ];
  }

  if (title === "Evidence") {
    return [
      {
        label: "Strongest",
        prompt: "Show the strongest evidence records for this Signal.",
      },
      {
        label: "Reliability",
        prompt: "How reliable is this evidence? Where could it be wrong?",
      },
      {
        label: "Gaps",
        prompt: "What evidence is thin or missing for this Signal?",
      },
    ];
  }

  if (title === "Recommended action") {
    return [
      {
        label: "Why this",
        prompt:
          "Why is this the recommendation versus alternatives?",
      },
      {
        label: "Risk",
        prompt: "What are the risks of acting on this recommendation?",
      },
      {
        label: "Expected impact",
        prompt: "What is the expected impact if I follow it?",
      },
    ];
  }

  if (title === "Action plan") {
    return [
      {
        label: "Preview payload",
        prompt: "Show the exact payload this action plan would execute.",
      },
      {
        label: "Why blocked",
        prompt:
          "What is blocking this action plan from approval or execution?",
      },
      {
        label: "What changes",
        prompt: "What changes for the store if this plan executes?",
      },
    ];
  }

  if (title === "Approval, execution, outcome") {
    return [
      {
        label: "Approval",
        prompt: "What is the current approval state for this Signal?",
      },
      {
        label: "Execution",
        prompt: "What is the current execution state for this Signal?",
      },
      {
        label: "Outcome",
        prompt: "What is the current outcome state for this Signal?",
      },
    ];
  }

  if (objectType === "customer_group") {
    return [
      {
        label: "Members",
        prompt: `Who is in the "${title}" group and what defines membership?`,
      },
      {
        label: "Value",
        prompt: `What is the estimated value and lifetime spend of the "${title}" group?`,
      },
      {
        label: "Campaign fit",
        prompt: `What campaign or flow would land best with the "${title}" group?`,
      },
    ];
  }

  return [
    {
      label: "Explain",
      prompt: `Explain "${title}" in operator terms.`,
    },
    {
      label: "Why it matters",
      prompt: `Why does "${title}" matter for this Signal?`,
    },
    {
      label: "Next read",
      prompt: `What is the next read for "${title}"?`,
    },
  ];
}

function suggestionsForPage(
  context: ChatSuggestionContext,
): ChatSuggestion[] {
  const href = context.href ?? "";
  const title = context.title ?? "";

  if (href === "/today" || title === "Today" || title.startsWith("Signals that need")) {
    return [
      {
        label: "Top Signal",
        prompt: "Which Signal needs attention first and why?",
      },
      {
        label: "What's new",
        prompt:
          "What changed since yesterday? Summarize new and updated Signals.",
      },
      {
        label: "Safe to skip",
        prompt: "Which Signals are safe to skip right now?",
      },
    ];
  }

  if (href === "/signals" || title === "Signal center") {
    return [
      {
        label: "By severity",
        prompt:
          "Group the open Signals by severity and tell me where to focus.",
      },
      {
        label: "Resolved",
        prompt: "Show recently resolved Signals and what fixed them.",
      },
      {
        label: "Patterns",
        prompt: "What pattern do you see across these Signals?",
      },
    ];
  }

  if (href.startsWith("/signals/") || title === "Signal detail") {
    return [
      {
        label: "Why matters",
        prompt: "Why does this Signal matter and what is the impact?",
      },
      {
        label: "Evidence",
        prompt: "Show the strongest evidence behind this Signal.",
      },
      {
        label: "Next step",
        prompt: "What is the next safe step for this Signal?",
      },
    ];
  }

  if (href === "/actions" || title === "Actions") {
    return [
      {
        label: "Failures",
        prompt:
          "Show recent action executions that failed and what blocked them.",
      },
      {
        label: "Pending approval",
        prompt: "Which action plans are pending approval right now?",
      },
      {
        label: "Outcomes",
        prompt: "Show outcomes for the most recent executed actions.",
      },
    ];
  }

  if (href === "/connections" || title === "Connections") {
    return [
      {
        label: "Sync status",
        prompt:
          "What is the sync status across connected systems and what is stale?",
      },
      {
        label: "Read scope",
        prompt:
          "What data can Ora read from connected systems right now?",
      },
      {
        label: "Missing",
        prompt:
          "Which systems are still missing and what would they unlock?",
      },
    ];
  }

  if (href.startsWith("/settings") || href === "/invite" || title === "Settings") {
    return [
      {
        label: "Members",
        prompt: "Who has access and what role does each member have?",
      },
      {
        label: "Invitations",
        prompt:
          "Show pending invitations and how to invite a teammate.",
      },
      {
        label: "Company",
        prompt:
          "Summarize the company settings and what I can change here.",
      },
    ];
  }

  return [
    {
      label: "Snapshot",
      prompt:
        "Give me a snapshot of the store ecosystem from connected systems.",
    },
    {
      label: "Top Signals",
      prompt: "Summarize the top Signals that need attention.",
    },
    {
      label: "Connections",
      prompt: "What systems are connected and what data can Ora read?",
    },
  ];
}

export function directIntroForContext(
  context: ChatSuggestionContext,
): string {
  const source = (context.source ?? "").trim();
  const title = (context.title ?? "this item").trim();
  const objectType = (context.objectType ?? "").trim();

  if (source === "signal-detail-hero") {
    return "Scoped to this Signal. Ask about evidence, recommendation, approval, execution, outcome, or the next safe step.";
  }

  if (source === "signal-lifecycle" || source === "signal-path-panel") {
    const detail = context.description ? ` — currently ${context.description}` : "";
    return `About the ${title} step${detail}. Ask what it means, what is blocked, or what unblocks it.`;
  }

  if (source === "signal-section") {
    return `Scoped to "${title}" for this Signal. Ask for the read, the risk, or the next step.`;
  }

  if (source === "signal-card") {
    return `Scoped to "${title}". Ask why it matters, the evidence, or the next safe step.`;
  }

  if (source === "action-card") {
    return `Scoped to "${title}". Ask about approval, execution, or outcome.`;
  }

  if (source === "signal-next-action") {
    return "About the next action for this Signal. Ask why it is next, what changes, or how to unblock it.";
  }

  if (source === "signal-facts") {
    return "About this Signal's facts. Ask about severity, scope, detection, or status.";
  }

  if (objectType === "customer_group") {
    return `About the "${title}" customer group. Ask who is in it, its value, or what campaign fits.`;
  }

  if (objectType === "recommendation") {
    return "About this recommendation. Ask why it is the right call, the risk, or the expected impact.";
  }

  if (objectType === "action_plan") {
    return "About this action plan. Ask for the preview payload, what changes, or why it is blocked.";
  }

  if (source === "empty-state") {
    return `Nothing in "${title}" yet. Ask what to connect, what is needed, or where to start.`;
  }

  if (source === "page-header" || source === "page") {
    return `Scoped to ${title}. Ask anything about this page.`;
  }

  if (source === "topbar") {
    return "Ask about your store. Ora reads from connected systems and answers from real data.";
  }

  return `Scoped to ${title}. Ask for the explanation, the evidence, or the next safe step.`;
}
