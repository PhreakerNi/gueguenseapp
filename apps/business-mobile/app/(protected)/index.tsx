import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useAuth } from "../../src/context/auth-context";
import { getSupabaseClient } from "../../src/supabase";
import { IdempotentIntentManager } from "@gueguense/domain";
import type { PackageType } from "@gueguense/types";
import type { QuoteResponse } from "@gueguense/schemas";

const PACKAGE_TYPES: PackageType[] = [
  "PARCEL",
  "DOCUMENT",
  "FOOD",
  "FRAGILE",
  "BULKY",
];

export default function BusinessDashboardScreen() {
  const { identity, session, signOut } = useAuth();
  const intentManager = useRef(new IdempotentIntentManager()).current;

  // Locations state
  const [locations, setLocations] = useState<
    Array<{ id: string; name: string; address_text: string }>
  >([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [loadingLocations, setLoadingLocations] = useState<boolean>(true);

  // Form state
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("+505 ");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [packageType, setPackageType] = useState<PackageType>("PARCEL");
  const [cashToCollect, setCashToCollect] = useState("0");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quoteResult, setQuoteResult] = useState<QuoteResponse | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadAuthorizedLocations() {
      try {
        const client = getSupabaseClient();
        const { data, error } = await client
          .from("business_locations")
          .select("id, name, address_text, business_id")
          .eq("is_active", true);

        if (!error && data && data.length > 0) {
          setLocations(data);
          const first = data[0];
          if (first) {
            setSelectedLocationId(first.id);
          }
        }
      } catch {
        // Ignored
      } finally {
        setLoadingLocations(false);
      }
    }
    loadAuthorizedLocations();
  }, [identity]);

  const handleCreateQuote = async () => {
    if (!selectedLocationId) {
      setErrorMessage("Debe seleccionar una sucursal de origen");
      return;
    }
    if (!recipientName.trim()) {
      setErrorMessage("Ingrese el nombre del destinatario");
      return;
    }
    if (!recipientPhone.trim() || recipientPhone.trim().length < 8) {
      setErrorMessage("Ingrese un teléfono válido (+505...)");
      return;
    }
    if (!dropoffAddress.trim()) {
      setErrorMessage("Ingrese la dirección de entrega");
      return;
    }

    const lat = parseFloat(dropoffLat);
    const lng = parseFloat(dropoffLng);
    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setErrorMessage("Coordenadas de entrega inválidas");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const payload = {
      location_id: selectedLocationId,
      dropoff_address: {
        address_text: dropoffAddress.trim(),
        latitude: lat,
        longitude: lng,
      },
      recipient_name: recipientName.trim(),
      recipient_phone: recipientPhone.trim(),
      package_type: packageType,
      cash_to_collect: parseFloat(cashToCollect) || 0,
    };

    const idempotencyKey = intentManager.getOrCreateKey(
      "quote:create",
      payload,
    );

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"}/functions/v1/api-v1/quotes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(
          data.error?.message || "No se pudo generar la cotización",
        );
      } else {
        setQuoteResult(data);
        intentManager.clear("quote:create");
      }
    } catch {
      // On network failure, the same idempotencyKey is preserved for the next retry with same payload
      setErrorMessage("Error de conexión al cotizar el envío");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelQuote = async () => {
    if (!quoteResult) return;
    setActionLoading(true);
    setErrorMessage(null);

    const cancelPayload = { quote_id: quoteResult.quote_id };
    const idempotencyKey = intentManager.getOrCreateKey(
      "quote:cancel",
      cancelPayload,
    );

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"}/functions/v1/api-v1/quotes/${quoteResult.quote_id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({}),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(
          data.error?.message || "No se pudo cancelar la cotización",
        );
      } else {
        setQuoteResult({ ...quoteResult, status: "CANCELED" });
        intentManager.clear("quote:cancel");
      }
    } catch {
      // Key is preserved in intentManager for network retry
      setErrorMessage("Error de conexión al cancelar la cotización");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequote = async () => {
    if (!quoteResult) return;
    setActionLoading(true);
    setErrorMessage(null);

    const requotePayload = { quote_id: quoteResult.quote_id };
    const idempotencyKey = intentManager.getOrCreateKey(
      "quote:requote",
      requotePayload,
    );

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"}/functions/v1/api-v1/quotes/${quoteResult.quote_id}/requote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({}),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error?.message || "No se pudo recotizar");
      } else {
        setQuoteResult(data);
        intentManager.clear("quote:requote");
      }
    } catch {
      // Key is preserved in intentManager for network retry
      setErrorMessage("Error de conexión al recotizar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetForm = () => {
    setQuoteResult(null);
    setErrorMessage(null);
    intentManager.clear();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cotizador de Envíos</Text>
        <Text style={styles.subtitle}>
          {identity?.profile.fullName || identity?.email}
        </Text>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {!quoteResult ? (
        <View style={styles.formCard}>
          <Text style={styles.sectionHeader}>1. Origen y Destino</Text>

          <Text style={styles.label}>Sucursal de Origen</Text>
          {loadingLocations ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : locations.length === 0 ? (
            <Text style={styles.hintText}>No hay sucursales disponibles</Text>
          ) : (
            <View style={styles.selectorContainer}>
              {locations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.selectorOption,
                    selectedLocationId === loc.id &&
                      styles.selectorOptionActive,
                  ]}
                  onPress={() => setSelectedLocationId(loc.id)}
                >
                  <Text
                    style={[
                      styles.selectorText,
                      selectedLocationId === loc.id &&
                        styles.selectorTextActive,
                    ]}
                  >
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.label}>Dirección de Entrega</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Semáforos Enel Central 2c al lago"
            value={dropoffAddress}
            onChangeText={setDropoffAddress}
          />

          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.label}>Latitud Destino</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={dropoffLat}
                onChangeText={setDropoffLat}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>Longitud Destino</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={dropoffLng}
                onChangeText={setDropoffLng}
              />
            </View>
          </View>

          <Text style={styles.sectionHeader}>2. Destinatario y Paquete</Text>

          <Text style={styles.label}>Nombre del Destinatario</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre completo"
            value={recipientName}
            onChangeText={setRecipientName}
          />

          <Text style={styles.label}>Teléfono del Destinatario</Text>
          <TextInput
            style={styles.input}
            placeholder="+505 8888 8888"
            keyboardType="phone-pad"
            value={recipientPhone}
            onChangeText={setRecipientPhone}
          />

          <Text style={styles.label}>Tipo de Paquete</Text>
          <View style={styles.selectorContainer}>
            {PACKAGE_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.selectorOption,
                  packageType === t && styles.selectorOptionActive,
                ]}
                onPress={() => setPackageType(t)}
              >
                <Text
                  style={[
                    styles.selectorText,
                    packageType === t && styles.selectorTextActive,
                  ]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Cobro contra entrega (C$ - Opcional)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={cashToCollect}
            onChangeText={setCashToCollect}
          />

          <TouchableOpacity
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            disabled={submitting}
            onPress={handleCreateQuote}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Cotizar Envío Oficial
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.quoteCard}>
          <View style={styles.quoteHeader}>
            <Text style={styles.quoteTitle}>Cotización Confirmada</Text>
            <View
              style={[
                styles.badge,
                quoteResult.status === "QUOTED" && styles.badgeQuoted,
                quoteResult.status === "EXPIRED" && styles.badgeExpired,
                quoteResult.status === "CANCELED" && styles.badgeCanceled,
              ]}
            >
              <Text style={styles.badgeText}>{quoteResult.status}</Text>
            </View>
          </View>

          <Text style={styles.priceHighlight}>
            C$ {quoteResult.quoted_total} {quoteResult.currency}
          </Text>

          <View style={styles.breakdownContainer}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Tarifa Base:</Text>
              <Text style={styles.breakdownValue}>
                C$ {quoteResult.base_amount}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>
                Por Distancia (
                {(quoteResult.route_distance_meters / 1000).toFixed(1)} km):
              </Text>
              <Text style={styles.breakdownValue}>
                C$ {quoteResult.distance_amount}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>
                Por Tiempo (
                {(quoteResult.route_duration_seconds / 60).toFixed(0)} min):
              </Text>
              <Text style={styles.breakdownValue}>
                C$ {quoteResult.time_amount}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Proveedor Vial:</Text>
              <Text style={styles.breakdownValue}>
                {quoteResult.route_provider}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Expira a las:</Text>
              <Text style={styles.breakdownValue}>
                {new Date(quoteResult.expires_at).toLocaleTimeString()}
              </Text>
            </View>
          </View>

          {quoteResult.status === "QUOTED" ? (
            <TouchableOpacity
              style={[
                styles.cancelButton,
                actionLoading && styles.buttonDisabled,
              ]}
              disabled={actionLoading}
              onPress={handleCancelQuote}
            >
              <Text style={styles.cancelButtonText}>Cancelar Cotización</Text>
            </TouchableOpacity>
          ) : null}

          {quoteResult.status === "EXPIRED" ||
          quoteResult.status === "CANCELED" ? (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                actionLoading && styles.buttonDisabled,
              ]}
              disabled={actionLoading}
              onPress={handleRequote}
            >
              <Text style={styles.primaryButtonText}>Recotizar Envío</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleResetForm}
          >
            <Text style={styles.secondaryButtonText}>Nueva Cotización</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#F9FAFB",
  },
  header: {
    marginBottom: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EF4444",
    marginBottom: 16,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "500",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginTop: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF",
    color: "#111827",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  selectorContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  selectorOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F3F4F6",
  },
  selectorOptionActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  selectorText: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "500",
  },
  selectorTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  hintText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  quoteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginBottom: 20,
  },
  quoteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  quoteTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeQuoted: {
    backgroundColor: "#D1FAE5",
  },
  badgeExpired: {
    backgroundColor: "#FEF3C7",
  },
  badgeCanceled: {
    backgroundColor: "#FEE2E2",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  priceHighlight: {
    fontSize: 28,
    fontWeight: "800",
    color: "#047857",
    marginBottom: 16,
    textAlign: "center",
  },
  breakdownContainer: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  cancelButton: {
    backgroundColor: "#EF4444",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#93C5FD",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "600",
  },
  logoutButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  logoutButtonText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },
});
