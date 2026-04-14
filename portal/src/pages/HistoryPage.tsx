import { NotificationHistoryPage } from "./NotificationHistoryPage";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

export function HistoryPage() {
  const { apps } = useAppContext();
  const { token } = useAuth();
  return <NotificationHistoryPage apps={apps} token={token} />;
}
