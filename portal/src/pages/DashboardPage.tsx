import { useStatsManager } from '../hooks/useStatsManager';
import { Dashboard } from '../components/Dashboard';

interface DashboardPageProps {
    setActiveTab: (tab: string) => void;
}

export function DashboardPage({ setActiveTab }: DashboardPageProps) {
    const { stats, isLoading } = useStatsManager();

    return (
        <Dashboard
            stats={stats}
            isLoading={isLoading}
            setActiveTab={setActiveTab}
        />
    );
}
