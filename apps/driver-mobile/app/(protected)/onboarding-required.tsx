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
import {
  driverOnboardingSchema,
  vehicleRegistrationSchema,
} from "@gueguense/schemas";

export default function DriverOnboardingRequiredScreen() {
  const { identity, signOut, refreshIdentity } = useAuth();

  const [nationalIdNumber, setNationalIdNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("2023");
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

    const driverVal = driverOnboardingSchema.safeParse({
      nationalIdNumber,
      licenseNumber,
    });
    if (!driverVal.success) {
      setErrorMsg(
        driverVal.error.issues[0]?.message ?? "Datos personales inválidos",
      );
      return;
    }

    const vehicleVal = vehicleRegistrationSchema.safeParse({
      make: vehicleMake,
      model: vehicleModel,
      year: parseInt(vehicleYear, 10),
      color: vehicleColor,
      licensePlate: vehicleLicensePlate,
    });
    if (!vehicleVal.success) {
      setErrorMsg(
        vehicleVal.error.issues[0]?.message ?? "Datos de vehículo inválidos",
      );
      return;
    }

    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setErrorMsg("Sesión no válida. Inicia sesión nuevamente.");
        return;
      }

      const edgeUrl =
        process.env.EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";

      // 1. Step 1: Register Driver Profile via api-v1
      const driverRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/driver/onboarding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": `drv_${identity?.userId}_${nationalIdNumber.trim()}`,
          },
          body: JSON.stringify({
            national_id_number: nationalIdNumber.trim(),
            license_number: licenseNumber.trim(),
          }),
        },
      );

      const driverData = await driverRes.json();
      if (!driverRes.ok) {
        setErrorMsg(driverData.error || "Error al registrar conductor");
        return;
      }

      // 2. Step 2: Register Vehicle via api-v1
      const vehicleRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/driver/vehicles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": `veh_${identity?.userId}_${vehicleLicensePlate.trim()}`,
          },
          body: JSON.stringify({
            make: vehicleMake.trim(),
            model: vehicleModel.trim(),
            year: parseInt(vehicleYear, 10),
            color: vehicleColor.trim(),
            license_plate: vehicleLicensePlate.trim().toUpperCase(),
          }),
        },
      );

      const vehicleData = await vehicleRes.json();
      if (!vehicleRes.ok) {
        setErrorMsg(vehicleData.error || "Error al registrar vehículo");
        return;
      }

      // 3. Step 3: Request Signed Upload for Initial Mandatory Documents
      for (const docType of [
        "NATIONAL_ID",
        "DRIVER_LICENSE",
        "VEHICLE_REGISTRATION",
      ]) {
        const authRes = await fetch(
          `${edgeUrl}/functions/v1/api-v1/driver/documents/upload-authorization`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ document_type: docType }),
          },
        );

        if (authRes.ok) {
          const authData = await authRes.json();
          // Upload sample blob to signed URL
          const dummyBlob = new Blob(["%PDF-1.4 mock document content"], {
            type: "application/pdf",
          });

          await fetch(authData.upload_url, {
            method: "PUT",
            headers: { "Content-Type": "application/pdf" },
            body: dummyBlob,
          });

          // Commit document in api-v1
          await fetch(
            `${edgeUrl}/functions/v1/api-v1/driver/documents/commit`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "Idempotency-Key": `doc_${identity?.userId}_${docType}_initial`,
              },
              body: JSON.stringify({
                document_type: docType,
                storage_path: authData.storage_path,
              }),
            },
          );
        }
      }

      await refreshIdentity();
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
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setErrorMsg("Sesión no válida. Inicia sesión nuevamente.");
        return;
      }

      const edgeUrl =
        process.env.EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";

      const authRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ document_type: "NATIONAL_ID" }),
        },
      );

      if (!authRes.ok) {
        const err = await authRes.json();
        setErrorMsg(err.error || "No se pudo obtener URL de subida");
        return;
      }

      const authData = await authRes.json();
      const dummyBlob = new Blob(["%PDF-1.4 updated document content"], {
        type: "application/pdf",
      });

      await fetch(authData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: dummyBlob,
      });

      const commitRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/driver/documents/commit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": `reupload_${identity?.userId}_${Date.now()}`,
          },
          body: JSON.stringify({
            document_type: "NATIONAL_ID",
            storage_path: authData.storage_path,
          }),
        },
      );

      if (!commitRes.ok) {
        const err = await commitRes.json();
        setErrorMsg(err.error || "Error al confirmar documento");
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
        <Text style={styles.detail}>
          Conductor: {identity?.profile.fullName ?? identity?.email}
        </Text>
        <Text style={styles.statusBadge}>
          ESTADO: PENDIENTE DE VERIFICACIÓN
        </Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshIdentity}
        >
          <Text style={styles.refreshText}>Actualizar Estado</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
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
          Uno o más documentos fueron rechazados por el equipo de verificación.
          Por favor sube nuevamente los documentos solicitados con mejor
          claridad y vigencia.
        </Text>
        {errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleReupload}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Re-subir Documento</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.title}>Registro de Conductor</Text>
        <Text style={styles.message}>
          Completa tus datos personales, de licencia y de vehículo para
          solicitar verificación.
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

        <View style={styles.separator} />
        <Text style={styles.subTitle}>Datos del Vehículo</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Marca</Text>
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
            placeholder="Ej. FZ-S, Pulsar, YBR"
            value={vehicleModel}
            onChangeText={setVehicleModel}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Año</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 2023"
            value={vehicleYear}
            onChangeText={setVehicleYear}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Color</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Azul, Negro, Rojo"
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
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Registrar y Enviar Documentos</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flex: 1,
    justifyContent: "center",
  },
  centerContainer: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#0F172A",
    marginBottom: 8,
  },
  subTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 12,
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: "#475569",
    marginBottom: 8,
    lineHeight: 22,
    textAlign: "center",
  },
  detail: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 20,
    textAlign: "center",
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#D97706",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 24,
  },
  separator: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: "100%",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#16A34A",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  refreshButton: {
    backgroundColor: "#0284C7",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
  },
  refreshText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  logoutButton: {
    marginTop: 12,
    padding: 12,
    alignItems: "center",
  },
  logoutText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
  },
});
