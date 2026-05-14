This app is intentionally focused.

Core flow:
Signal -> Evidence -> Recommendation -> ActionPlan -> Approval -> Execution -> Outcome.

Do not add broad AI assistant features unless they directly support this flow.

Do not build:
- creative studio
- Meta campaigns
- Klaviyo campaigns
- memory graph
- broad analytics dashboard
- generic chat homepage
- Qlik/GSC/PageSpeed integrations
- organization-based auth

Use WorkOS AuthKit for authentication and app-wide invitations only.
Do not use WorkOS Organizations in v1.

The old repo at `../jacobi-agentic` may be read as reference only.
Do not copy its architecture or large components.

Prefer deterministic workflows over giant prompts.
Prefer small tested services over giant route handlers.
Prefer one clear user action over many possible features.
