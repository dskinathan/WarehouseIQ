import { Image, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BigButton, StatusBadge, theme } from "../../components/ui";
import { messageFor, blockingExceptions, warningExceptions } from "../../lib/exceptionMessages";
import type { ConfirmPalletReceiptResult, ExtractionResult } from "../../lib/database.types";

// docs/product/SCREENS.md #21+#22 (AI Review + Confirm), deliberately
// collapsed into ONE screen in M2 rather than the two originally
// specified — see PLAN.md's M2 notes. Why this matters: "if everything
// matches, confirmation should require only one tap" only actually
// happens if there's no separate review screen to click through first.
// This screen makes the empty/clean case nearly invisible (a one-line
// summary and a single button) and expands only for what's actually
// wrong — never a full field-by-field form nobody needed to see.
//
// No raw confidence percentages, no exception codes — every message here
// comes from exceptionMessages.ts's plain-language table. That's the
// worker-facing contract; the numeric confidence still exists server-side
// for managers/reports (docs/design/DESIGN.md §4b).
export default function ReviewConfirmView({
  photoUri,
  extraction,
  preview,
  quantityOverride,
  onQuantityChange,
  onRetake,
  onLogAsUntracked,
  onConfirm,
  confirming,
}: {
  photoUri: string;
  extraction: ExtractionResult;
  preview: ConfirmPalletReceiptResult;
  quantityOverride: number | null;
  onQuantityChange: (value: number) => void;
  onRetake: () => void;
  onLogAsUntracked: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const blocking = blockingExceptions(preview.exceptions);
  const warnings = warningExceptions(preview.exceptions);
  const hasUnknownPo = blocking.some((e) => e.type === "unknown_po");
  const otherBlocking = blocking.filter((e) => e.type !== "unknown_po");
  const hasQuantityIssue = preview.exceptions.some(
    (e) => e.type === "quantity_mismatch" || (e.type === "low_ai_confidence" && e.details?.field === "quantity")
  );
  const displayQuantity = quantityOverride ?? extraction.quantity ?? 0;

  if (hasUnknownPo) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Image source={{ uri: photoUri }} style={styles.photo} />
        <View style={styles.card}>
          <Text style={styles.issueTitle}>{messageFor(blocking.find((e) => e.type === "unknown_po")!)}</Text>
          <Text style={styles.issueSubtext}>PO {extraction.po_number ?? "(not read)"}</Text>
        </View>
        <View style={styles.buttonStack}>
          <BigButton label="Retake Photo" onPress={onRetake} variant="secondary" />
          <BigButton label="Log as Untracked" onPress={onLogAsUntracked} variant="primary" />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={{ uri: photoUri }} style={styles.photo} />

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLine}>{extraction.product ?? "Unknown product"}</Text>
        <Text style={styles.summarySub}>
          {extraction.manufacturer ?? "—"} · Qty {displayQuantity}
          {extraction.po_number ? ` · PO ${extraction.po_number}` : ""}
        </Text>
      </View>

      {hasQuantityIssue && (
        <View style={styles.card}>
          <Text style={styles.issueTitle}>Please verify quantity.</Text>
          <TextInput
            style={styles.quantityInput}
            keyboardType="number-pad"
            value={String(displayQuantity)}
            onChangeText={(text) => {
              const n = parseInt(text.replace(/[^0-9]/g, ""), 10);
              if (!Number.isNaN(n)) onQuantityChange(n);
            }}
          />
        </View>
      )}

      {warnings
        .filter((e) => !(e.type === "low_ai_confidence" && e.details?.field === "quantity") && e.type !== "quantity_mismatch")
        .map((e, i) => (
          <View key={i} style={styles.card}>
            <StatusBadge tone="warning">Please check</StatusBadge>
            <Text style={styles.issueTitle}>{messageFor(e)}</Text>
          </View>
        ))}

      {otherBlocking.map((e, i) => (
        <View key={i} style={styles.card}>
          <StatusBadge tone="bad">Needs manager approval</StatusBadge>
          <Text style={styles.issueTitle}>{messageFor(e)}</Text>
        </View>
      ))}

      <View style={styles.buttonStack}>
        <BigButton
          label={confirming ? "Saving..." : "Confirm"}
          onPress={onConfirm}
          disabled={confirming}
          loading={confirming}
        />
        <BigButton label="Retake Photo" onPress={onRetake} variant="secondary" disabled={confirming} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, backgroundColor: theme.bg, flexGrow: 1 },
  photo: { width: "100%", height: 180, borderRadius: 16, backgroundColor: theme.surface },
  summaryCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  summaryLine: { color: theme.text, fontSize: 22, fontWeight: "700" },
  summarySub: { color: theme.subtext, fontSize: 16, marginTop: 4 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  issueTitle: { color: theme.text, fontSize: 18, fontWeight: "600" },
  issueSubtext: { color: theme.subtext, fontSize: 15 },
  quantityInput: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.accent,
    color: theme.text,
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: 16,
  },
  buttonStack: { gap: 12, marginTop: 8 },
});
