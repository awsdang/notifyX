import { UsersDevices } from "../components/UsersDevices";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

export function UsersPage() {
  const { apps } = useAppContext();
  const { token } = useAuth();
  return <UsersDevices apps={apps} token={token} />;
}
