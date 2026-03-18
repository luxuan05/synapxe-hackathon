import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  size?: "sm" | "md" | "lg";
};

export default function BrandLogo({ size = "md" }: Props) {
  const fontSize = size === "sm" ? 16 : size === "lg" ? 28 : 20;
  const markSize = size === "sm" ? 10 : size === "lg" ? 16 : 12;

  return (
    <View style={styles.row}>
      <View style={[styles.mark, { width: markSize, height: markSize }]} />
      <Text style={[styles.text, { fontSize }]} accessibilityRole="header">
        MediBuddy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { backgroundColor: "#6D28D9", borderRadius: 4 }, // purple brand mark
  text: { fontWeight: "800", color: "#111827" }
});