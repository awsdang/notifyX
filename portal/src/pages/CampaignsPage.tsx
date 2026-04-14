import { Campaigns } from "../components/Campaigns";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

export function CampaignsPage() {
  const { apps } = useAppContext();
  const { token } = useAuth();
  return <Campaigns apps={apps} token={token} />;
}
