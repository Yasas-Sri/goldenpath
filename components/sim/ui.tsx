// Shared building blocks for the simulator screens.
// ponytail: plain Views for charts — 10 bars and a tornado don't need a chart lib.
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { formatLocalCurrency } from "@/core/currency";
import { Row } from "@/core/dataset";
import { toggleColorScheme, useColorScheme } from "@/hooks/use-color-scheme";

export function usePalette() {
  const scheme = useColorScheme() ?? "light";
  const base = Colors[scheme];
  return {
    ...base,
    scheme,
    card: scheme === "dark" ? "#161b22" : "#f4f6f8",
    border: scheme === "dark" ? "#232a33" : "#e1e6ea",
    muted: scheme === "dark" ? "#9BA1A6" : "#687076",
    accent: "#2dd4bf",
    good: "#2dd4bf",
    warn: "#d98c00",
    bad: "#ef4444",
  };
}

export type Palette = ReturnType<typeof usePalette>;

// ---------- formatting ----------

export function fmtMoney(value: any, currency: string, decimals = 0): string {
  return formatLocalCurrency(value, null, currency, decimals);
}

export function fmtNum(value: any, decimals = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "—");
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const a = Math.abs(value);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(0)}k`;
  return `${sign}${a.toFixed(0)}`;
}

export function fmtPct(value: number, decimals = 1): string {
  return `${(Number(value) * 100).toFixed(decimals)}%`;
}

// ---------- layout ----------

export function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  const p = usePalette();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <View style={styles.screenHeader}>
          <Text style={[styles.screenTitle, { color: p.text }]}>{title}</Text>
          <Pressable
            onPress={toggleColorScheme}
            hitSlop={12}
            style={[styles.themeToggle, { borderColor: p.border }]}>
            <Text style={{ fontSize: 18 }}>{p.scheme === "dark" ? "☀️" : "🌙"}</Text>
          </Pressable>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const p = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.sectionTitle, { color: p.text }]}>{children}</Text>;
}

export function Caption({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={{ fontSize: 12, color: p.muted }}>{children}</Text>;
}

export function Banner({
  kind,
  text,
}: {
  kind: "good" | "warn" | "bad" | "info";
  text: string;
}) {
  const p = usePalette();
  const color = { good: p.good, warn: p.warn, bad: p.bad, info: p.accent }[kind];
  return (
    <View style={[styles.banner, { borderColor: color, backgroundColor: `${color}1a` }]}>
      <Text style={{ color: p.text, fontSize: 13, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

export function EmptyState() {
  return (
    <Card>
      <Text style={{ fontSize: 14, lineHeight: 20 }}>
        <Caption>No results yet. Set up a scenario and run the simulation from the Setup tab.</Caption>
      </Text>
    </Card>
  );
}

// ---------- inputs ----------

export function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly string[];
  value: string;
  onChange: (option: string) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[styles.inputLabel, { color: p.muted }]}>{label}</Text> : null}
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? p.accent : p.border,
                  backgroundColor: selected ? p.accent : p.background,
                },
              ]}>
              <Text
                style={{ fontSize: 13, fontWeight: selected ? "700" : "400", color: selected ? "#0d1117" : p.text }}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function StepperRow({
  label,
  value,
  onChange,
  step,
  min,
  max,
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
}) {
  const p = usePalette();
  const nudge = (direction: 1 | -1) => {
    const next = Math.round((value + direction * step) * 10000) / 10000;
    onChange(Math.min(max, Math.max(min, next)));
  };
  const button = (symbol: string, direction: 1 | -1) => (
    <Pressable
      onPress={() => nudge(direction)}
      style={[styles.stepperButton, { borderColor: p.border, backgroundColor: p.background }]}>
      <Text style={{ fontSize: 18, color: p.accent, fontWeight: "600" }}>{symbol}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.inputLabel, { color: p.muted, flex: 1 }]}>{label}</Text>
      {button("−", -1)}
      <Text style={[styles.stepperValue, { color: p.text }]}>{format(value)}</Text>
      {button("+", 1)}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, { backgroundColor: p.accent, opacity: disabled ? 0.6 : 1 }]}>
      <Text style={{ color: "#0d1117", fontSize: 16, fontWeight: "700" }}>{title}</Text>
    </Pressable>
  );
}

// ---------- data display ----------

export function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  const p = usePalette();
  return (
    <View style={styles.metric}>
      <Text style={{ fontSize: 12, color: p.muted }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: color ?? p.text }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 11, color: p.muted }}>{sub}</Text> : null}
    </View>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.metricGrid}>{children}</View>;
}

/** Vertical bars, one per year; supports negative values with a zero line. */
export function YearBarChart({
  points,
  height = 140,
}: {
  points: { label: string; value: number }[];
  height?: number;
}) {
  const p = usePalette();
  const values = points.map((point) => point.value);
  const maxValue = Math.max(0, ...values);
  const minValue = Math.min(0, ...values);
  const range = maxValue - minValue || 1;
  const zeroY = (maxValue / range) * height;

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ height, justifyContent: "space-between" }}>
        <Text style={{ fontSize: 10, color: p.muted }}>{fmtCompact(maxValue)}</Text>
        <Text style={{ fontSize: 10, color: p.muted }}>{fmtCompact(minValue)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ height }}>
          <View
            style={{
              position: "absolute",
              top: zeroY,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: p.border,
            }}
          />
          <View style={{ flexDirection: "row", height }}>
            {points.map((point) => {
              const barHeight = Math.max(2, (Math.abs(point.value) / range) * height);
              const top = point.value >= 0 ? zeroY - barHeight : zeroY;
              return (
                <View key={point.label} style={{ flex: 1, marginHorizontal: 2 }}>
                  <View
                    style={{
                      position: "absolute",
                      top,
                      left: 0,
                      right: 0,
                      height: barHeight,
                      borderRadius: 3,
                      backgroundColor: point.value >= 0 ? p.good : p.bad,
                    }}
                  />
                </View>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: "row", marginTop: 4 }}>
          {points.map((point) => (
            <Text
              key={point.label}
              style={{ flex: 1, textAlign: "center", fontSize: 10, color: p.muted }}>
              {point.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Horizontal bars (tornado / rankings). Bar length scales to the largest |value|. */
export function HBarChart({
  rows,
  formatValue = fmtCompact,
}: {
  rows: { label: string; value: number; display?: string; highlight?: boolean }[];
  formatValue?: (value: number) => string;
}) {
  const p = usePalette();
  const maxAbs = Math.max(1e-9, ...rows.map((row) => Math.abs(row.value)));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((row) => (
        <View key={row.label}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 12,
                color: p.text,
                fontWeight: row.highlight ? "700" : "400",
              }}>
              {row.label}
            </Text>
            <Text style={{ fontSize: 12, color: p.muted }}>
              {row.display ?? formatValue(row.value)}
            </Text>
          </View>
          <View style={{ height: 10, backgroundColor: p.border, borderRadius: 5, marginTop: 3 }}>
            <View
              style={{
                width: `${Math.max(2, (Math.abs(row.value) / maxAbs) * 100)}%`,
                height: 10,
                borderRadius: 5,
                backgroundColor: row.value >= 0 ? (row.highlight ? p.good : p.accent) : p.bad,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export interface TableColumn {
  key: string;
  label?: string;
  width?: number;
  align?: "left" | "right";
  format?: (value: any) => string;
}

/** Horizontally scrollable table over Row[] records. */
export function DataTable({ rows, columns }: { rows: Row[]; columns: TableColumn[] }) {
  const p = usePalette();
  const cellStyle = (column: TableColumn): object => ({
    width: column.width ?? 110,
    paddingRight: 10,
    fontSize: 12,
    textAlign: column.align ?? "right",
  });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={[styles.tableHeader, { borderColor: p.border }]}>
          {columns.map((column) => (
            <Text key={column.key} style={[cellStyle(column), { color: p.muted, fontWeight: "700" }]}>
              {column.label ?? column.key}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => (
          <View key={index} style={[styles.tableRow, { borderColor: p.border }]}>
            {columns.map((column) => (
              <Text key={column.key} style={[cellStyle(column), { color: p.text }]}>
                {column.format ? column.format(row[column.key]) : String(row[column.key] ?? "—")}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
  },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  banner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    minWidth: 64,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  metric: {
    width: "47%",
    gap: 2,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
    columnGap: 12,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
