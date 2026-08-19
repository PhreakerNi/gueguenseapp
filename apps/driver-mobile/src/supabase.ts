import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import type { Database } from "@gueguense/types";
import { processLock } from "@gueguense/config";

const ExpoSecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        return Promise.resolve(localStorage.getItem(key));
      }
      return Promise.resolve(null);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

type AppSupabaseClient = ReturnType<typeof createClient<Database>>;
let clientInstance: AppSupabaseClient | null = null;

export function getSupabaseClient(): AppSupabaseClient {
  if (clientInstance) {
    return clientInstance;
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing required Supabase environment variables: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.",
    );
  }

  clientInstance = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      clientInstance?.auth.startAutoRefresh();
    } else {
      clientInstance?.auth.stopAutoRefresh();
    }
  });

  return clientInstance;
}
