import { useEffect, useState } from 'react';
import { subscribeAnnouncements } from '../../hooks/useAnnounce';

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** Mount exactly once (in AppShell). Any code can call announce() from useAnnounce.ts. */
export function LiveRegion() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');

  useEffect(
    () =>
      subscribeAnnouncements((message, politeness) => {
        if (politeness === 'assertive') setAssertive(message);
        else setPolite(message);
      }),
    [],
  );

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHidden}>
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" style={visuallyHidden}>
        {assertive}
      </div>
    </>
  );
}
