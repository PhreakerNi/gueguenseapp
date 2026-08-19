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
  businessCreationSchema,
  businessLocationSchema,
} from "@gueguense/schemas";

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

    const bizValidation = businessCreationSchema.safeParse({
      legalName,
      brandName,
      taxId,
    });

    if (!bizValidation.success) {
      setErrorMsg(
        bizValidation.error.issues[0]?.message ?? "Datos de empresa inválidos",
      );
      return;
    }

    const locValidation = businessLocationSchema.safeParse({
      businessId: "00000000-0000-0000-0000-000000000000",
      name: branchName,
      addressText: branchAddress,
      latitude: 12.136389,
      longitude: -86.251389,
      pickupInstructions: pickupInstructions || undefined,
    });

    if (!locValidation.success) {
      setErrorMsg(
        locValidation.error.issues[0]?.message ?? "Datos de sucursal inválidos",
      );
      return;
    }

    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setErrorMsg("Sesión no válida. Por favor, inicia sesión nuevamente.");
        return;
      }

      const edgeUrl =
        process.env.EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";

      // 1. Step 1: Create Business via api-v1
      const bizRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/business/onboarding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": `biz_${identity?.userId}_${taxId.trim()}`,
          },
          body: JSON.stringify({
            legal_name: legalName.trim(),
            brand_name: brandName.trim(),
            tax_id: taxId.trim(),
          }),
        },
      );

      const bizData = await bizRes.json();
      if (!bizRes.ok) {
        setErrorMsg(bizData.error || "Error al crear la empresa");
        return;
      }

      // 2. Step 2: Create Initial Branch Location via api-v1
      const locRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/business/locations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": `loc_${identity?.userId}_${bizData.business_id}_initial`,
          },
          body: JSON.stringify({
            business_id: bizData.business_id,
            name: branchName.trim(),
            address_text: branchAddress.trim(),
            latitude: 12.136389,
            longitude: -86.251389,
            pickup_instructions: pickupInstructions.trim() || undefined,
          }),
        },
      );

      const locData = await locRes.json();
      if (!locRes.ok) {
        setErrorMsg(locData.error || "Error al registrar la sucursal");
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
            placeholder="Ej. Pulpería La Central"
            value={brandName}
            onChangeText={setBrandName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>RUC / Cédula Tributaria</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. J0310000000001"
            value={taxId}
            onChangeText={setTaxId}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.separator} />
        <Text style={styles.subTitle}>Primera Sucursal</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Nombre de la Sucursal</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Sucursal Central"
            value={branchName}
            onChangeText={setBranchName}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Dirección Física</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Calle Principal #123, Managua"
            value={branchAddress}
            onChangeText={setBranchAddress}
            multiline
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Instrucciones de Retiro (Opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Tocar timbre en recepción"
            value={pickupInstructions}
            onChangeText={setPickupInstructions}
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
            <Text style={styles.buttonText}>Completar Registro</Text>
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
  },
  detail: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 20,
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
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#0284C7",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    marginTop: 16,
    padding: 12,
    alignItems: "center",
  },
  logoutText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
  },
});
