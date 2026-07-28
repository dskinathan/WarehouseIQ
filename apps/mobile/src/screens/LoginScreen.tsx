import { useState } from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";
import { supabase } from "../lib/supabaseClient";
import { BigButton, ScreenContainer, theme } from "../components/ui";

// docs/product/SCREENS.md #1 Login, redesigned for the worker app in M2:
// high-contrast, large targets, minimal typing (a worker types a password
// once per shift at most — everything after this screen is scan/photo/tap).
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) setError(signInError.message);
  }

  return (
    <ScreenContainer style={styles.center}>
      <Text style={styles.title}>WarehouseIQ</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={theme.subtext}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={theme.subtext}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.buttonWrap}>
        <BigButton label={submitting ? "Logging in..." : "Log In"} onPress={handleLogin} disabled={submitting} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center" },
  title: { color: theme.text, fontSize: 32, fontWeight: "800", textAlign: "center", marginBottom: 32 },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    color: theme.text,
    paddingHorizontal: 16,
    fontSize: 18,
    marginBottom: 16,
  },
  error: { color: theme.bad, marginBottom: 16, fontSize: 16 },
  buttonWrap: { marginTop: 8 },
});
