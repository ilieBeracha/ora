import { describe, expect, it } from "vitest";

import {
  buildKlaviyoMetricAggregateBody,
  klaviyoConnector,
  KLAVIYO_DEFAULT_REVISION,
  normalizeKlaviyoApiPath,
  normalizeKlaviyoRevision,
} from "@/lib/connectors/klaviyo";
import { findConnectorThatOwnsTool, getConnectorAdapter } from "./registry";

describe("Klaviyo connector", () => {
  it("registers Klaviyo read-only chat tools", () => {
    expect(getConnectorAdapter("klaviyo")).toBe(klaviyoConnector);
    expect(findConnectorThatOwnsTool("klaviyo_get_metrics")).toBe(
      klaviyoConnector,
    );
    expect(klaviyoConnector.tools.every((tool) => tool.readOnly)).toBe(true);
  });

  it("normalizes relative API paths and rejects unsafe paths", () => {
    expect(normalizeKlaviyoApiPath("/api/profiles/abc")).toBe("profiles/abc");
    expect(normalizeKlaviyoApiPath("metrics")).toBe("metrics");
    expect(() =>
      normalizeKlaviyoApiPath("https://evil.example/api/profiles"),
    ).toThrow("relative Klaviyo /api path");
    expect(() =>
      normalizeKlaviyoApiPath("profile-subscription-bulk-create-jobs"),
    ).toThrow("read-only allowlist");
    expect(() => normalizeKlaviyoApiPath("profiles/../events")).toThrow(
      "path is invalid",
    );
  });

  it("defaults unsupported revision strings to the current Klaviyo revision", () => {
    expect(normalizeKlaviyoRevision("2026-04-15")).toBe("2026-04-15");
    expect(normalizeKlaviyoRevision("bad")).toBe(KLAVIYO_DEFAULT_REVISION);
  });

  it("builds metric aggregate payloads with one date-range filter", () => {
    const body = buildKlaviyoMetricAggregateBody({
      metricId: "abc123",
      from: "2026-05-01",
      to: "2026-05-14",
      measurement: "sum_value",
      interval: "day",
      timezone: "Asia/Jerusalem",
      by: ["$attributed_message"],
      filter: 'equals($flow,"flow_1")',
    });

    expect(body).toEqual({
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: "abc123",
          measurements: ["sum_value"],
          interval: "day",
          timezone: "Asia/Jerusalem",
          filter: [
            "greater-or-equal(datetime,2026-05-01T00:00:00),less-than(datetime,2026-05-14T23:59:59)",
            'equals($flow,"flow_1")',
          ],
          by: ["$attributed_message"],
        },
      },
    });
  });
});
