import "./globals.css";
import React from "react";

export const metadata = {
  title: "Güegüense Admin",
  description: "Panel de Administración Güegüense",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
