import React from 'react';
import { fmtDayLong, checkinLabel } from './shared';

const bedsText = (t) => {
  const p = [];
  if (t.beds_double) p.push(`${t.beds_double}× matrimoniale`);
  if (t.beds_single) p.push(`${t.beds_single}× singolo`);
  if (t.beds_sofa) p.push(`${t.beds_sofa}× divano letto`);
  return p.join(' · ') || '—';
};

function PrintTaskRow({ task, index }) {
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: '10px 14px', marginBottom: 8, pageBreakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {index != null ? `${index}. ` : ''}{task.structure_name}
          {task.structure_address ? <span style={{ fontWeight: 400 }}> — {task.structure_address}</span> : null}
        </p>
        {task.scheduled_time && <span style={{ fontSize: 13, fontWeight: 700 }}>ore {task.scheduled_time}</span>}
      </div>
      <p style={{ fontSize: 12.5, margin: '4px 0 0' }}>
        {task.guests_count ? `${task.guests_count} persone · ` : ''}{bedsText(task)}
        {task.zone_name ? ` · ${task.zone_name}` : ''}
      </p>
      <p style={{ fontSize: 12.5, margin: '2px 0 0', fontWeight: task.checkin_today ? 700 : 400 }}>
        {checkinLabel(task)}
      </p>
      {task.notes && <p style={{ fontSize: 12, margin: '4px 0 0', fontStyle: 'italic' }}>Note: {task.notes}</p>}
      <p style={{ fontSize: 11, margin: '6px 0 0', color: '#555' }}>
        ☐ Video iniziale &nbsp; ☐ Checklist &nbsp; ☐ Foto magazzino &nbsp; ☐ Video finale
      </p>
    </div>
  );
}

export function PrintSheets({ mode, date, tasks, cleaners }) {
  const active = tasks.filter(t => t.status !== 'cancelled');
  const tasksOf = (cid) => active
    .filter(t => (t.assigned_cleaner_ids || []).includes(cid) || t.assigned_cleaner_id === cid)
    .sort((a, b) => (a.route_order?.[cid] ?? 9999) - (b.route_order?.[cid] ?? 9999) || (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99'));
  const withTasks = cleaners.map(c => ({ ...c, list: tasksOf(c.id) })).filter(c => c.list.length > 0);
  const unassigned = active.filter(t => !(t.assigned_cleaner_ids || []).length && !t.assigned_cleaner_id);

  return (
    <div className="hidden print:block" style={{ color: '#000', background: '#fff' }} data-testid="print-sheets">
      {mode === 'operators' ? (
        withTasks.map((c, i) => (
          <div key={c.id} style={{ pageBreakAfter: i < withTasks.length - 1 ? 'always' : 'auto', paddingTop: 8 }}>
            <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#666', margin: 0 }}>Kilolava · Scheda operatore</p>
            <h1 style={{ fontSize: 24, margin: '2px 0 0', textTransform: 'capitalize' }}>{c.name} — {fmtDayLong(date)}</h1>
            <p style={{ fontSize: 13, margin: '4px 0 14px' }}>{c.list.length} pulizie in ordine di giro</p>
            {c.list.map((t, idx) => <PrintTaskRow key={t.id} task={t} index={idx + 1} />)}
          </div>
        ))
      ) : (
        <div style={{ paddingTop: 8 }}>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#666', margin: 0 }}>Kilolava · Piano lavoro</p>
          <h1 style={{ fontSize: 24, margin: '2px 0 0', textTransform: 'capitalize' }}>Scheda quotidiana — {fmtDayLong(date)}</h1>
          <p style={{ fontSize: 13, margin: '4px 0 14px' }}>{active.length} pulizie</p>
          {withTasks.map(c => (
            <div key={c.id} style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, margin: '0 0 6px', borderBottom: '2px solid #000', paddingBottom: 3 }}>{c.name} — {c.list.length} pulizie</h2>
              {c.list.map((t, idx) => <PrintTaskRow key={t.id} task={t} index={idx + 1} />)}
            </div>
          ))}
          {unassigned.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, margin: '0 0 6px', borderBottom: '2px solid #000', paddingBottom: 3 }}>Da assegnare — {unassigned.length}</h2>
              {unassigned.map(t => <PrintTaskRow key={t.id} task={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
