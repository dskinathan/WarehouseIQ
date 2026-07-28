import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { supabase } from "../../lib/supabaseClient";
import { uploadPalletPhoto } from "../../lib/uploadPhoto";
import { useAuth } from "../../lib/AuthProvider";
import { theme } from "../../components/ui";
import type { ConfirmPalletReceiptResult, ExtractionResult, Location } from "../../lib/database.types";
import ScanLocationView from "./ScanLocationView";
import PhotographView from "./PhotographView";
import ReviewConfirmView from "./ReviewConfirmView";

type Step =
  | { name: "scan_location" }
  | { name: "photograph"; location: Location }
  | { name: "processing"; location: Location; photoUri: string }
  | {
      name: "review";
      location: Location;
      photoUri: string;
      storagePath: string;
      extraction: ExtractionResult;
      preview: ConfirmPalletReceiptResult;
      idempotencyKey: string;
    }
  | { name: "success"; location: Location };

// The receiving loop, end to end. Recommendation made and implemented
// here, not just the literal step order given: scan the location ONCE
// per session, then loop Photograph -> Review/Confirm for as many pallets
// as are actually at that location, instead of re-scanning a QR code
// before every single pallet. Most receiving is multi-pallet at one spot
// — re-scanning every time is exactly the kind of friction that fails the
// "would I enjoy scanning 500 pallets today" test. "Change Location" is
// always one tap away for when the worker actually does move.
export default function ReceivingFlow() {
  const { membership } = useAuth();
  const [step, setStep] = useState<Step>({ name: "scan_location" });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [quantityOverride, setQuantityOverride] = useState<number | null>(null);

  function resetToPhotograph(location: Location) {
    setQuantityOverride(null);
    setError(null);
    setStep({ name: "photograph", location });
  }

  async function handleCaptured(location: Location, photoUri: string) {
    setStep({ name: "processing", location, photoUri });
    setError(null);

    try {
      if (!membership) throw new Error("no active organization membership");

      const storagePath = await uploadPalletPhoto(membership.org_id, photoUri);

      const { data: extraction, error: extractError } = await supabase.functions.invoke<ExtractionResult>(
        "extract-pallet",
        { body: { photo_storage_path: storagePath } }
      );
      if (extractError || !extraction) throw extractError ?? new Error("extraction failed");

      const idempotencyKey = Crypto.randomUUID();

      const { data: preview, error: previewError } = await supabase.rpc("confirm_pallet_receipt", {
        p_location_id: location.id,
        p_photo_storage_path: storagePath,
        p_ai_extraction_raw: extraction,
        p_pallet_label_id: extraction.pallet_label_id,
        p_po_number: extraction.po_number,
        p_manufacturer: extraction.manufacturer,
        p_product: extraction.product,
        p_quantity: extraction.quantity,
        p_serial_numbers: extraction.serial_numbers,
        p_confidence: extraction.confidence,
        p_corrected_fields: [],
        p_log_as_untracked: false,
        p_idempotency_key: idempotencyKey,
        p_dry_run: true,
      });
      if (previewError) throw previewError;

      setStep({
        name: "review",
        location,
        photoUri,
        storagePath,
        extraction,
        preview: preview as ConfirmPalletReceiptResult,
        idempotencyKey,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please retake the photo.");
      setStep({ name: "photograph", location });
    }
  }

  async function submitConfirm(
    location: Location,
    storagePath: string,
    extraction: ExtractionResult,
    idempotencyKey: string,
    logAsUntracked: boolean
  ) {
    setConfirming(true);
    setError(null);
    try {
      const correctedFields = quantityOverride !== null ? ["quantity"] : [];

      const { error: confirmError } = await supabase.rpc("confirm_pallet_receipt", {
        p_location_id: location.id,
        p_photo_storage_path: storagePath,
        p_ai_extraction_raw: extraction,
        p_pallet_label_id: extraction.pallet_label_id,
        p_po_number: extraction.po_number,
        p_manufacturer: extraction.manufacturer,
        p_product: extraction.product,
        p_quantity: quantityOverride ?? extraction.quantity,
        p_serial_numbers: extraction.serial_numbers,
        p_confidence: extraction.confidence,
        p_corrected_fields: correctedFields,
        p_log_as_untracked: logAsUntracked,
        p_idempotency_key: idempotencyKey,
        p_dry_run: false,
      });
      if (confirmError) throw confirmError;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep({ name: "success", location });
      // Brief, wordless confirmation, then straight back into the loop —
      // no "thank you" screen requiring a tap to continue. See PRODUCT.md.
      setTimeout(() => resetToPhotograph(location), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      setConfirming(false);
    }
  }

  if (step.name === "scan_location") {
    return <ScanLocationView onLocationScanned={(location) => setStep({ name: "photograph", location })} />;
  }

  if (step.name === "photograph") {
    return (
      <View style={styles.flex}>
        <PhotographView
          location={step.location}
          onCaptured={(uri) => handleCaptured(step.location, uri)}
          onChangeLocation={() => setStep({ name: "scan_location" })}
        />
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  if (step.name === "processing") {
    return (
      <View style={styles.center}>
        <Text style={styles.processingText}>Reading pallet...</Text>
      </View>
    );
  }

  if (step.name === "review") {
    return (
      <ReviewConfirmView
        photoUri={step.photoUri}
        extraction={step.extraction}
        preview={step.preview}
        quantityOverride={quantityOverride}
        onQuantityChange={setQuantityOverride}
        onRetake={() => resetToPhotograph(step.location)}
        onLogAsUntracked={() => submitConfirm(step.location, step.storagePath, step.extraction, step.idempotencyKey, true)}
        onConfirm={() => submitConfirm(step.location, step.storagePath, step.extraction, step.idempotencyKey, false)}
        confirming={confirming}
      />
    );
  }

  // success
  return (
    <View style={styles.center}>
      <Text style={styles.successText}>Saved ✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  processingText: { color: theme.text, fontSize: 20, fontWeight: "600" },
  successText: { color: theme.good, fontSize: 28, fontWeight: "800" },
  errorBanner: { position: "absolute", bottom: 160, left: 20, right: 20, backgroundColor: theme.bad, borderRadius: 12, padding: 12 },
  errorText: { color: "#fff", textAlign: "center", fontWeight: "600" },
});
