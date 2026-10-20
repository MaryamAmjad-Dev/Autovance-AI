// The four primary automation features, defined once and rendered as cards
// on the Dashboard. The Workflow Builder (the research tool) is intentionally
// NOT in this list; it lives in the Tools area below.
export const FEATURES = [
  {
    href: "/email",
    title: "Email Automation",
    desc: "Generate drafts with AI and send them through your configured email provider.",
    icon: "envelope",
    accent: ["#8b5cf6", "#6366f1"]
  },
  {
    href: "/webhook",
    title: "Webhook Automation",
    desc: "Call external APIs with validation and safety checks enforced on the server.",
    icon: "link",
    accent: ["#a855f7", "#7c3aed"]
  },
  {
    href: "/cron",
    title: "Cron Jobs",
    desc: "Create, run, and monitor recurring schedules with execution history.",
    icon: "clock",
    accent: ["#7c3aed", "#6d28d9"]
  },
  {
    href: "/form",
    title: "Form Actions",
    desc: "Configure forms, validate submissions, and store every submitted record.",
    icon: "document",
    accent: ["#6366f1", "#7c3aed"]
  }
];

// Secondary tools shown in a compact area (also linked from the Footer).
export const TOOLS = [
  {
    href: "/workflows",
    title: "Workflow Builder",
    desc: "Explainable AI proposals with validation, contrastive comparison, and dry runs"
  }
];
