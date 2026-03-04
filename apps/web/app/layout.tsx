/**
 * Root layout
 *
 * Minimal root layout that delegates to locale-specific layout.
 */
import type { Viewport } from "next";
import "./globals.css";

/** Viewport configuration for all pages */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

/**
 * Root layout component - passthrough to locale layout
 *
 * @param children - Child content (locale layout)
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
