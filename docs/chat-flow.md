# Chat Flow Contract

Ora chat has two entry paths:

1. General chat opens from the assistant rail or topbar and uses the current page as context.
2. Focused chat opens from an explicit page card, Signal section, ActionPlan, connection, or eligible widget trigger.

Focused chat context is sent as a typed payload:

- `source`: the page surface that opened chat.
- `title` and `description`: the human-readable object.
- `signalId`, `actionPlanId`, `objectType`, `objectId`: durable Ora ids when available.
- `widgetType`: one of the supported answer widget types when a widget is used as a page trigger.
- `dataSummary`: compact facts from the selected widget so the agent can answer the selected object instead of guessing from the title.
- `defaultPrompt`: the best first question for that source.

## Rules

- General chat may use recent saved chat history according to the memory selector.
- Focused chat uses only the selected context and the current focused thread history. It does not pull unrelated saved general chat.
- Widgets rendered inside an assistant answer are static. Their follow-up chips can ask the next question in the same chat, but cards, charts, tables, KPIs, and product cards do not open another chat from inside chat.
- Widgets rendered outside the assistant panel may expose a chat trigger when they provide a compact `dataSummary`.
- Focused follow-up suggestions must be specific to the selected object type: ActionPlans ask about approval/execution, evidence sections ask about proof/validation, product widgets ask about product/sales/inventory, tables ask about key rows/patterns, and charts ask about drivers/risk.
- Chat remains read-only. Mutations still move through ActionPlan, Approval, Execution, and Outcome.

## Research To Action UI

Signal surfaces must show where the user is in the operating flow without requiring app knowledge:

`Signal -> Evidence -> Recommendation -> ActionPlan -> Approval -> Execution -> Outcome`

- The Signals list is an owner-readable work queue, not a data dump. Each Signal row answers:
  - what needs changing
  - what action/change has already been recorded
  - what is still left
  - what scope was affected
- The Actions page starts with the operating queue: needs approval, ready to run, blocked, and outcome pending.
- Action rows explain the next operator move before showing technical status. They also show the affected scope and a recorded log for plan, approval, execution, and outcome.
- Signal detail shows one primary flow: Problem, Proof, Action, Outcome. It should not expose every internal record as a competing page section. The top panel must make the current state, recorded change, affected scope, and remaining work obvious before any supporting detail appears.
- Signal detail remains the place where approval and execution are actually performed; raw facts and technical payloads belong in collapsed supporting details.
- A pending Outcome is never a dead end. The UI must say: finish the operator review, then run an outcome scan. Detection then closes the pending Outcome as `resolved` when the Signal pattern disappears, or `no_change` when it is still detected and needs another operator decision.
- A `no_change` or `worsened` Outcome is also not a dead end, and it must not create another copy of the same ActionPlan. It means the approved Ora review already ran, the connected store data still matches the Signal, and the next visible state is **Change store, then scan**. After the user changes the source data outside Ora, the same outcome scan verifies whether the Signal resolves.

The deterministic logic lives in `lib/signals/flow.ts` and is covered by `lib/signals/flow.test.ts`.
Owner-readable page summaries live in `lib/signals/owner-summary.ts` and are covered by `lib/signals/owner-summary.test.ts`.

## Tests

The contract is covered by:

- `lib/chat/context.test.ts`
- `lib/chat/history-policy.test.ts`
- `lib/signals/owner-summary.test.ts`
- `components/widgets/widget-renderer.test.tsx`
- existing agent, persistence, signal context, run, and widget tests
