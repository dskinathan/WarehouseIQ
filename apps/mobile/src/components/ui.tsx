import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

// Every value here traces back to docs/design/DESIGN.md's mobile
// usability rules and the M2 brief: 44px is the accessibility-guideline
// minimum tap target — this app uses 56-64px because a gloved fingertip
// needs more margin for error than a bare one. Contrast is pushed higher
// than the web dashboard specifically for direct sunlight readability.
// One primary color, fixed status colors, no decoration.

const COLORS = {
  bg: "#0a0a0a",
  surface: "#171717",
  border: "#2e2e2e",
  text: "#ffffff",
  subtext: "#a3a3a3",
  accent: "#3b82f6",
  good: "#22c55e",
  warning: "#f59e0b",
  bad: "#ef4444",
};

export function BigButton({
  label,
  onPress,
  disabled,
  variant = "primary",
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  const backgroundColor =
    variant === "primary" ? COLORS.accent : variant === "danger" ? COLORS.bad : COLORS.surface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.bigButton,
        { backgroundColor, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "secondary" && { borderWidth: 1, borderColor: COLORS.border },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.text} />
      ) : (
        <Text style={styles.bigButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ScreenContainer({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function StatusBadge({ tone, children }: { tone: "good" | "warning" | "bad" | "info"; children: ReactNode }) {
  const color = tone === "good" ? COLORS.good : tone === "warning" ? COLORS.warning : tone === "bad" ? COLORS.bad : COLORS.accent;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{children}</Text>
    </View>
  );
}

export const theme = COLORS;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 20,
  },
  bigButton: {
    minHeight: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  bigButtonText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  badge: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
