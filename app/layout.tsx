import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ora",
  description: "Signal-first ecommerce operator assistant for Shopify stores.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthKitProvider>{children}</AuthKitProvider>
      </body>
    </html>
  );
}

