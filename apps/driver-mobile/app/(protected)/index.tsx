import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../../src/context/auth-context";

export default function DriverDashboardScreen() {
  const { identity, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel Conductor</Text>
      <Text style={styles.subtitle}>
        Bienvenido, {identity?.profile.fullName ?? identity?.email}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Información de Sesión</Text>
        <Text style={styles.cardText}>Usuario ID: {identity?.userId}</Text>
        <Text style={styles.cardText}>Correo: {identity?.email}</Text>
        <Text style={styles.cardText}>
          Estado de cuenta: {identity?.driver?.accountStatus ?? "N/A"}
        </Text>
        <Text style={styles.cardText}>
          Verificación: {identity?.driver?.verificationStatus ?? "N/A"}
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#4B5563",
    marginBottom: 24,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  cardText: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 6,
  },
  logoutButton: {
    backgroundColor: "#DC2626",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
