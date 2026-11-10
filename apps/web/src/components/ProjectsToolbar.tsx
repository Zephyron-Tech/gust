'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Segmented } from './Segmented';

export type Sort = 'activity' | 'name' | 'status';
export type View = 'grid' | 'list';
export type StateFilter = 'all' | 'live' | 'stopped' | 'failed';

const SORT_LABEL: Record<Sort, string> = { activity: 'Recent activity', name: 'Name, A–Z', status: 'Status' };
const VIEW_LABEL: Record<View, string> = { grid: 'Grid', list: 'List' };
const STATE_LABEL: Record<StateFilter, string> = { all: 'All', live: 'Live', stopped: 'Stopped', failed: 'Failed' };

/** Path for the current sort, view and filter. The defaults stay out of the URL. */
function hrefFor(sort: Sort, view: View, state: StateFilter) {
  const q = new URLSearchParams();
  if (sort !== 'activity') q.set('sort', sort);
  if (view !== 'grid') q.set('view', view);
  if (state !== 'all') q.set('state', state);
  const qs = q.toString();
  return qs ? `/projects?${qs}` : '/projects';
}

/**
 * Sort, status filter and view of the projects list. The highlights slide between
 * the options; the choices are also in the URL, so a link opens the same view.
 */
export function ProjectsToolbar({
  sort,
  view,
  state,
  counts,
}: {
  sort: Sort;
  view: View;
  state: StateFilter;
  counts: Record<StateFilter, number>;
}) {
  const router = useRouter();
  // Shown at once on click; the server's answer follows in the URL.
  const [shown, setShown] = useState({ sort, view, state });
  useEffect(() => setShown({ sort, view, state }), [sort, view, state]);

  const go = (next: Partial<typeof shown>) => {
    const s = { ...shown, ...next };
    setShown(s);
    router.replace(hrefFor(s.sort, s.view, s.state), { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Each label stays with its options when the row wraps. */}
        <div className="flex items-center gap-3">
          <span className="text-[13.5px] text-fg-3">Sort by</span>
          <Segmented<Sort>
            label="Sort projects"
            options={['activity', 'name', 'status']}
            value={shown.sort}
            format={(s) => SORT_LABEL[s]}
            onChange={(s) => go({ sort: s })}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13.5px] text-fg-3">Show</span>
          <Segmented<StateFilter>
            label="Filter by state"
            options={['all', 'live', 'stopped', 'failed']}
            value={shown.state}
            format={(s) => `${STATE_LABEL[s]} ${counts[s]}`}
            onChange={(s) => go({ state: s })}
          />
        </div>
      </div>
      <Segmented<View>
        label="View"
        options={['grid', 'list']}
        value={shown.view}
        format={(v) => VIEW_LABEL[v]}
        onChange={(v) => go({ view: v })}
      />
    </div>
  );
}
