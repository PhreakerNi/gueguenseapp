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
import { useAuth } from "../../src/context/auth-context";
import { getAuthErrorMessage } from "@gueguense/domain";

export default function BusinessResetPasswordScreen() {
  const { session, isPasswordRecovery, updatePassword, isLoading } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canResetPassword = session != null && isPasswordRecovery === true;

  useEffect(() => {
    if (!isLoading && !canResetPassword) {
      setErrorMessage(
        "No se detectó un contexto de recuperación válido. Por favor solicita un nuevo enlace de recuperación.",
      );
    }
  }, [isLoading, canResetPassword]);

  const handleUpdate = async () => {
    if (!canResetPassword) {
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
      setSuccessMessage(
        "Contraseña actualizada exitosamente. Redirigiendo al inicio de sesión...",
      );
      setTimeout(() => {
        router.replace("/(auth)/login");
      }, 1500);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066CC" />
        <Text style={[styles.subtitle, { marginTop: 12 }]}>
          Validando estado de sesión...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nueva Contraseña</Text>
      <Text style={styles.subtitle}>
        Establece una nueva contraseña para tu cuenta de negocio
      </Text>

      {!canResetPassword && !errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            No se detectó un contexto de recuperación activo. Por favor utiliza
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
        style={[styles.input, !canResetPassword && styles.inputDisabled]}
        placeholder="Nueva contraseña (mínimo 8 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={canResetPassword && !loading}
      />

      <TextInput
        style={[styles.input, !canResetPassword && styles.inputDisabled]}
        placeholder="Confirmar nueva contraseña"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={canResetPassword && !loading}
      />

      <TouchableOpacity
        style={[
          styles.button,
          (!canResetPassword || loading) && styles.buttonDisabled,
        ]}
        onPress={handleUpdate}
        disabled={!canResetPassword || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Actualizar Contraseña</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace("/(auth)/login")}
      >
        <Text style={styles.backButtonText}>Volver al Inicio de Sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 24,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
    color: "#94A3B8",
  },
  button: {
    height: 48,
    backgroundColor: "#0066CC",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#94A3B8",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    marginTop: 16,
    alignItems: "center",
    padding: 8,
  },
  backButtonText: {
    color: "#0066CC",
    fontSize: 14,
    fontWeight: "500",
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
  },
  successBanner: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: "#166534",
    fontSize: 14,
  },
});
