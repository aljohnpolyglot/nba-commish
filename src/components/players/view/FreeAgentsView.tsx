import React from 'react';
import { FreeAgentsViewChrome } from './FreeAgentsViewChrome';
import { FreeAgentsViewModals } from './FreeAgentsViewModals';
import { useFreeAgentsViewModel } from './useFreeAgentsViewModel';

export const FreeAgentsView: React.FC = () => {
  const vm = useFreeAgentsViewModel();
  return (
    <>
      <FreeAgentsViewChrome vm={vm} />
      <FreeAgentsViewModals vm={vm} />
    </>
  );
};
