import { AdminAccessManager } from "../components/AdminAccessManager";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

export function AdminAccessPage() {
  const { user } = useAuth();

  if (user?.role !== "SUPER_ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <AdminAccessManager />;
}
