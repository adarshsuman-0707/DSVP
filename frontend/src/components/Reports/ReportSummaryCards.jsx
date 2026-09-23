import { KpiCard } from '../AdminDashboard/ui';

/**
 * cards: [{ icon, label, value, color, bg }]
 * Renders a responsive grid of KpiCard components (4 for user reports, 8 for admin).
 */
export default function ReportSummaryCards({ cards = [] }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 16, marginBottom: 28,
    }}>
      {cards.map(c => (
        <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={c.color} bg={c.bg} />
      ))}
    </div>
  );
}
