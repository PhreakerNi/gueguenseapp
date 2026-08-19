import React, { useEffect, useState, useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import {
  validateRecoveryTokens,
  DeepLinkDeduplicator,
} from "@gueguense/domain";
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
  const deduplicatorRef = useRef(new DeepLinkDeduplicator());

  useEffect(() => {
    let isMounted = true;

    async function processUrl(urlStr?: string | null) {
      if (!urlStr) return;
      if (!deduplicatorRef.current.shouldProcess(urlStr)) return;

      const supabase = getSupabaseClient();
      try {
        let accessToken = params.access_token;
        let refreshToken = params.refresh_token;
        let type = params.type;
        let next = params.next;

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

        const isRecoveryRoute =
          type === "recovery" ||
          next === "/reset-password" ||
          next === "/(auth)/reset-password";

        // CRITICAL: Validate recovery tokens using canonical domain helper
        if (isRecoveryRoute) {
          const hasValidRecoveryTokens = validateRecoveryTokens(
            "recovery",
            accessToken,
            refreshToken,
          );

          if (!hasValidRecoveryTokens) {
            // Invalid recovery link without valid tokens. Cannot reuse normal session.
            setRecoveryContext(false);
            router.replace("/(auth)/login");
            return;
          }

          if (isMounted) setStatusText("Validando enlace de recuperación...");
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          });

          if (error || !data.session) {
            setRecoveryContext(false);
            router.replace("/(auth)/login");
            return;
          }

          setRecoveryContext(true);
          router.replace("/(auth)/reset-password");
          return;
        }

        // Normal callback: clear recovery context
        setRecoveryContext(false);

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

          router.replace("/(protected)");
          return;
        }

        // Normal session check for standard navigation
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          router.replace("/(protected)");
        } else {
          router.replace("/(auth)/login");
        }
      } catch {
        setRecoveryContext(false);
        router.replace("/(auth)/login");
      }
    }

    // Cold start URL check
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        processUrl(initialUrl);
      } else {
        const fallbackUrl = Linking.createURL("auth/callback", {
          queryParams: params as Record<string, string>,
        });
        processUrl(fallbackUrl);
      }
    });

    // App already open URL event listener (warm deep link)
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
