import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { getSupabaseClient } from "../../src/supabase";

export default function DriverAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    next?: string;
    error_description?: string;
  }>();
  const [statusText, setStatusText] = useState("Verificando autenticación...");

  useEffect(() => {
    async function handleAuthCallback() {
      const supabase = getSupabaseClient();

      try {
        let code = params.code;
        let next = params.next;

        // If not in router params, parse from Linking URL
        if (!code) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const parsed = Linking.parse(initialUrl);
            code = (parsed.queryParams?.code as string) || undefined;
            next = (parsed.queryParams?.next as string) || next;
          }
        }

        if (code) {
          setStatusText("Estableciendo sesión segura...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            router.replace("/(auth)/login");
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          if (next === "/reset-password" || next === "/(auth)/reset-password") {
            router.replace("/(auth)/reset-password");
          } else {
            router.replace("/(protected)");
          }
        } else {
          router.replace("/(auth)/login");
        }
      } catch {
        router.replace("/(auth)/login");
      }
    }

    handleAuthCallback();
  }, [params, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0066CC" />
      <Text style={styles.text}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F9FAFB",
  },
  text: {
    marginTop: 16,
    fontSize: 15,
    color: "#4B5563",
    textAlign: "center",
  },
});
