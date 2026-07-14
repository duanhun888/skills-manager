import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/useAuth";

/** Routes reachable without central-server login (local install/browse). */
const PUBLIC_PATHS = new Set(["/settings", "/install"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname === "/install" || pathname.startsWith("/install/");
}

export function AuthGate() {
  const { loading, isServerMode, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (isServerMode && !isAuthenticated && !isPublicPath(location.pathname)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
