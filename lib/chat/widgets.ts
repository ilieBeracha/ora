import { z } from "zod";

const CellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const NumOrStr = z.union([z.string(), z.number()]);

const DeltaProps = z.object({
  value: z.number(),
  format: z.enum(["number", "currency", "percent"]).default("number"),
  direction: z.enum(["up", "down", "flat"]).optional(),
  label: z.string().max(40).optional(),
});

const KpiCardProps = z.object({
  label: z.string().min(1).max(80),
  value: NumOrStr,
  unit: z.string().max(20).optional(),
  delta: DeltaProps.optional(),
  hint: z.string().max(180).optional(),
});

const ScorecardGridProps = z.object({
  title: z.string().max(80).optional(),
  cards: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        value: NumOrStr,
        unit: z.string().max(20).optional(),
        delta: DeltaProps.optional(),
        hint: z.string().max(120).optional(),
      }),
    )
    .min(2)
    .max(8),
});

const StatListProps = z.object({
  title: z.string().max(80).optional(),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        value: NumOrStr,
      }),
    )
    .min(1)
    .max(12),
});

const DataTableProps = z.object({
  title: z.string().max(80).optional(),
  columns: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1).max(40),
        align: z.enum(["left", "right", "center"]).optional(),
        format: z
          .enum(["text", "number", "currency", "percent", "date"])
          .default("text"),
      }),
    )
    .min(1)
    .max(6),
  rows: z.array(z.record(z.string(), CellValue)).max(50),
  currency: z.string().max(6).optional(),
});

const BarChartProps = z.object({
  title: z.string().max(80).optional(),
  data: z.array(z.record(z.string(), CellValue)).min(1).max(12),
  xKey: z.string().min(1),
  yKey: z.string().min(1),
  valueFormat: z.enum(["number", "currency", "percent"]).default("number"),
  currency: z.string().max(6).optional(),
});

const ProductCardProps = z.object({
  name: z.string().min(1).max(160),
  subtitle: z.string().max(160).optional(),
  sku: z.string().max(80).optional(),
  imageUrl: z.string().max(2048).optional(),
  url: z.string().max(2048).optional(),
  price: z
    .object({
      amount: z.number().nonnegative(),
      currency: z.string().max(6).default("USD"),
    })
    .optional(),
  stock: z.number().int().optional(),
  metrics: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        value: NumOrStr,
      }),
    )
    .max(6)
    .optional(),
  hint: z.string().max(220).optional(),
});

const AlertCardProps = z.object({
  tone: z.enum(["info", "success", "warn", "danger"]).default("info"),
  title: z.string().min(1).max(120),
  body: z.string().max(420).optional(),
});

const FollowupChipsProps = z.object({
  title: z.string().max(80).optional(),
  prompts: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        prompt: z.string().min(1).max(400),
      }),
    )
    .min(2)
    .max(6),
});

export const ChatWidgetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("kpi_card"),
    props: KpiCardProps,
  }),
  z.object({
    type: z.literal("scorecard_grid"),
    props: ScorecardGridProps,
  }),
  z.object({
    type: z.literal("stat_list"),
    props: StatListProps,
  }),
  z.object({
    type: z.literal("data_table"),
    props: DataTableProps,
  }),
  z.object({
    type: z.literal("bar_chart"),
    props: BarChartProps,
  }),
  z.object({
    type: z.literal("product_card"),
    props: ProductCardProps,
  }),
  z.object({
    type: z.literal("alert_card"),
    props: AlertCardProps,
  }),
  z.object({
    type: z.literal("followup_chips"),
    props: FollowupChipsProps,
  }),
]);

export type ChatWidget = z.infer<typeof ChatWidgetSchema>;

export function buildShopWidget(result: unknown): ChatWidget {
  const shop = result as {
    name?: string | null;
    email?: string | null;
    domain?: string | null;
    myshopify_domain?: string | null;
  };
  const domain = shop.myshopify_domain ?? shop.domain ?? "Unknown";

  return ChatWidgetSchema.parse({
    type: "stat_list",
    props: {
      title: "Connected Shopify store",
      items: [
        { label: "Store", value: shop.name ?? "Shopify" },
        { label: "Domain", value: domain },
        { label: "Email", value: shop.email ?? "Not available" },
      ],
    },
  });
}

export function buildProductCountsWidget(result: unknown): ChatWidget {
  const counts = (result as Array<{ status: string; count: number }>).map(
    (item) => ({
      label: labelizeStatus(item.status),
      value: item.count,
    }),
  );
  const total = counts.reduce((sum, item) => sum + Number(item.value), 0);

  return ChatWidgetSchema.parse({
    type: "stat_list",
    props: {
      title: "Mirrored products",
      items: [{ label: "Total", value: total }, ...counts],
    },
  });
}

export function buildProductListWidget(
  result: unknown,
  status: string | null,
): ChatWidget {
  const products = result as Array<{
    title: string;
    status: string;
    vendor?: string | null;
    productType?: string | null;
    totalInventory?: number | null;
  }>;

  return ChatWidgetSchema.parse({
    type: "data_table",
    props: {
      title: status ? `${labelizeStatus(status)} products` : "Mirrored products",
      columns: [
        { key: "title", label: "Product" },
        { key: "status", label: "Status" },
        { key: "inventory", label: "Inventory", align: "right", format: "number" },
        { key: "type", label: "Type" },
      ],
      rows: products.map((product) => ({
        title: product.title,
        status: labelizeStatus(product.status),
        inventory:
          typeof product.totalInventory === "number"
            ? product.totalInventory
            : "Unknown",
        type: product.productType ?? product.vendor ?? "Not set",
      })),
    },
  });
}

function labelizeStatus(status: string) {
  return status
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
