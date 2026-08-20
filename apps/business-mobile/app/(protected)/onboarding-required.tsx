import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import * as Crypto from "expo-crypto";
import { useAuth } from "../../src/context/auth-context";
import { getSupabaseClient } from "../../src/supabase";
import {
  businessCreationSchema,
  businessLocationSchema,
} from "@gueguense/schemas";

export default function BusinessOnboardingRequiredScreen() {
  const { identity, signOut, refreshIdentity } = useAuth();

  // Wizard state: Step 1 = Empresa, Step 2 = Primera Sucursal
  const existingOwnerMembership = identity?.businessMemberships?.find(
    (m) => m.role === "business_owner" && m.status === "ACTIVE",
  );

  const [step, setStep] = useState<1 | 2>(existingOwnerMembership ? 2 : 1);
  const [createdBusinessId, setCreatedBusinessId] = useState<string | null>(
    existingOwnerMembership?.businessId || null,
  );

  useEffect(() => {
    if (existingOwnerMembership) {
      setStep(2);
      setCreatedBusinessId(existingOwnerMembership.businessId);
    } else {
      setStep(1);
    }
  }, [existingOwnerMembership]);

  // Step 1 Form
  const [legalName, setLegalName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [bizIdempotencyKey] = useState(() => Crypto.randomUUID());

  // Step 2 Form
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupInstructions, setPickupInstructions] = useState("");
  const [locIdempotencyKey] = useState(() => Crypto.randomUUID());

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Create Business
  const handleCreateBusiness = async () => {
    setErrorMsg(null);

    const bizValidation = businessCreationSchema.safeParse({
      legalName: legalName.trim(),
      brandName: brandName.trim() || undefined,
      taxId: taxId.trim(),
    });

    if (!bizValidation.success) {
      setErrorMsg(
        bizValidation.error.issues[0]?.message ?? "Datos de empresa inválidos",
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

      const bizRes = await fetch(`${edgeUrl}/functions/v1/api-v1/businesses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": bizIdempotencyKey,
        },
        body: JSON.stringify({
          legal_name: legalName.trim(),
          brand_name: brandName.trim() || null,
          tax_id: taxId.trim(),
        }),
      });

      const bizData = await bizRes.json();
      if (!bizRes.ok) {
        setErrorMsg(
          bizData.error?.message ||
            bizData.error ||
            "Error al registrar la empresa",
        );
        return;
      }

      setCreatedBusinessId(bizData.business_id);
      setStep(2);
      await refreshIdentity();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Create First Location
  const handleCreateLocation = async () => {
    setErrorMsg(null);

    const targetBizId =
      createdBusinessId || existingOwnerMembership?.businessId;
    if (!targetBizId) {
      setErrorMsg(
        "No se encontró una empresa activa para asociar la sucursal.",
      );
      setStep(1);
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);

    const locValidation = businessLocationSchema.safeParse({
      businessId: targetBizId,
      name: branchName.trim(),
      addressText: branchAddress.trim(),
      latitude: latNum,
      longitude: lngNum,
      phone: phone.trim() || undefined,
      pickupInstructions: pickupInstructions.trim() || undefined,
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

      const locRes = await fetch(
        `${edgeUrl}/functions/v1/api-v1/businesses/${targetBizId}/locations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": locIdempotencyKey,
          },
          body: JSON.stringify({
            business_id: targetBizId,
            location_name: branchName.trim(),
            address_text: branchAddress.trim(),
            latitude: latNum,
            longitude: lngNum,
            phone: phone.trim() || null,
            pickup_instructions: pickupInstructions.trim() || null,
          }),
        },
      );

      const locData = await locRes.json();
      if (!locRes.ok) {
        setErrorMsg(
          locData.error?.message ||
            locData.error ||
            "Error al registrar la sucursal",
        );
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
          {step === 1
            ? "Paso 1: Registra los datos legales y comerciales de tu empresa."
            : "Paso 2: Registra la primera sucursal física de tu empresa."}
        </Text>
        <Text style={styles.detail}>
          Usuario: {identity?.profile.fullName ?? identity?.email}
        </Text>

        {errorMsg && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {step === 1 && (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Razón Social / Nombre Legal *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Distribuidora del Norte S.A."
                value={legalName}
                onChangeText={setLegalName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Nombre Comercial / Marca (Opcional)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Pulpería La Central"
                value={brandName}
                onChangeText={setBrandName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>RUC / Cédula Tributaria *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. J0310000000001"
                value={taxId}
                onChangeText={setTaxId}
                autoCapitalize="characters"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleCreateBusiness}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continuar a Sucursal</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.subTitle}>Datos de la Primera Sucursal</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre de la Sucursal *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Sucursal Central"
                value={branchName}
                onChangeText={setBranchName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Dirección Física *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Calle Principal #123, Managua"
                value={branchAddress}
                onChangeText={setBranchAddress}
                multiline
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Latitud *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. 12.136389"
                  value={latitude}
                  onChangeText={setLatitude}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Longitud *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. -86.251389"
                  value={longitude}
                  onChangeText={setLongitude}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Teléfono de Contacto (Opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. +505 8888 8888"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Instrucciones de Retiro (Opcional)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Tocar timbre en recepción"
                value={pickupInstructions}
                onChangeText={setPickupInstructions}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleCreateLocation}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Completar Registro</Text>
              )}
            </TouchableOpacity>
          </>
        )}

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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
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
