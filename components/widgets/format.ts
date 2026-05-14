export type WidgetValueFormat = "text" | "number" | "currency" | "percent" | "date";

export function formatWidgetValue(
  value: string | number | boolean | null | undefined,
  format: WidgetValueFormat = "text",
  currency = "USD",
) {
  if (value == null) return "Not available";

  if (format === "number" && typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }

  if (format === "currency" && typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (format === "percent" && typeof value === "number") {
    const normalized = Math.abs(value) > 1 ? value / 100 : value;

    return new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(normalized);
  }

  if (format === "date" && typeof value === "string") {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(date);
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  return String(value);
}

export function formatDelta(
  delta:
    | {
        value: number;
        format?: "number" | "currency" | "percent";
        direction?: "up" | "down" | "flat";
        label?: string;
      }
    | undefined,
  currency = "USD",
) {
  if (!delta) return null;

  const value = formatWidgetValue(delta.value, delta.format ?? "number", currency);
  const label = delta.label ? ` ${delta.label}` : "";

  return `${value}${label}`;
}
