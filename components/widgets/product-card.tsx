/* eslint-disable @next/next/no-img-element */
import { ExternalLink } from "lucide-react";

import type { ChatWidget } from "@/lib/chat/widgets";

import { ChatOpenButton } from "@/components/chat-open-button";
import { formatWidgetValue } from "@/components/widgets/format";

type ProductCardProps = Extract<ChatWidget, { type: "product_card" }>["props"];

export function ProductCardWidget({
  name,
  subtitle,
  sku,
  imageUrl,
  url,
  price,
  stock,
  metrics,
  hint,
}: ProductCardProps) {
  return (
    <section
      className="chat-widget chat-widget-product"
      data-chat-explain="true"
      data-chat-source="chat-widget"
      data-chat-title={name}
      data-chat-description={subtitle}
      data-chat-prompt={`Explain this product widget for "${name}" and what I should look at next.`}
    >
      <ChatOpenButton label={`Open ${name} in chat`} />
      {imageUrl ? (
        <img className="chat-widget-product-image" src={imageUrl} alt="" />
      ) : null}
      <div className="chat-widget-product-body">
        <div>
          <div className="chat-widget-product-name">{name}</div>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>

        <dl className="chat-widget-product-meta">
          {price ? (
            <div>
              <dt>Price</dt>
              <dd>{formatWidgetValue(price.amount, "currency", price.currency)}</dd>
            </div>
          ) : null}
          {typeof stock === "number" ? (
            <div>
              <dt>Stock</dt>
              <dd>{formatWidgetValue(stock, "number")}</dd>
            </div>
          ) : null}
          {sku ? (
            <div>
              <dt>SKU</dt>
              <dd>{sku}</dd>
            </div>
          ) : null}
          {metrics?.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{formatWidgetValue(metric.value, "number")}</dd>
            </div>
          ))}
        </dl>

        {hint ? <p>{hint}</p> : null}
        {url ? (
          <a
            className="chat-widget-product-link"
            href={url}
            rel="noreferrer"
            target="_blank"
          >
            Open product
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </section>
  );
}
