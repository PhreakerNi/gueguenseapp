import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import type { Database } from "@gueguense/types";

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

let lockPromise: Promise<unknown> = Promise.resolve();

const processLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => {
  const prev = lockPromise;
  let resolveNext: () => void;
  lockPromise = new Promise((res) => {
    resolveNext = res as () => void;
  });
  try {
    await prev;
    return await fn();
  } finally {
    resolveNext!();
  }
};

type AppSupabaseClient = ReturnType<typeof createClient<Database>>;
let clientInstance: AppSupabaseClient | null = null;

export function getSupabaseClient(): AppSupabaseClient {
  if (clientInstance) {
    return clientInstance;
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase configuration: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be defined.",
    );
  }

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  clientInstance = client;

  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  });

  return client;
}
