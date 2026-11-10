'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Segmented } from './Segmented';

type Sort = 'activity' | 'name';
type View = 'grid' | 'list';

const SORT_LABEL: Record<Sort, string> = { activity: 'Recent activity', name: 'Name, A–Z' };
const VIEW_LABEL: Record<View, string> = { grid: 'Grid', list: 'List' };

/** Path for a sort and a view. The defaults stay out of the URL. */
function hrefFor(sort: Sort, view: View) {
  const q = new URLSearchParams();
  if (sort !== 'activity') q.set('sort', sort);
  if (view !== 'grid') q.set('view', view);
  const qs = q.toString();
  return qs ? `/projects?${qs}` : '/projects';
}

/**
 * Sort and view of the projects list. The highlight slides between the
 * options; the choice is also in the URL, so a link opens the same view.
 */
export function ProjectsToolbar({ sort, view }: { sort: Sort; view: View }) {
  const router = useRouter();
  // Shown at once on click; the server's answer follows in the URL.
  const [shownSort, setShownSort] = useState(sort);
  const [shownView, setShownView] = useState(view);
  useEffect(() => setShownSort(sort), [sort]);
  useEffect(() => setShownView(view), [view]);

  const go = (s: Sort, v: View) => router.replace(hrefFor(s, v), { scroll: false });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[13.5px] text-fg-3">Sort by</span>
        <Segmented<Sort>
          label="Sort projects"
          options={['activity', 'name']}
          value={shownSort}
          format={(s) => SORT_LABEL[s]}
          onChange={(s) => {
            setShownSort(s);
            go(s, shownView);
          }}
        />
      </div>
      <Segmented<View>
        label="View"
        options={['grid', 'list']}
        value={shownView}
        format={(v) => VIEW_LABEL[v]}
        onChange={(v) => {
          setShownView(v);
          go(shownSort, v);
        }}
      />
    </div>
  );
}
