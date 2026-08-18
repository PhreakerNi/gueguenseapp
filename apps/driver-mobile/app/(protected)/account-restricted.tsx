import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../../src/context/auth-context";

export default function DriverAccountRestrictedScreen() {
  const { identity, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Acceso Restringido</Text>
      <Text style={styles.message}>
        Tu cuenta de conductor se encuentra suspendida, bloqueada o cerrada.
        Comunícate con el soporte de Güegüense.
      </Text>
      <Text style={styles.detail}>
        Usuario: {identity?.profile.fullName ?? identity?.email}
      </Text>

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
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#DC2626",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 24,
  },
  detail: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 32,
  },
  logoutButton: {
    backgroundColor: "#4B5563",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
