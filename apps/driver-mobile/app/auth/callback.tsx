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
    next?: string;
    type?: string;
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
  }>();
  const [statusText, setStatusText] = useState("Verificando autenticación...");

  useEffect(() => {
    let isMounted = true;

    async function processUrl(urlStr?: string | null) {
      const supabase = getSupabaseClient();
      try {
        let accessToken = params.access_token;
        let refreshToken = params.refresh_token;
        let type = params.type;
        let next = params.next;

        if (urlStr) {
          const parsed = Linking.parse(urlStr);
          accessToken =
            accessToken || (parsed.queryParams?.access_token as string);
          refreshToken =
            refreshToken || (parsed.queryParams?.refresh_token as string);
          type = type || (parsed.queryParams?.type as string);
          next = next || (parsed.queryParams?.next as string);

          if (urlStr.includes("#")) {
            const hashString = urlStr.split("#")[1];
            if (hashString) {
              const hashParams = new URLSearchParams(hashString);
              accessToken =
                accessToken || hashParams.get("access_token") || undefined;
              refreshToken =
                refreshToken || hashParams.get("refresh_token") || undefined;
              type = type || hashParams.get("type") || undefined;
              next = next || hashParams.get("next") || undefined;
            }
          }
        }

        const isRecovery =
          type === "recovery" ||
          next === "/reset-password" ||
          next === "/(auth)/reset-password";

        if (accessToken && refreshToken) {
          if (isMounted) setStatusText("Estableciendo sesión segura...");
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error || !data.session) {
            router.replace("/(auth)/login");
            return;
          }

          if (isRecovery) {
            setRecoveryContext(true);
            router.replace("/(auth)/reset-password");
            return;
          }

          router.replace("/(protected)");
          return;
        }

        // Check if there is already an active session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          if (isRecovery) {
            setRecoveryContext(true);
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

    // Cold start URL check
    Linking.getInitialURL().then((initialUrl) => {
      processUrl(initialUrl);
    });

    // App already open URL event listener
    const subscription = Linking.addEventListener("url", (event) => {
      processUrl(event.url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [router, setRecoveryContext, params]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0284c7" />
      <Text style={styles.text}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
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
