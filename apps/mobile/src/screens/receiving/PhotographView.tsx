import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, type CameraView as CameraViewType } from "expo-camera";
import { theme } from "../../components/ui";
import type { Location } from "../../lib/database.types";

// docs/product/SCREENS.md #20 Photograph Pallet — exists to capture the
// one piece of evidence everything downstream depends on: what the AI
// reads, and the permanent proof photo the audit trail requires. Opens
// automatically after a location scan (or after each Confirm, looping
// for the next pallet at the same location) — never a menu tap away.
export default function PhotographView({
  location,
  onCaptured,
  onChangeLocation,
}: {
  location: Location;
  onCaptured: (localUri: string) => void;
  onChangeLocation: () => void;
}) {
  const cameraRef = useRef<CameraViewType>(null);
  const [capturing, setCapturing] = useState(false);

  async function handleCapture() {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) onCaptured(photo.uri);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.header}>
        <Text style={styles.locationText}>{location.name}</Text>
        <Pressable onPress={onChangeLocation} hitSlop={12}>
          <Text style={styles.changeLink}>Change Location</Text>
        </Pressable>
      </View>

      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>Capture the full label</Text>
      </View>

      <View style={styles.shutterRow}>
        <Pressable
          onPress={handleCapture}
          disabled={capturing}
          style={({ pressed }) => [styles.shutter, { opacity: pressed || capturing ? 0.7 : 1 }]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    position: "absolute",
    top: 56,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationText: { color: theme.text, fontSize: 18, fontWeight: "700" },
  changeLink: { color: theme.accent, fontSize: 16, fontWeight: "600" },
  hint: { position: "absolute", top: 110, left: 0, right: 0, alignItems: "center" },
  hintText: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  shutterRow: { position: "absolute", bottom: 56, left: 0, right: 0, alignItems: "center" },
  shutter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 5,
    borderColor: theme.text,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.text },
});
