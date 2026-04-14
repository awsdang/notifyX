import { ABTesting } from "../components/ABTesting";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

export function ABTestsPage() {
  const { apps } = useAppContext();
  const { token } = useAuth();
  return <ABTesting apps={apps} token={token} />;
}
