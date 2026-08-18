import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { getSupabaseClient } from "../../src/supabase";
import { useAuth } from "../../src/context/auth-context";

export default function DriverAuthCallbackScreen() {
  const router = useRouter();
  const { setRecoveryContext } = useAuth();
  const params = useLocalSearchParams<{
    code?: string;
    next?: string;
    type?: string;
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
  }>();
  const [statusText, setStatusText] = useState("Verificando autenticación...");

  useEffect(() => {
    let isMounted = true;

    async function handleAuthCallback() {
      const supabase = getSupabaseClient();

      try {
        let code = params.code;
        let next = params.next;
        let accessToken = params.access_token;
        let refreshToken = params.refresh_token;
        let type = params.type;

        // If parameters are in the initial URL or hash, parse them
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          const parsed = Linking.parse(initialUrl);
          code = code || (parsed.queryParams?.code as string);
          next = next || (parsed.queryParams?.next as string);
          accessToken =
            accessToken || (parsed.queryParams?.access_token as string);
          refreshToken =
            refreshToken || (parsed.queryParams?.refresh_token as string);
          type = type || (parsed.queryParams?.type as string);

          if (initialUrl.includes("#")) {
            const hashString = initialUrl.split("#")[1];
            if (hashString) {
              const hashParams = new URLSearchParams(hashString);
              accessToken =
                accessToken || hashParams.get("access_token") || undefined;
              refreshToken =
                refreshToken || hashParams.get("refresh_token") || undefined;
              type = type || hashParams.get("type") || undefined;
            }
          }
        }

        const isRecovery =
          type === "recovery" ||
          next === "/reset-password" ||
          next === "/(auth)/reset-password";

        if (accessToken && refreshToken) {
          if (isMounted) setStatusText("Estableciendo sesión segura...");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            router.replace("/(auth)/login");
            return;
          }
        } else if (code) {
          if (isMounted) setStatusText("Estableciendo sesión segura...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            router.replace("/(auth)/login");
            return;
          }
        }

        if (isRecovery) {
          setRecoveryContext(true);
          router.replace("/(auth)/reset-password");
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          router.replace("/(protected)");
        } else {
          router.replace("/(auth)/login");
        }
      } catch {
        router.replace("/(auth)/login");
      }
    }

    handleAuthCallback();

    return () => {
      isMounted = false;
    };
  }, [params, router, setRecoveryContext]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0284C7" />
      <Text style={styles.text}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
  },
});
