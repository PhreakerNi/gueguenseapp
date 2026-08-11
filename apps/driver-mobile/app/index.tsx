import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { DESIGN_TOKENS } from "@gueguense/ui";

export default function DriverAppBootScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Güegüense Motorizado</Text>
      <Text style={styles.subtitle}>Foundation ready — Phase 1</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DESIGN_TOKENS.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: DESIGN_TOKENS.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: DESIGN_TOKENS.colors.primary,
    marginBottom: DESIGN_TOKENS.spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: DESIGN_TOKENS.colors.accent,
  },
});
