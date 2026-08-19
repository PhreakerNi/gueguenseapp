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

type QueueEntry = {
  grant: () => void;
  isCancelled: boolean;
};

class Mutex {
  isLocked = false;
  queue: QueueEntry[] = [];

  async acquire(acquireTimeout: number, name: string): Promise<void> {
    if (!this.isLocked) {
      this.isLocked = true;
      return;
    }

    if (acquireTimeout === 0) {
      throw new Error(
        `Acquiring lock "${name}" failed immediately as it is already held`,
      );
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        grant: () => {},
        isCancelled: false,
      };

      let timer: ReturnType<typeof setTimeout> | undefined;

      if (acquireTimeout > 0) {
        timer = setTimeout(() => {
          entry.isCancelled = true;
          const idx = this.queue.indexOf(entry);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          reject(
            new Error(
              `Timeout acquiring client lock "${name}" after ${acquireTimeout}ms`,
            ),
          );
        }, acquireTimeout);
      }

      entry.grant = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };

      this.queue.push(entry);
    });
  }

  release(): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (!next.isCancelled) {
        next.grant();
        return;
      }
    }
    this.isLocked = false;
  }
}

const locks = new Map<string, Mutex>();

export const processLock = async <R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => {
  let mutex = locks.get(name);
  if (!mutex) {
    mutex = new Mutex();
    locks.set(name, mutex);
  }

  await mutex.acquire(acquireTimeout, name);
  try {
    return await fn();
  } finally {
    mutex.release();
    if (!mutex.isLocked && mutex.queue.length === 0) {
      locks.delete(name);
    }
  }
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
