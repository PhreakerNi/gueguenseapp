import React, { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { AuthProvider, useAuth } from "../src/context/auth-context";
import { evaluateDriverAccess } from "@gueguense/domain";

function RootNavigation() {
  const { session, identity, isLoading } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session) {
      if (!inAuthGroup) {
        router.replace("/(auth)/login");
      }
      return;
    }

    const evaluation = evaluateDriverAccess(identity);

    if (inAuthGroup) {
      if (evaluation.allowed) {
        router.replace("/(protected)");
      } else if (evaluation.reason === "ONBOARDING_REQUIRED") {
        router.replace("/(protected)/onboarding-required");
      } else if (evaluation.reason === "ACCOUNT_RESTRICTED") {
        router.replace("/(protected)/account-restricted");
      }
      return;
    }

    const currentScreen = segments[1];

    if (
      evaluation.reason === "ONBOARDING_REQUIRED" &&
      currentScreen !== "onboarding-required"
    ) {
      router.replace("/(protected)/onboarding-required");
    } else if (
      evaluation.reason === "ACCOUNT_RESTRICTED" &&
      currentScreen !== "account-restricted"
    ) {
      router.replace("/(protected)/account-restricted");
    } else if (
      evaluation.allowed &&
      (currentScreen === "onboarding-required" ||
        currentScreen === "account-restricted")
    ) {
      router.replace("/(protected)");
    }
  }, [session, identity, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigation />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
});
