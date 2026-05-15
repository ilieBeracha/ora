import type { ComponentType } from "react";

import type { ChatWidget } from "@/lib/chat/widgets";
import { AlertCardWidget } from "@/components/widgets/alert-card";
import { BarChartWidget } from "@/components/widgets/bar-chart";
import { DataTableWidget } from "@/components/widgets/data-table";
import { FollowupChipsWidget } from "@/components/widgets/followup-chips";
import { KpiCardWidget } from "@/components/widgets/kpi-card";
import { ProductCardWidget } from "@/components/widgets/product-card";
import { ScorecardGridWidget } from "@/components/widgets/scorecard-grid";
import { StatListWidget } from "@/components/widgets/stat-list";

type WidgetLayout = "grid" | "full" | "footer";

type RegistryEntry<T extends ChatWidget["type"]> = {
  component: ComponentType<Extract<ChatWidget, { type: T }>["props"]>;
  layout: WidgetLayout;
};

const WIDGET_REGISTRY = {
  kpi_card: { component: KpiCardWidget, layout: "grid" },
  scorecard_grid: { component: ScorecardGridWidget, layout: "full" },
  stat_list: { component: StatListWidget, layout: "grid" },
  data_table: { component: DataTableWidget, layout: "full" },
  bar_chart: { component: BarChartWidget, layout: "full" },
  product_card: { component: ProductCardWidget, layout: "full" },
  alert_card: { component: AlertCardWidget, layout: "full" },
  followup_chips: { component: FollowupChipsWidget, layout: "footer" },
} satisfies {
  [K in ChatWidget["type"]]: RegistryEntry<K>;
};

export function WidgetRenderer({
  allowChatOpen = true,
  widget,
  onPrompt,
}: {
  allowChatOpen?: boolean;
  widget: ChatWidget;
  onPrompt?: (prompt: string) => void;
}) {
  if (widget.type === "followup_chips") {
    return <FollowupChipsWidget {...widget.props} onPrompt={onPrompt} />;
  }

  const entry = WIDGET_REGISTRY[widget.type];
  const Component = entry.component as ComponentType<
    typeof widget.props & { chatOpenEnabled?: boolean }
  >;

  return <Component {...widget.props} chatOpenEnabled={allowChatOpen} />;
}

export function WidgetList({
  allowChatOpen = true,
  widgets,
  onPrompt,
}: {
  allowChatOpen?: boolean;
  widgets: ChatWidget[];
  onPrompt?: (prompt: string) => void;
}) {
  if (!widgets.length) return null;

  const grid = widgets.filter((widget) => widgetLayout(widget) === "grid");
  const full = widgets.filter((widget) => widgetLayout(widget) === "full");
  const footer = widgets.filter((widget) => widgetLayout(widget) === "footer");

  return (
    <div
      className="chat-widget-list"
      data-chat-widget-open={allowChatOpen ? "true" : "false"}
    >
      {grid.length ? (
        <div className="chat-widget-grid">
          {grid.map((widget, index) => (
            <WidgetRenderer
              allowChatOpen={allowChatOpen}
              key={`${widget.type}-${index}`}
              onPrompt={onPrompt}
              widget={widget}
            />
          ))}
        </div>
      ) : null}

      {full.map((widget, index) => (
        <WidgetRenderer
          allowChatOpen={allowChatOpen}
          key={`${widget.type}-${index}`}
          onPrompt={onPrompt}
          widget={widget}
        />
      ))}

      {footer.map((widget, index) => (
        <WidgetRenderer
          allowChatOpen={allowChatOpen}
          key={`${widget.type}-${index}`}
          onPrompt={onPrompt}
          widget={widget}
        />
      ))}
    </div>
  );
}

function widgetLayout(widget: ChatWidget) {
  return WIDGET_REGISTRY[widget.type].layout;
}
