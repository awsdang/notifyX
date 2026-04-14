import { SendNotificationForm } from "../components/SendNotificationForm";
import { useAppContext } from "../context/AppContext";

export function SendPage() {
  const { apps } = useAppContext();
  return <SendNotificationForm apps={apps} />;
}
