import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../../src/context/auth-context";
import { getSupabaseClient } from "../../src/supabase";
import { driverOnboardingSchema } from "@gueguense/schemas";

export default function DriverOnboardingRequiredScreen() {
  const { identity, signOut, refreshIdentity } = useAuth();

  const [nationalIdNumber, setNationalIdNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("2022");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleLicensePlate, setVehicleLicensePlate] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const driver = identity?.driver;
  const isPending =
    driver?.verificationStatus === "PENDING" ||
    driver?.verificationStatus === "UNDER_REVIEW";
  const isRejected = driver?.verificationStatus === "REJECTED";

  const handleRegister = async () => {
    setErrorMsg(null);

    const validation = driverOnboardingSchema.safeParse({
      nationalIdNumber,
      licenseNumber,
      vehicleMake,
      vehicleModel,
      vehicleYear: parseInt(vehicleYear, 10),
      vehicleColor,
      vehicleLicensePlate,
    });

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }

    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.rpc("register_driver_onboarding", {
        p_national_id_number: nationalIdNumber.trim(),
        p_license_number: licenseNumber.trim(),
        p_vehicle_make: vehicleMake.trim(),
        p_vehicle_model: vehicleModel.trim(),
        p_vehicle_year: parseInt(vehicleYear, 10),
        p_vehicle_color: vehicleColor.trim(),
        p_vehicle_license_plate: vehicleLicensePlate.trim().toUpperCase(),
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data) {
        // Automatically submit initial documents
        await client.rpc("submit_driver_document", {
          p_document_type: "NATIONAL_ID",
          p_storage_path: `${identity?.userId}/national_id.jpg`,
        });
        await client.rpc("submit_driver_document", {
          p_document_type: "DRIVER_LICENSE",
          p_storage_path: `${identity?.userId}/driver_license.jpg`,
        });

        await refreshIdentity();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReupload = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client.rpc("submit_driver_document", {
        p_document_type: "NATIONAL_ID",
        p_storage_path: `${identity?.userId}/national_id_updated.jpg`,
      });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      await refreshIdentity();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Documentación en Revisión</Text>
        <Text style={styles.message}>
          Tu solicitud y documentos están siendo verificados por el equipo de
          operaciones. Te notificaremos cuando tu cuenta sea activada.
        </Text>
        <Text style={styles.detail}>Estado: PENDIENTE DE APROBACIÓN</Text>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshIdentity}
          disabled={loading}
        >
          <Text style={styles.refreshButtonText}>Actualizar Estado</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isRejected) {
    return (
      <View style={styles.centerContainer}>
        <Text style={[styles.title, { color: "#DC2626" }]}>
          Documentación Rechazada
        </Text>
        <Text style={styles.message}>
          Tu solicitud fue rechazada por el equipo de verificación. Por favor
          vuelve a cargar tus documentos con fotos claras y legibles.
        </Text>

        {errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleReupload}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              Reenviar Documentos para Revisión
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.title}>Registro de Conductor</Text>
        <Text style={styles.message}>
          Ingresa tus datos personales y de tu motocicleta para solicitar tu
          ingreso a la flota.
        </Text>
        <Text style={styles.detail}>
          Usuario: {identity?.profile.fullName ?? identity?.email}
        </Text>

        {errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Número de Cédula de Identidad</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 001-010190-0001A"
            value={nationalIdNumber}
            onChangeText={setNationalIdNumber}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Número de Licencia de Conducir</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. LIC-12345678"
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Marca de Motocicleta</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Yamaha, Honda, Suzuki"
            value={vehicleMake}
            onChangeText={setVehicleMake}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Modelo</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. FZ-S, CB125, Boxer"
            value={vehicleModel}
            onChangeText={setVehicleModel}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Año de Fabricación</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 2022"
            value={vehicleYear}
            onChangeText={setVehicleYear}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Color de la Motocicleta</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Negro, Rojo, Azul"
            value={vehicleColor}
            onChangeText={setVehicleColor}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Número de Placa</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. M-123456"
            value={vehicleLicensePlate}
            onChangeText={setVehicleLicensePlate}
            autoCapitalize="characters"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              Registrar y Enviar Documentos
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: "#F9FAFB",
    padding: 24,
  },
  centerContainer: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 22,
  },
  detail: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 20,
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#EF4444",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center",
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
  },
  submitButton: {
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 12,
  },
  refreshButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  refreshButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "transparent",
    paddingVertical: 12,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "600",
  },
});
