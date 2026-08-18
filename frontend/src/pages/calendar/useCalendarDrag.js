import { useState, useCallback, useRef } from 'react';
import { eventsApi } from '../../lib/api';
import { toast } from 'sonner';
import { fmtDate } from './calendarHelpers';

/**
 * Hook that wires HTML5 drag-and-drop for events and mouse-drag pan navigation.
 * Returns handler functions and ephemeral state to feed into board cells.
 */
export const useCalendarDrag = ({ events, fetchEvents, goPrev, goNext }) => {
  const [dragEventId, setDragEventId] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);
  const panState = useRef({ active: false, startX: 0, lastApplied: 0 });

  const handleDragStart = useCallback((e, ev) => {
    setDragEventId(ev.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ev.id); } catch (_) {}
  }, []);

  const handleDragOver = useCallback((e, cellKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell(cellKey);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragEventId(null);
    setDragOverCell(null);
  }, []);

  const handleDrop = useCallback(async (e, propertyRow, dayDate) => {
    e.preventDefault();
    setDragOverCell(null);
    const eventId = dragEventId || e.dataTransfer.getData('text/plain');
    setDragEventId(null);
    if (!eventId) return;
    const ev = events.find(x => x.id === eventId);
    if (!ev) return;

    const dayStr = fmtDate(dayDate);
    const evStart = ev.start_time;
    const evEnd = ev.end_time;
    let durationMs = 0;
    try { durationMs = new Date(evEnd) - new Date(evStart); } catch (_) { durationMs = 0; }
    if (Number.isNaN(durationMs) || durationMs < 0) durationMs = 0;

    const oldStartDay = (evStart || '').slice(0, 10);
    const samePropDay = oldStartDay === dayStr && (
      !propertyRow || (
        (propertyRow.type === 'unit' ? propertyRow.id : null) === (ev.unit_id || null) &&
        (propertyRow.type === 'structure' ? propertyRow.id : ev.structure_id) === ev.structure_id
      )
    );
    if (samePropDay) return;

    let newStartIso, newEndIso;
    if (evStart && evStart.length > 10 && evStart.includes('T')) {
      const startTime = evStart.slice(11, 19) || '00:00:00';
      newStartIso = `${dayStr}T${startTime}`;
      const newStartDt = new Date(newStartIso);
      const newEndDt = new Date(newStartDt.getTime() + durationMs);
      const yyyy = newEndDt.getFullYear();
      const mm = String(newEndDt.getMonth() + 1).padStart(2, '0');
      const dd = String(newEndDt.getDate()).padStart(2, '0');
      const hh = String(newEndDt.getHours()).padStart(2, '0');
      const mi = String(newEndDt.getMinutes()).padStart(2, '0');
      const ss = String(newEndDt.getSeconds()).padStart(2, '0');
      newEndIso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    } else {
      const oldStart = new Date(`${oldStartDay}T00:00:00`);
      const newStart = new Date(`${dayStr}T00:00:00`);
      const deltaDays = Math.round((newStart - oldStart) / 86400000);
      const oldEnd = new Date(`${(evEnd || oldStartDay).slice(0, 10)}T00:00:00`);
      const newEnd = new Date(oldEnd.getTime() + deltaDays * 86400000);
      newStartIso = dayStr;
      newEndIso = fmtDate(newEnd);
    }

    const payload = { start_time: newStartIso, end_time: newEndIso };
    if (propertyRow && !ev.ical_uid) {
      payload.structure_id = propertyRow.type === 'unit' ? propertyRow.structureId : propertyRow.id;
      payload.unit_id = propertyRow.type === 'unit' ? propertyRow.id : null;
    }
    try {
      await eventsApi.update(eventId, payload);
      toast.success(ev.ical_uid ? 'Spostato. Marcato come modificato manualmente.' : 'Spostato.');
      fetchEvents();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore spostamento');
    }
  }, [dragEventId, events, fetchEvents]);

  const handlePanStart = useCallback((e) => {
    panState.current = { active: true, startX: e.clientX, lastApplied: 0 };
  }, []);
  const handlePanMove = useCallback((e) => {
    if (!panState.current.active) return;
    const delta = e.clientX - panState.current.startX;
    const PX_PER_STEP = 80;
    const steps = Math.trunc(delta / PX_PER_STEP);
    if (steps !== panState.current.lastApplied) {
      const diff = steps - panState.current.lastApplied;
      for (let i = 0; i < Math.abs(diff); i++) {
        if (diff < 0) goNext(); else goPrev();
      }
      panState.current.lastApplied = steps;
    }
  }, [goPrev, goNext]);
  const handlePanEnd = useCallback(() => {
    panState.current = { active: false, startX: 0, lastApplied: 0 };
  }, []);

  return {
    dragOverCell,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
  };
};

export default useCalendarDrag;
