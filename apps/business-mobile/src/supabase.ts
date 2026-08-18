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
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => {
  const prev = lockPromise;
  let resolveNext: () => void;
  lockPromise = new Promise((res) => {
    resolveNext = res as () => void;
  });

  try {
    if (acquireTimeout > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Timeout acquiring client lock "${name}" after ${acquireTimeout}ms`,
            ),
          );
        }, acquireTimeout);
      });
      try {
        await Promise.race([prev, timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } else {
      await prev;
    }
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

  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

  clientInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
