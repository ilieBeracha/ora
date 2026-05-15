import type { ChatWidget } from "@/lib/chat/widgets";

import { formatWidgetValue } from "@/components/widgets/format";

type DataTableProps = Extract<ChatWidget, { type: "data_table" }>["props"];
type CellValue = DataTableProps["rows"][number][string];

export function DataTableWidget({
  title,
  columns,
  rows,
  currency,
}: DataTableProps) {
  return (
    <section className="chat-widget chat-widget-data-table">
      {title ? <div className="chat-widget-title">{title}</div> : null}
      <div className="chat-widget-table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  className={alignClass(column.align)}
                  key={column.key}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="chat-widget-empty" colSpan={columns.length}>
                  No rows.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => (
                    <td
                      className={alignClass(column.align)}
                      key={column.key}
                    >
                      {formatCell(row[column.key], column.format, currency)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function alignClass(align?: "left" | "right" | "center") {
  if (align === "right") return "chat-widget-align-right";
  if (align === "center") return "chat-widget-align-center";

  return "";
}

function formatCell(
  value: CellValue,
  format: "text" | "number" | "currency" | "percent" | "date",
  currency?: string,
) {
  return formatWidgetValue(value, format, currency);
}
