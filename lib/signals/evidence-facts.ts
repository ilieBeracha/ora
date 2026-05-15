export type EvidenceFact = {
  key: string;
  title: string;
  summary: string;
  providers: string[];
  observedAt: Date | string;
  count: number;
};

type EvidenceLike = {
  evidenceType: string;
  displayText: string;
  provider: string;
  observedAt: Date | string;
};

export function buildEvidenceFacts(
  evidenceItems: EvidenceLike[],
): EvidenceFact[] {
  const facts = new Map<string, EvidenceFact>();

  for (const evidence of evidenceItems) {
    const title = titleCase(evidence.evidenceType);
    const summary = summarizeEvidenceDisplay(evidence.displayText);
    const key = `${title}:${summary}`.toLowerCase();
    const current = facts.get(key);

    if (!current) {
      facts.set(key, {
        key,
        title,
        summary,
        providers: [evidence.provider],
        observedAt: evidence.observedAt,
        count: 1,
      });
      continue;
    }

    current.count += 1;
    if (!current.providers.includes(evidence.provider)) {
      current.providers.push(evidence.provider);
    }
    if (new Date(evidence.observedAt) > new Date(current.observedAt)) {
      current.observedAt = evidence.observedAt;
    }
  }

  return [...facts.values()].sort((a, b) => b.count - a.count);
}

export function getLatestEvidenceObservedAt(
  evidenceItems: EvidenceLike[],
): Date | string | null {
  if (evidenceItems.length === 0) return null;
  return [...evidenceItems]
    .map((item) => item.observedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

export function getTopEvidenceReason(
  examples: { reasons: string[] }[],
): { reason: string; count: number } | null {
  const counts = new Map<string, number>();

  for (const example of examples) {
    for (const reason of example.reasons ?? []) {
      if (!reason) continue;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const top = sorted[0];

  return top ? { reason: top[0], count: top[1] } : null;
}

export function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function summarizeEvidenceDisplay(value: string): string {
  const withoutExamples = value.split(/\bExamples:/i)[0]?.trim() ?? value;
  const normalized = withoutExamples.replace(/\s+/g, " ").trim();
  const withPeriod = /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;

  return withPeriod.length > 190
    ? `${withPeriod.slice(0, 187).trim()}...`
    : withPeriod;
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
