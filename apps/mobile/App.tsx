import { StyleSheet, Text, View } from "react-native";

// Placeholder entry point. M0 is schema/RLS/auth foundations only — the
// real Worker App screens (docs/product/SCREENS.md: Login, Scan Location,
// Photograph Pallet, AI Review, Confirm, Move, Search, Pallet Details,
// Update Lifecycle, Timeline) land starting in M2.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WarehouseIQ</Text>
      <Text>Worker App — screens land in M2. See docs/product/SCREENS.md.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 8 },
});
