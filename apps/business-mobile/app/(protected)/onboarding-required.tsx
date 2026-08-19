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
import { businessOnboardingSchema } from "@gueguense/schemas";

export default function BusinessOnboardingRequiredScreen() {
  const { identity, signOut, refreshIdentity } = useAuth();

  const [legalName, setLegalName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [pickupInstructions, setPickupInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRegister = async () => {
    setErrorMsg(null);

    const validation = businessOnboardingSchema.safeParse({
      legalName,
      brandName,
      taxId,
      branchName,
      branchAddress,
      branchLatitude: 12.136389, // Default Managua center coordinates for onboarding
      branchLongitude: -86.251389,
      pickupInstructions: pickupInstructions || undefined,
    });

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }

    setLoading(true);
    try {
      const client = getSupabaseClient();
      const rpcArgs: {
        p_legal_name: string;
        p_brand_name: string;
        p_tax_id: string;
        p_branch_name: string;
        p_branch_address: string;
        p_branch_latitude: number;
        p_branch_longitude: number;
        p_pickup_instructions?: string;
      } = {
        p_legal_name: legalName.trim(),
        p_brand_name: brandName.trim(),
        p_tax_id: taxId.trim(),
        p_branch_name: branchName.trim(),
        p_branch_address: branchAddress.trim(),
        p_branch_latitude: 12.136389,
        p_branch_longitude: -86.251389,
      };
      if (pickupInstructions.trim()) {
        rpcArgs.p_pickup_instructions = pickupInstructions.trim();
      }

      const { data, error } = await client.rpc(
        "register_business_onboarding",
        rpcArgs,
      );

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data) {
        await refreshIdentity();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.title}>Registro de Comercio</Text>
        <Text style={styles.message}>
          Completa los datos de tu empresa y sucursal inicial para comenzar a
          operar.
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
          <Text style={styles.label}>Razón Social / Nombre Legal</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Distribuidora del Norte S.A."
            value={legalName}
            onChangeText={setLegalName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Nombre Comercial / Marca</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Mi Tienda Express"
            value={brandName}
            onChangeText={setBrandName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Número RUC / Cédula Tributaria</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. J0310000000001"
            value={taxId}
            onChangeText={setTaxId}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Nombre de Sucursal Principal</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Sucursal Central"
            value={branchName}
            onChangeText={setBranchName}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Dirección Exacta</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Ej. De la rotonda El Güegüense 2c al lago"
            value={branchAddress}
            onChangeText={setBranchAddress}
            multiline
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Instrucciones de Retiro (Opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Solicitar paquete en caja #2"
            value={pickupInstructions}
            onChangeText={setPickupInstructions}
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
            <Text style={styles.submitButtonText}>Registrar y Comenzar</Text>
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
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 12,
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
