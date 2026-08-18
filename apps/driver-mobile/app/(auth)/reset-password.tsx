import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "../../src/context/auth-context";
import { getSupabaseClient } from "../../src/supabase";
import { getAuthErrorMessage } from "@gueguense/domain";

export default function DriverResetPasswordScreen() {
  const { session, updatePassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(!session);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handleDeepLink() {
      if (session) {
        setSessionChecking(false);
        return;
      }
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          const parsed = Linking.parse(initialUrl);
          const queryParams = parsed.queryParams || {};
          const code = queryParams.code as string | undefined;

          const supabase = getSupabaseClient();
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              setErrorMessage(
                getAuthErrorMessage("AUTH_PASSWORD_RECOVERY_INVALID"),
              );
            }
          }
        }
      } catch {
        // Continue and check session
      } finally {
        setSessionChecking(false);
      }
    }

    handleDeepLink();
  }, [session]);

  const handleUpdate = async () => {
    if (!session) {
      setErrorMessage(
        "No se detectó una sesión de recuperación válida. Por favor solicita un nuevo enlace.",
      );
      return;
    }
    if (!password || !confirmPassword) {
      setErrorMessage("Por favor completa todos los campos.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage(getAuthErrorMessage("AUTH_WEAK_PASSWORD"));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      setErrorMessage(error);
    } else {
      setSuccessMessage("Contraseña actualizada exitosamente. Redirigiendo...");
      setTimeout(() => {
        router.replace("/(auth)/login");
      }, 2000);
    }
  };

  if (sessionChecking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066CC" />
        <Text style={[styles.subtitle, { marginTop: 12 }]}>
          Validando enlace de recuperación...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nueva Contraseña</Text>
      <Text style={styles.subtitle}>
        Establece una nueva contraseña para tu cuenta de motorizado
      </Text>

      {!session && !errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            No se detectó una sesión activa de recuperación. Por favor utiliza
            el enlace enviado a tu correo.
          </Text>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {successMessage && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      <TextInput
        style={[styles.input, !session && styles.inputDisabled]}
        placeholder="Nueva contraseña (mínimo 8 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!!session}
      />

      <TextInput
        style={[styles.input, !session && styles.inputDisabled]}
        placeholder="Confirmar nueva contraseña"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!!session}
      />

      <TouchableOpacity
        style={[styles.button, (!session || loading) && styles.buttonDisabled]}
        onPress={handleUpdate}
        disabled={!session || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Actualizar Contraseña</Text>
        )}
      </TouchableOpacity>

      {!session && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={styles.secondaryButtonText}>
            Volver al Inicio de Sesión
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F9FAFB",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center",
  },
  successBanner: {
    backgroundColor: "#D1FAE5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  successText: {
    color: "#065F46",
    fontSize: 14,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
  button: {
    backgroundColor: "#0066CC",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 16,
    padding: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#0066CC",
    fontSize: 14,
    fontWeight: "500",
  },
});
