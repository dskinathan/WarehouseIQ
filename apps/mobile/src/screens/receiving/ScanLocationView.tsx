import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { supabase } from "../../lib/supabaseClient";
import { theme, BigButton } from "../../components/ui";
import type { Location } from "../../lib/database.types";

// docs/product/SCREENS.md #19 Scan Location — why this screen exists: the
// entire verification depends on knowing WHERE first. A perfectly-read
// pallet filed under the wrong location is still a wrong answer, so
// location has to be established before the AI ever runs, not after.
//
// This doubles as the app's post-login "home" — there is no separate
// menu screen. A worker opens the app and is immediately ready to scan;
// "workers should never need to navigate menus during a normal receiving
// workflow" (M2 brief) is a literal architectural choice here, not just a
// visual one.
export default function ScanLocationView({ onLocationScanned }: { onLocationScanned: (location: Location) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastScanned = useRef<string | null>(null);

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (resolving || data === lastScanned.current) return;
    lastScanned.current = data;
    setResolving(true);
    setError(null);

    const { data: location, error: lookupError } = await supabase
      .from("locations")
      .select("*")
      .eq("qr_token", data)
      .eq("status", "active")
      .maybeSingle();

    setResolving(false);

    if (lookupError || !location) {
      setError("That QR code isn't a recognized location.");
      // Allow re-scanning the same bad code after a moment rather than
      // permanently locking the scanner on one value.
      setTimeout(() => {
        lastScanned.current = null;
      }, 1500);
      return;
    }

    onLocationScanned(location as Location);
  }

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>WarehouseIQ needs camera access to scan location codes.</Text>
        <BigButton label="Allow Camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {resolving ? "Checking location..." : "Point the camera at a location QR code"}
        </Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  message: { color: theme.text, fontSize: 18, textAlign: "center" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { width: 260, height: 260, borderWidth: 3, borderColor: theme.accent, borderRadius: 24 },
  footer: { position: "absolute", bottom: 48, left: 24, right: 24, alignItems: "center" },
  footerText: { color: theme.text, fontSize: 18, fontWeight: "600", textAlign: "center" },
  errorText: { color: theme.bad, fontSize: 16, marginTop: 8, textAlign: "center" },
});
