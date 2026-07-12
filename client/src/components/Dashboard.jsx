import { Link2, MousePointerClick, ShieldCheck, Clock3, Lock } from 'lucide-react';
import { useLinkHistoryMeta } from '../hooks/useLinkHistoryMeta.js';

export default function Dashboard({ refreshKey }) {
  const { entries, meta } = useLinkHistoryMeta(refreshKey);

  if (entries.length === 0) return null;

  const totalClicks = entries.reduce((sum, e) => sum + (meta[e.slug]?.clicks ?? 0), 0);
  const activeCount = entries.filter((e) => !meta[e.slug]?.expired).length;
  const expiredCount = entries.length - activeCount;
  const protectedCount = entries.filter((e) => meta[e.slug]?.hasPassword).length;

  const stats = [
    { icon: Link2, label: 'Links', value: entries.length },
    { icon: MousePointerClick, label: 'Total clicks', value: totalClicks },
    { icon: ShieldCheck, label: 'Active', value: activeCount },
    { icon: Clock3, label: 'Expired', value: expiredCount },
    { icon: Lock, label: 'Protected', value: protectedCount },
  ];

  return (
    <div className="dashboard-grid">
      {stats.map(({ icon: Icon, label, value }) => (
        <div key={label} className="dashboard-card">
          <Icon size={16} />
          <div className="dashboard-value">{value}</div>
          <div className="dashboard-label">{label}</div>
        </div>
      ))}
    </div>
  );
}
