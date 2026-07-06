"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

const FULL_WIDTH_ROUTES = ["/docs", "/mundial", "/goal-preview"];

export function AppChrome({
  children,
  copaMundialHost = false,
}: {
  children: ReactNode;
  copaMundialHost?: boolean;
}) {
  const pathname = usePathname();
  const fullWidth =
    (copaMundialHost &&
      (pathname === "/" ||
        pathname === "/goal-preview" ||
        pathname.startsWith("/goal-preview/"))) ||
    FULL_WIDTH_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );

  if (fullWidth) {
    return <div className="app-viewport">{children}</div>;
  }

  return (
    <div className="app-viewport">
      <div className="app-shell">{children}</div>
    </div>
  );
}
