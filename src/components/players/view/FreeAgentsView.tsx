import React from 'react';
import { PlayerBioView } from '../../central/view/PlayerBioView';
import { FreeAgentsViewChrome } from './FreeAgentsViewChrome';
import { FreeAgentsViewModals } from './FreeAgentsViewModals';
import { useFreeAgentsViewModel } from './useFreeAgentsViewModel';

export const FreeAgentsView: React.FC = () => {
  const vm = useFreeAgentsViewModel();
  if (vm.viewingBioPlayer) {
    return <PlayerBioView player={vm.viewingBioPlayer} onBack={() => vm.setViewingBioPlayer(null)} />;
  }
  return (
    <>
      <FreeAgentsViewChrome vm={vm} />
      <FreeAgentsViewModals vm={vm} />
    </>
  );
};
