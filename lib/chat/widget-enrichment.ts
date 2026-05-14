import { ChatWidgetSchema, type ChatWidget } from "@/lib/chat/widgets";

type ToolResult = {
  toolName: string;
  status?: "success" | "error";
  result: unknown;
};

type CellValue = string | number | boolean | null;

const MAX_WIDGETS = 5;
const MAX_TABLE_ROWS = 12;

export function enrichChatWidgets(
  widgets: ChatWidget[],
  tools: ToolResult[],
): ChatWidget[] {
  const enriched = [...widgets];
  const existingKeys = new Set(enriched.map(widgetKey));

  for (const tool of tools) {
    if (enriched.length >= MAX_WIDGETS) break;
    if (tool.status === "error") continue;

    for (const widget of buildWidgetsForTool(tool)) {
      const key = widgetKey(widget);
      if (existingKeys.has(key)) continue;

      enriched.push(widget);
      existingKeys.add(key);

      if (enriched.length >= MAX_WIDGETS) break;
    }
  }

  return enriched.slice(0, MAX_WIDGETS);
}

function buildWidgetsForTool(tool: ToolResult): ChatWidget[] {
  if (isRecoverableToolError(tool.result)) {
    return compactWidgets([
      widget({
        type: "alert_card",
        props: {
          tone: "warn",
          title: `${labelizeToolName(tool.toolName)} could not complete`,
          body: stringValue(asRecord(tool.result)?.error),
        },
      }),
    ]);
  }

  switch (tool.toolName) {
    case "shopify_get_shop":
    case "klaviyo_get_account":
      return buildConnectionWidgets(tool.result, tool.toolName);
    case "shopify_count_mirrored_products":
      return buildCountWidgets(tool.result);
    case "shopify_list_mirrored_products":
    case "shopify_search_products":
    case "shopify_find_products_missing_metafield":
      return buildProductListWidgets(tool.result, tool.toolName);
    case "shopify_get_product_detail":
      return buildProductDetailWidgets(tool.result);
    case "shopify_get_product_sales":
      return buildProductSalesWidgets(tool.result);
    case "shopify_get_sales_by_period":
      return buildSalesPeriodWidgets(tool.result);
    case "shopify_get_orders":
      return buildOrdersWidgets(tool.result);
    case "shopify_get_inventory_levels":
      return buildInventoryWidgets(tool.result);
    case "shopify_get_customers":
    case "klaviyo_get_profiles":
      return buildPeopleWidgets(tool.result, tool.toolName);
    case "shopify_get_customer_segments":
    case "klaviyo_get_segments":
    case "klaviyo_get_lists":
      return buildAudienceWidgets(tool.result, tool.toolName);
    case "shopify_get_abandoned_checkouts":
      return buildCheckoutWidgets(tool.result);
    case "shopify_get_refunds":
      return buildRefundWidgets(tool.result);
    case "shopify_get_discounts":
    case "shopify_get_metafield_definitions":
    case "klaviyo_get_campaigns":
    case "klaviyo_get_flows":
    case "klaviyo_get_templates":
    case "klaviyo_get_metrics":
    case "klaviyo_get_events":
      return buildCollectionWidgets(tool.result, tool.toolName);
    case "klaviyo_query_metric_aggregates":
      return buildMetricAggregateWidgets(tool.result);
    default:
      return buildGenericWidgets(tool.result, tool.toolName);
  }
}

function buildConnectionWidgets(result: unknown, toolName: string) {
  const record = asRecord(result);
  if (!record) return [];

  const isKlaviyo = toolName.startsWith("klaviyo");
  const items = isKlaviyo
    ? [
        { label: "Account", value: stringValue(record.accountName, "Klaviyo") },
        { label: "Currency", value: stringValue(record.currency, "Unknown") },
        { label: "Timezone", value: stringValue(record.timezone, "Unknown") },
      ]
    : [
        { label: "Store", value: stringValue(record.name, "Shopify") },
        {
          label: "Domain",
          value: stringValue(record.myshopify_domain ?? record.domain, "Unknown"),
        },
        { label: "Email", value: stringValue(record.email, "Unknown") },
      ];

  return compactWidgets([
    widget({
      type: "stat_list",
      props: {
        title: isKlaviyo ? "Connected Klaviyo account" : "Connected Shopify store",
        items,
      },
    }),
  ]);
}

function buildCountWidgets(result: unknown) {
  const rows = arrayOfRecords(result);
  if (!rows.length) return [];

  const items = rows
    .map((row) => ({
      label: titleize(stringValue(row.status, "Unknown")),
      value: numberValue(row.count) ?? 0,
    }))
    .filter((item) => item.label);
  const total = items.reduce((sum, item) => sum + Number(item.value), 0);

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Product mirror",
        cards: [
          { label: "Total products", value: total },
          ...items.slice(0, 5),
        ],
      },
    }),
    widget({
      type: "stat_list",
      props: {
        title: "Products by status",
        items: [{ label: "Total", value: total }, ...items],
      },
    }),
  ]);
}

function buildProductListWidgets(result: unknown, toolName: string) {
  const record = asRecord(result);
  const rows = record
    ? arrayOfRecords(record.products)
    : arrayOfRecords(result);
  if (!rows.length) return [];

  const active = rows.filter((row) => lower(row.status) === "active").length;
  const inventory = rows.reduce(
    (sum, row) => sum + (numberValue(row.totalInventory) ?? 0),
    0,
  );
  const title = toolName === "shopify_find_products_missing_metafield"
    ? "Products missing metafield"
    : "Products";

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Product set",
        cards: [
          { label: "Products shown", value: rows.length },
          { label: "Active", value: active },
          { label: "Total inventory", value: inventory },
        ],
      },
    }),
    rows.length === 1 ? buildProductCard(rows[0], "Product") : null,
    widget({
      type: "data_table",
      props: {
        title,
        columns: [
          { key: "title", label: "Product" },
          { key: "status", label: "Status" },
          { key: "inventory", label: "Inventory", align: "right", format: "number" },
          { key: "type", label: "Type" },
          { key: "vendor", label: "Vendor" },
        ],
        rows: rows.slice(0, MAX_TABLE_ROWS).map((row) => ({
          title: stringValue(row.title, "Untitled"),
          status: titleize(stringValue(row.status, "Unknown")),
          inventory: numberValue(row.totalInventory) ?? "Unknown",
          type: stringValue(row.productType, "Not set"),
          vendor: stringValue(row.vendor, "Not set"),
        })),
      },
    }),
  ]);
}

function buildProductDetailWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];

  const product =
    asRecord(record.liveProduct) ??
    asRecord(record.product) ??
    asRecord(record.mirrorProduct);
  if (!product) return [];

  const variants = arrayOfRecords(product.variants);
  const collections = arrayOfRecords(product.collections);
  const metafields = arrayOfRecords(product.metafields);

  return compactWidgets([
    buildProductCard(product, "Product detail"),
    widget({
      type: "scorecard_grid",
      props: {
        title: "Product structure",
        cards: [
          { label: "Inventory", value: numberValue(product.totalInventory) ?? 0 },
          { label: "Variants", value: numberValue(product.totalVariants) ?? variants.length },
          { label: "Collections", value: collections.length },
          { label: "Metafields", value: metafields.length },
        ],
      },
    }),
    variants.length
      ? widget({
          type: "data_table",
          props: {
            title: "Variants",
            columns: [
              { key: "title", label: "Variant" },
              { key: "sku", label: "SKU" },
              { key: "price", label: "Price", align: "right", format: "number" },
              { key: "inventory", label: "Inventory", align: "right", format: "number" },
              { key: "available", label: "Available" },
            ],
            rows: variants.slice(0, MAX_TABLE_ROWS).map((variant) => ({
              title: stringValue(variant.title, "Default"),
              sku: stringValue(variant.sku, "Not set"),
              price: numberValue(variant.price) ?? stringValue(variant.price, "Unknown"),
              inventory: numberValue(variant.inventoryQuantity) ?? 0,
              available: booleanLabel(variant.availableForSale),
            })),
          },
        })
      : null,
    metafields.length
      ? widget({
          type: "data_table",
          props: {
            title: "Metafields",
            columns: [
              { key: "field", label: "Field" },
              { key: "type", label: "Type" },
              { key: "value", label: "Value" },
            ],
            rows: metafields.slice(0, MAX_TABLE_ROWS).map((metafield) => ({
              field: `${stringValue(metafield.namespace)}.${stringValue(metafield.key)}`,
              type: stringValue(metafield.type, "Unknown"),
              value: truncate(stringValue(metafield.value, "Empty"), 80),
            })),
          },
        })
      : null,
  ]);
}

function buildProductSalesWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];

  const products = arrayOfRecords(record.products);
  if (!products.length) return [];

  const top = products[0];
  const currency = stringValue(top.currency ?? record.currency, "USD");
  const sortBy = stringValue(record.sortBy, "unitsSold");
  const valueKey = sortBy === "netRevenue" || sortBy === "grossRevenue"
    ? "revenue"
    : "units";

  return compactWidgets([
    buildProductCard(
      {
        ...top,
        totalInventory: top.totalInventory,
      },
      "Top seller",
      [
        { label: "Units sold", value: numberValue(top.unitsSold) ?? 0 },
        { label: "Orders", value: numberValue(top.orderCount) ?? 0 },
        { label: "Revenue", value: round(numberValue(top.netRevenue) ?? 0) },
      ],
    ),
    widget({
      type: "scorecard_grid",
      props: {
        title: "Sales sample",
        cards: [
          { label: "Scanned orders", value: numberValue(record.scannedOrders) ?? 0 },
          { label: "Products sold", value: numberValue(record.productCount) ?? products.length },
          { label: "Top units", value: numberValue(top.unitsSold) ?? 0 },
          { label: "Top revenue", value: round(numberValue(top.netRevenue) ?? 0), unit: currency },
        ],
      },
    }),
    widget({
      type: "bar_chart",
      props: {
        title: valueKey === "revenue" ? "Top products by revenue" : "Top products by units",
        data: products.slice(0, 8).map((product) => ({
          product: truncate(stringValue(product.title, "Untitled"), 34),
          value:
            valueKey === "revenue"
              ? round(numberValue(product.netRevenue) ?? 0)
              : numberValue(product.unitsSold) ?? 0,
        })),
        xKey: "product",
        yKey: "value",
        valueFormat: valueKey === "revenue" ? "currency" : "number",
        currency,
      },
    }),
    widget({
      type: "data_table",
      props: {
        title: "Product sales",
        currency,
        columns: [
          { key: "product", label: "Product" },
          { key: "units", label: "Units", align: "right", format: "number" },
          { key: "orders", label: "Orders", align: "right", format: "number" },
          { key: "revenue", label: "Revenue", align: "right", format: "currency" },
        ],
        rows: products.slice(0, MAX_TABLE_ROWS).map((product) => ({
          product: stringValue(product.title, "Untitled"),
          units: numberValue(product.unitsSold) ?? 0,
          orders: numberValue(product.orderCount) ?? 0,
          revenue: round(numberValue(product.netRevenue) ?? 0),
        })),
      },
    }),
  ]);
}

function buildSalesPeriodWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];

  const series = arrayOfRecords(record.series);
  const currency = stringValue(record.currency, "USD");

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Sales trend",
        cards: [
          { label: "Sales", value: round(numberValue(record.totalSales) ?? 0), unit: currency },
          { label: "Orders", value: numberValue(record.totalOrders) ?? 0 },
          { label: "Average order", value: round(numberValue(record.averageOrderValue) ?? 0), unit: currency },
        ],
      },
    }),
    series.length
      ? widget({
          type: "bar_chart",
          props: {
            title: "Sales by period",
            data: series.slice(0, 12).map((row) => ({
              period: stringValue(row.period, "Period"),
              sales: round(numberValue(row.sales) ?? 0),
            })),
            xKey: "period",
            yKey: "sales",
            valueFormat: "currency",
            currency,
          },
        })
      : null,
    series.length
      ? buildTableWidget("Sales rows", series, [
          ["period", "Period", "text"],
          ["sales", "Sales", "currency"],
          ["orderCount", "Orders", "number"],
          ["averageOrderValue", "AOV", "currency"],
        ], currency)
      : null,
  ]);
}

function buildOrdersWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];

  const orders = arrayOfRecords(record.orders);
  const currency = stringValue(record.currency, "USD");

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Orders",
        cards: [
          { label: "Orders shown", value: numberValue(record.count) ?? orders.length },
          { label: "Revenue", value: round(numberValue(record.totalRevenue) ?? 0), unit: currency },
          { label: "More available", value: record.hasMore ? "Yes" : "No" },
        ],
      },
    }),
    widget({
      type: "data_table",
      props: {
        title: "Recent orders",
        currency,
        columns: [
          { key: "order", label: "Order" },
          { key: "created", label: "Created", format: "date" },
          { key: "total", label: "Total", align: "right", format: "currency" },
          { key: "financial", label: "Financial" },
          { key: "fulfillment", label: "Fulfillment" },
        ],
        rows: orders.slice(0, MAX_TABLE_ROWS).map((order) => ({
          order: stringValue(order.name, "Order"),
          created: stringValue(order.createdAt, "Unknown"),
          total: round(numberValue(order.total) ?? 0),
          financial: stringValue(order.financialStatus, "Unknown"),
          fulfillment: stringValue(order.fulfillmentStatus, "Unknown"),
        })),
      },
    }),
  ]);
}

function buildInventoryWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];

  const variants = arrayOfRecords(record.variants);
  const zeroStock = variants.filter((variant) => (numberValue(variant.quantity) ?? 0) <= 0).length;
  const totalQuantity = variants.reduce(
    (sum, variant) => sum + (numberValue(variant.quantity) ?? 0),
    0,
  );

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Inventory",
        cards: [
          { label: "Variants shown", value: numberValue(record.count) ?? variants.length },
          { label: "Zero stock", value: zeroStock },
          { label: "Total quantity", value: totalQuantity },
        ],
      },
    }),
    zeroStock
      ? widget({
          type: "alert_card",
          props: {
            tone: "warn",
            title: `${zeroStock} variants have no available inventory`,
            body: "Review active demand before sending shoppers toward unavailable items.",
          },
        })
      : null,
    widget({
      type: "data_table",
      props: {
        title: "Inventory by variant",
        columns: [
          { key: "product", label: "Product" },
          { key: "variant", label: "Variant" },
          { key: "sku", label: "SKU" },
          { key: "quantity", label: "Qty", align: "right", format: "number" },
          { key: "status", label: "Status" },
        ],
        rows: variants.slice(0, MAX_TABLE_ROWS).map((variant) => ({
          product: stringValue(variant.productTitle, "Untitled"),
          variant: stringValue(variant.variantTitle, "Default"),
          sku: stringValue(variant.sku, "Not set"),
          quantity: numberValue(variant.quantity) ?? 0,
          status: titleize(stringValue(variant.productStatus, "Unknown")),
        })),
      },
    }),
  ]);
}

function buildPeopleWidgets(result: unknown, toolName: string) {
  const record = asRecord(result);
  if (!record) return [];

  const people = arrayOfRecords(record.customers ?? record.profiles);
  const title = toolName.startsWith("klaviyo") ? "Profiles" : "Customers";
  const revenue = people.reduce(
    (sum, person) => sum + (numberValue(person.spent) ?? 0),
    0,
  );

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title,
        cards: [
          { label: `${title} shown`, value: numberValue(record.count) ?? people.length },
          { label: "Known revenue", value: round(revenue) },
        ],
      },
    }),
    buildTableWidget(title, people, [
      ["name", "Name", "text"],
      ["email", "Email", "text"],
      ["orderCount", "Orders", "number"],
      ["spent", "Spent", "currency"],
      ["lastOrderAt", "Last order", "date"],
      ["updated", "Updated", "date"],
    ]),
  ]);
}

function buildAudienceWidgets(result: unknown, toolName: string) {
  const record = asRecord(result);
  if (!record) return [];

  const rows =
    arrayOfRecords(record.segments).length > 0
      ? arrayOfRecords(record.segments)
      : arrayOfRecords(record.lists);
  const title = toolName.includes("list") ? "Lists" : "Segments";

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title,
        cards: [
          { label: `${title} shown`, value: numberValue(record.count) ?? rows.length },
          { label: "More available", value: hasMoreRecord(record) ? "Yes" : "No" },
        ],
      },
    }),
    buildTableWidget(title, rows, [
      ["name", "Name", "text"],
      ["isActive", "Active", "text"],
      ["created", "Created", "date"],
      ["updated", "Updated", "date"],
    ]),
  ]);
}

function buildCheckoutWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];
  const checkouts = arrayOfRecords(record.checkouts);
  const currency = stringValue(record.currency, "USD");

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Abandoned checkouts",
        cards: [
          { label: "Checkouts", value: numberValue(record.count) ?? checkouts.length },
          { label: "Value", value: round(numberValue(record.totalValue) ?? 0), unit: currency },
        ],
      },
    }),
    buildTableWidget("Abandoned checkouts", checkouts, [
      ["name", "Checkout", "text"],
      ["createdAt", "Created", "date"],
      ["total", "Total", "currency"],
    ], currency),
  ]);
}

function buildRefundWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];
  const refunds = arrayOfRecords(record.refunds);
  const currency = stringValue(record.currency, "USD");

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Refunds",
        cards: [
          { label: "Refunds", value: numberValue(record.count) ?? refunds.length },
          { label: "Refunded", value: round(numberValue(record.totalRefunded) ?? 0), unit: currency },
        ],
      },
    }),
    buildTableWidget("Refund rows", refunds, [
      ["orderName", "Order", "text"],
      ["createdAt", "Created", "date"],
      ["amount", "Amount", "currency"],
      ["note", "Note", "text"],
    ], currency),
  ]);
}

function buildMetricAggregateWidgets(result: unknown) {
  const record = asRecord(result);
  if (!record) return [];
  const series = arrayOfRecords(record.series);
  const measurement = stringValue(record.measurement, "value");

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: "Metric aggregate",
        cards: [
          { label: titleize(measurement), value: round(numberValue(record.total) ?? 0) },
          { label: "Interval", value: stringValue(record.interval, "day") },
          { label: "Rows", value: series.length },
        ],
      },
    }),
    series.length
      ? widget({
          type: "bar_chart",
          props: {
            title: "Metric over time",
            data: series.slice(0, 12).map((row) => ({
              period: stringValue(row.period, "Period"),
              value: round(numberValue(row.value) ?? 0),
            })),
            xKey: "period",
            yKey: "value",
            valueFormat: measurement === "sum_value" ? "currency" : "number",
          },
        })
      : null,
    buildTableWidget("Metric rows", series, [
      ["period", "Period", "text"],
      ["value", "Value", "number"],
    ]),
  ]);
}

function buildCollectionWidgets(result: unknown, toolName: string) {
  const record = asRecord(result);
  if (!record) return buildGenericWidgets(result, toolName);

  const collection = findCollection(record);
  if (!collection.rows.length) return buildGenericWidgets(result, toolName);

  return compactWidgets([
    widget({
      type: "scorecard_grid",
      props: {
        title: collection.title,
        cards: [
          { label: "Rows shown", value: numberValue(record.count) ?? collection.rows.length },
          { label: "More available", value: hasMoreRecord(record) ? "Yes" : "No" },
        ],
      },
    }),
    buildAutoTableWidget(collection.title, collection.rows),
  ]);
}

function buildGenericWidgets(result: unknown, toolName: string) {
  const jsonApiRows = jsonApiResultRows(result);
  if (jsonApiRows.length) {
    return compactWidgets([
      buildAutoTableWidget(labelizeToolName(toolName), jsonApiRows),
    ]);
  }

  if (Array.isArray(result)) {
    return compactWidgets([
      buildAutoTableWidget(labelizeToolName(toolName), arrayOfRecords(result)),
    ]);
  }

  const record = asRecord(result);
  if (!record) return [];

  const collection = findCollection(record);
  if (collection.rows.length) {
    return compactWidgets([
      buildAutoTableWidget(collection.title, collection.rows),
    ]);
  }

  const items = Object.entries(record)
    .filter(([, value]) => isScalar(value))
    .slice(0, 10)
    .map(([key, value]) => ({
      label: labelizeKey(key),
      value:
        typeof value === "number" || typeof value === "string"
          ? value
          : String(value ?? "Unknown"),
    }));

  return compactWidgets([
    items.length
      ? widget({
          type: "stat_list",
          props: {
            title: labelizeToolName(toolName),
            items,
          },
        })
      : null,
  ]);
}

function buildProductCard(
  product: Record<string, unknown>,
  subtitle: string,
  metrics?: Array<{ label: string; value: string | number }>,
) {
  const price = asRecord(product.priceRange);
  const min = asRecord(price?.min);
  const amount =
    numberValue(min?.amount) ??
    numberValue(product.price) ??
    numberValue(product.minPrice);

  return widget({
    type: "product_card",
    props: {
      name: stringValue(product.title ?? product.name, "Untitled product"),
      subtitle: [
        subtitle,
        stringValue(product.vendor, ""),
        stringValue(product.productType, ""),
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 160),
      imageUrl: stringValue(
        product.imageUrl ?? product.featuredImageUrl,
        "",
      ) || undefined,
      url: stringValue(product.onlineStoreUrl, "") || undefined,
      price: amount
        ? {
            amount,
            currency: stringValue(min?.currencyCode ?? product.currency, "USD"),
          }
        : undefined,
      stock: numberValue(product.totalInventory) ?? undefined,
      metrics,
    },
  });
}

function buildAutoTableWidget(title: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return null;

  const keys = inferColumns(rows);

  return widget({
    type: "data_table",
    props: {
      title,
      columns: keys.map((key) => ({
        key,
        label: labelizeKey(key),
        format: inferColumnFormat(key, rows),
        align: inferColumnFormat(key, rows) === "number" || inferColumnFormat(key, rows) === "currency"
          ? "right"
          : "left",
      })),
      rows: rows.slice(0, MAX_TABLE_ROWS).map((row) =>
        Object.fromEntries(keys.map((key) => [key, toCellValue(row[key])])),
      ),
    },
  });
}

function buildTableWidget(
  title: string,
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string, "text" | "number" | "currency" | "date"]>,
  currency?: string,
) {
  if (!rows.length) return null;

  return widget({
    type: "data_table",
    props: {
      title,
      currency,
      columns: columns
        .filter(([key]) => rows.some((row) => typeof row[key] !== "undefined"))
        .slice(0, 6)
        .map(([key, label, format]) => ({
          key,
          label,
          format,
          align: format === "number" || format === "currency" ? "right" : "left",
        })),
      rows: rows.slice(0, MAX_TABLE_ROWS).map((row) =>
        Object.fromEntries(
          columns.map(([key]) => [key, toCellValue(row[key])]),
        ),
      ),
    },
  });
}

function findCollection(record: Record<string, unknown>) {
  const priorityKeys = [
    "products",
    "orders",
    "variants",
    "customers",
    "profiles",
    "segments",
    "lists",
    "campaigns",
    "flows",
    "templates",
    "metrics",
    "events",
    "discounts",
    "definitions",
    "refunds",
    "checkouts",
  ];

  for (const key of priorityKeys) {
    const rows = arrayOfRecords(record[key]);
    if (rows.length) return { title: labelizeKey(key), rows };
  }

  for (const [key, value] of Object.entries(record)) {
    const rows = arrayOfRecords(value);
    if (rows.length) return { title: labelizeKey(key), rows };
  }

  return { title: "Rows", rows: [] };
}

function jsonApiResultRows(result: unknown) {
  const record = asRecord(result);
  const data = arrayOfRecords(record?.data);
  if (!data.length) return [];

  return data.map((resource) => {
    const attrs = asRecord(resource.attributes) ?? {};
    const row: Record<string, unknown> = {
      id: resource.id,
      type: resource.type,
    };

    for (const [key, value] of Object.entries(attrs)) {
      if (isScalar(value)) row[key] = value;
      if (Object.keys(row).length >= 6) break;
    }

    return row;
  });
}

function inferColumns(rows: Array<Record<string, unknown>>) {
  const preferred = [
    "name",
    "title",
    "product",
    "productTitle",
    "status",
    "channel",
    "createdAt",
    "created",
    "updatedAt",
    "updated",
    "total",
    "value",
    "count",
  ];
  const allKeys = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row).forEach((key) => {
        if (isScalar(row[key])) keys.add(key);
      });
      return keys;
    }, new Set<string>()),
  );
  const ordered = [
    ...preferred.filter((key) => allKeys.includes(key)),
    ...allKeys.filter((key) => !preferred.includes(key)),
  ];

  return ordered.slice(0, 6);
}

function inferColumnFormat(
  key: string,
  rows: Array<Record<string, unknown>>,
): "text" | "number" | "currency" | "percent" | "date" {
  const lowerKey = key.toLowerCase();
  if (/(date|time|created|updated|period)/.test(lowerKey)) return "date";
  if (/(revenue|sales|amount|spent|total|price|value)/.test(lowerKey)) return "currency";
  if (rows.some((row) => typeof row[key] === "number")) return "number";

  return "text";
}

function widget(input: unknown) {
  const parsed = ChatWidgetSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function compactWidgets(items: Array<ChatWidget | null>) {
  return items.filter((item): item is ChatWidget => Boolean(item));
}

function widgetKey(widget: ChatWidget) {
  if (widget.type === "product_card") {
    return `${widget.type}:${widget.props.name}`;
  }
  if ("title" in widget.props && widget.props.title) {
    return `${widget.type}:${widget.props.title}`;
  }
  if (widget.type === "kpi_card") {
    return `${widget.type}:${widget.props.label}`;
  }

  return widget.type;
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isScalar(value: unknown): value is CellValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isRecoverableToolError(result: unknown) {
  const record = asRecord(result);
  return record?.ok === false;
}

function hasMoreRecord(record: Record<string, unknown>) {
  return Boolean(record.next ?? record.hasMore ?? record.hasMoreOrders);
}

function toCellValue(value: unknown): CellValue {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string") return truncate(value, 120);
  if (typeof value === "number" || typeof value === "boolean") return value;

  return truncate(JSON.stringify(value), 120);
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  return fallback;
}

function lower(value: unknown) {
  return stringValue(value).toLowerCase();
}

function booleanLabel(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "Unknown";
}

function labelizeToolName(toolName: string) {
  return titleize(toolName.replace(/^(shopify|klaviyo)_/i, ""));
}

function labelizeKey(key: string) {
  return titleize(key.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

function titleize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function truncate(value: string, max = 160) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
