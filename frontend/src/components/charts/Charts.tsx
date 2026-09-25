import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompactSum, formatMoney } from "@/lib/format";

const AXIS = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };
const GRID = "hsl(var(--border))";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

/** `2026-08-30` -> `30.08`; a monthly `2026-08` -> `08.26`. */
function shortLabel(value: string): string {
  const parts = value.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  if (parts.length === 2) return `${parts[1]}.${parts[0].slice(2)}`;
  return value;
}

export function RevenueChart({
  data,
  xKey,
}: {
  data: object[];
  xKey: "date" | "month";
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) => shortLabel(value)}
        />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={70}
          tickFormatter={(value: number) => formatCompactSum(value)}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number) => [`${formatMoney(value)} so'm`, "Tushum"]}
          labelFormatter={(label: string) => label}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#revenueFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BookingsChart({
  data,
  xKey,
}: {
  data: object[];
  xKey: "date" | "month";
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) => shortLabel(value)}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number) => [value, "Bronlar"]}
        />
        <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryChart({
  data,
  xKey,
  label,
}: {
  data: object[];
  xKey: string;
  label: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [value, label]} />
        <Bar dataKey="bookings" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GrowthChart({
  series,
}: {
  series: Array<{ name: string; color: string; data: Array<{ date: string; count: number }> }>;
}) {
  // Recharts needs one row per x value, so the series are merged by date.
  const merged = new Map<string, Record<string, string | number>>();
  for (const line of series) {
    for (const point of line.data) {
      const row = merged.get(point.date) ?? { date: point.date };
      row[line.name] = point.count;
      merged.set(point.date, row);
    }
  }
  const rows = [...merged.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) => shortLabel(value)}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((line) => (
          <Line
            key={line.name}
            type="monotone"
            dataKey={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
