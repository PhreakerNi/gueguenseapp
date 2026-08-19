import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { useAuth } from "../../src/context/auth-context";
import { getSupabaseClient } from "../../src/supabase";

type PickedDocument = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  status: "NO_SELECCIONADO" | "LISTO" | "SUBIENDO" | "COMPLETADO" | "ERROR";
};

type DocTypes = "NATIONAL_ID" | "DRIVER_LICENSE" | "VEHICLE_REGISTRATION";

export default function DriverOnboardingRequiredScreen() {
  const { identity, signOut, refreshIdentity } = useAuth();

  const [nationalIdNumber, setNationalIdNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("2023");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleLicensePlate, setVehicleLicensePlate] = useState("");

  const [documents, setDocuments] = useState<Record<DocTypes, PickedDocument>>({
    NATIONAL_ID: {
      uri: "",
      name: "",
      size: 0,
      mimeType: "application/pdf",
      status: "NO_SELECCIONADO",
    },
    DRIVER_LICENSE: {
      uri: "",
      name: "",
      size: 0,
      mimeType: "application/pdf",
      status: "NO_SELECCIONADO",
    },
    VEHICLE_REGISTRATION: {
      uri: "",
      name: "",
      size: 0,
      mimeType: "application/pdf",
      status: "NO_SELECCIONADO",
    },
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const driver = identity?.driver;
  const isPending =
    driver?.verificationStatus === "PENDING" ||
    driver?.verificationStatus === "UNDER_REVIEW";
  const isRejected = driver?.verificationStatus === "REJECTED";

  const pickDocument = async (docType: DocTypes) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "application/pdf"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset) {
          let mime = asset.mimeType || "application/pdf";
          if (mime === "image/jpg") mime = "image/jpeg";

          setDocuments((prev) => ({
            ...prev,
            [docType]: {
              uri: asset.uri,
              name: asset.name,
              size: asset.size ?? 1024,
              mimeType: mime,
              status: "LISTO",
            },
          }));
        }
      }
    } catch {
      setErrorMsg("Error al seleccionar documento");
    }
  };

  const uploadAndCommitDocument = async (
    docType: DocTypes,
    docInfo: PickedDocument,
    token: string,
    edgeUrl: string,
  ) => {
    // 1. Authorize
    const authRes = await fetch(
      `${edgeUrl}/functions/v1/api-v1/driver/documents/upload-authorization`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_type: docType,
          mime_type: docInfo.mimeType,
          size_bytes: docInfo.size || 1024,
        }),
      },
    );

    if (!authRes.ok) {
      const err = await authRes.json();
      throw new Error(
        err.error?.message || `Error autorizando subida de ${docType}`,
      );
    }

    const { upload_id, upload_url } = await authRes.json();

    // 2. Physical upload to signed URL
    const fileRes = await fetch(docInfo.uri);
    const fileBlob = await fileRes.blob();

    const putRes = await fetch(upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": docInfo.mimeType,
      },
      body: fileBlob,
    });

    if (!putRes.ok) {
      throw new Error(`Error al transferir bytes de ${docType}`);
    }

    // 3. Commit
    const commitRes = await fetch(
      `${edgeUrl}/functions/v1/api-v1/driver/documents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": Crypto.randomUUID(),
        },
        body: JSON.stringify({
          upload_id,
          document_type: docType,
        }),
      },
    );

    if (!commitRes.ok) {
      const err = await commitRes.json();
      throw new Error(
        err.error?.message || `Error registrando documento ${docType}`,
      );
    }
  };

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!nationalIdNumber.trim() || !licenseNumber.trim()) {
      setErrorMsg(
        "Por favor completa tu número de cédula y licencia de conducir.",
      );
      return;
    }

    if (
      !vehicleMake.trim() ||
      !vehicleModel.trim() ||
      !vehicleYear.trim() ||
      !vehicleColor.trim() ||
      !vehicleLicensePlate.trim()
    ) {
      setErrorMsg("Por favor completa todos los datos de tu vehículo.");
      return;
    }

    if (
      !documents.NATIONAL_ID.uri ||
      !documents.DRIVER_LICENSE.uri ||
      !documents.VEHICLE_REGISTRATION.uri
    ) {
      setErrorMsg(
        "Debes seleccionar los 3 documentos obligatorios (Cédula, Licencia y Circulación).",
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

      // 1. Onboarding personal
      const onboardingRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/driver/onboarding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": Crypto.randomUUID(),
          },
          body: JSON.stringify({
            national_id_number: nationalIdNumber.trim(),
            license_number: licenseNumber.trim(),
          }),
        },
      );

      if (!onboardingRes.ok) {
        const err = await onboardingRes.json();
        throw new Error(
          err.error?.message || "Error al registrar datos del conductor",
        );
      }

      // 2. Registro de Vehículo
      const vehicleRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/driver/vehicles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": Crypto.randomUUID(),
          },
          body: JSON.stringify({
            make: vehicleMake.trim(),
            model: vehicleModel.trim(),
            year: parseInt(vehicleYear.trim(), 10) || 2023,
            color: vehicleColor.trim(),
            license_plate: vehicleLicensePlate.trim(),
          }),
        },
      );

      if (!vehicleRes.ok) {
        const err = await vehicleRes.json();
        throw new Error(
          err.error?.message || "Error al registrar datos del vehículo",
        );
      }

      // 3. Subida y Confirmación de Documentos
      await uploadAndCommitDocument(
        "NATIONAL_ID",
        documents.NATIONAL_ID,
        token,
        edgeUrl,
      );
      await uploadAndCommitDocument(
        "DRIVER_LICENSE",
        documents.DRIVER_LICENSE,
        token,
        edgeUrl,
      );
      await uploadAndCommitDocument(
        "VEHICLE_REGISTRATION",
        documents.VEHICLE_REGISTRATION,
        token,
        edgeUrl,
      );

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
    if (!documents.NATIONAL_ID.uri) {
      setErrorMsg("Selecciona un nuevo documento antes de resubir.");
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

      await uploadAndCommitDocument(
        "NATIONAL_ID",
        documents.NATIONAL_ID,
        token,
        edgeUrl,
      );

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
        <Text style={styles.title}>Verificación en Proceso</Text>
        <Text style={styles.message}>
          Tus documentos y datos de vehículo han sido recibidos con éxito.
          Nuestro equipo de operaciones está revisando tu expediente legal.
        </Text>
        <Text style={styles.statusBadge}>ESTADO: PENDIENTE DE REVISIÓN</Text>
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
          style={styles.pickerButton}
          onPress={() => pickDocument("NATIONAL_ID")}
        >
          <Text style={styles.pickerButtonText}>
            {documents.NATIONAL_ID.name
              ? `Archivo: ${documents.NATIONAL_ID.name}`
              : "Seleccionar Cédula de Identidad"}
          </Text>
        </TouchableOpacity>

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

        <View style={styles.separator} />
        <Text style={styles.subTitle}>Documentos Obligatorios</Text>

        <View style={styles.docRow}>
          <View style={styles.docInfo}>
            <Text style={styles.docName}>1. Cédula de Identidad</Text>
            <Text style={styles.docStatus}>
              Estado: {documents.NATIONAL_ID.status}
              {documents.NATIONAL_ID.name
                ? ` (${documents.NATIONAL_ID.name})`
                : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.docButton}
            onPress={() => pickDocument("NATIONAL_ID")}
          >
            <Text style={styles.docButtonText}>Seleccionar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.docRow}>
          <View style={styles.docInfo}>
            <Text style={styles.docName}>2. Licencia de Conducir</Text>
            <Text style={styles.docStatus}>
              Estado: {documents.DRIVER_LICENSE.status}
              {documents.DRIVER_LICENSE.name
                ? ` (${documents.DRIVER_LICENSE.name})`
                : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.docButton}
            onPress={() => pickDocument("DRIVER_LICENSE")}
          >
            <Text style={styles.docButtonText}>Seleccionar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.docRow}>
          <View style={styles.docInfo}>
            <Text style={styles.docName}>3. Circulación del Vehículo</Text>
            <Text style={styles.docStatus}>
              Estado: {documents.VEHICLE_REGISTRATION.status}
              {documents.VEHICLE_REGISTRATION.name
                ? ` (${documents.VEHICLE_REGISTRATION.name})`
                : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.docButton}
            onPress={() => pickDocument("VEHICLE_REGISTRATION")}
          >
            <Text style={styles.docButtonText}>Seleccionar</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              Enviar Expediente para Verificación
            </Text>
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
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F9FAFB",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 20,
  },
  detail: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  separator: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F2937",
  },
  docStatus: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  docButton: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  docButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1D4ED8",
  },
  pickerButton: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  pickerButtonText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#D97706",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#059669",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  logoutButton: {
    marginTop: 16,
    padding: 12,
    alignItems: "center",
  },
  logoutText: {
    color: "#6B7280",
    fontSize: 14,
  },
});
