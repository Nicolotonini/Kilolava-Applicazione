import React from 'react';
import { cn } from '../../lib/utils';
import { SERVICE_ICONS } from './calendarHelpers';

/**
 * Row of 4 small service icons displayed under a booking block.
 * An icon is colored if the corresponding auto-generated task exists.
 */
export const ServiceIconsRow = ({ booking, structure, autoTaskMap, onIconClick }) => {
  const activeServices = new Set(structure?.services || []);
  const tasks = autoTaskMap[booking.id] || {};

  const servicesActiveMap = {
    cleaning: activeServices.has('cleaning'),
    linen: activeServices.has('private_laundry') || activeServices.has('rental_laundry'),
    consumables: activeServices.has('consumables'),
    maintenance: activeServices.has('maintenance'),
  };

  return (
    <div className="flex items-center gap-1 mt-1 pt-1 border-t border-current/10">
      {SERVICE_ICONS.map(({ key, rule, Icon, color, bg, label }) => {
        const taskExists = !!tasks[rule];
        const serviceActive = servicesActiveMap[key];
        return (
          <button
            key={key}
            type="button"
            title={`${label}${taskExists ? ' · task creato' : serviceActive ? ' · servizio attivo' : ' · non configurato'}`}
            onClick={(e) => { e.stopPropagation(); if (taskExists) onIconClick?.(tasks[rule]); }}
            className={cn(
              "flex items-center justify-center w-5 h-5 rounded transition-all",
              taskExists ? `${bg} ${color}` : 'bg-muted/30 text-muted-foreground/40',
              !serviceActive && !taskExists && 'opacity-30',
            )}
            data-testid={`booking-service-icon-${key}-${booking.id}`}
          >
            <Icon className="h-2.5 w-2.5" />
          </button>
        );
      })}
    </div>
  );
};

export default ServiceIconsRow;
