interface StatCardProps {
    title: string;
    value: string;
    color: 'blue' | 'green' | 'red' | 'purple';
}

export function StatCard({ title, value, color }: StatCardProps) {
    const colorMap = {
        blue: 'from-blue-500 to-blue-600',
        green: 'from-green-500 to-green-600',
        red: 'from-red-500 to-red-600',
        purple: 'from-purple-500 to-purple-600',
    };

    return (
        <div className="bg-white p-6 rounded-xl border shadow-sm relative overflow-hidden">
            <div className={`absolute top-0 end-0 w-20 h-20 bg-gradient-to-br ${colorMap[color]} opacity-10 rounded-bl-full`}></div>
            <p className="text-sm text-gray-500 font-medium">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
    );
}
