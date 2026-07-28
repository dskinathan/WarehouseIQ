import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AuthProvider, useAuth } from "./src/lib/AuthProvider";
import LoginScreen from "./src/screens/LoginScreen";
import ReceivingFlow from "./src/screens/receiving/ReceivingFlow";
import { theme } from "./src/components/ui";

// No navigation library, deliberately (see docs/architecture/PLAN.md M2
// notes): the receiving loop is fundamentally a linear state machine, not
// a set of independently-reachable screens a worker chooses between.
// React Navigation's screen-stack model would add real complexity for no
// benefit here, and would work against "workers should never need to
// navigate menus." AuthGate below is the only top-level branch: logged
// out sees Login, logged in sees the receiving flow — nothing else.
function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  return session ? <ReceivingFlow /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AuthGate />
    </AuthProvider>
  );
}
