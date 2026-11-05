import {
  CalendarDays,
  CircleDollarSign,
  Film,
  GlassWater,
  HeartHandshake,
  NotebookPen,
  Pill,
  Send,
  ShieldUser,
  Smile,
  Sparkles,
  UserRound,
  Users,
  Utensils,
} from 'lucide-react';
import { ClubStep } from './PersonSelector/ClubStep';
import { LocationStep } from './PersonSelector/LocationStep';
import { MovieStep } from './PersonSelector/MovieStep';
import { PersonActionDetails } from './PersonSelector/PersonActionDetails';
import type { PersonSelectorActionType, PersonSelectorModalProps } from './personSelectorModalShared';
import { usePersonSelectorModalModel } from './usePersonSelectorModalModel';
import { ActionContactPicker } from '../shared/actions/ActionContactPicker';
import { ActionInfoPanel } from '../shared/actions/ActionInfoPanel';
import { ActionModalShell } from '../shared/actions/ActionModalShell';
import { ActionTextField } from '../shared/actions/ActionTextField';
import { useGame } from '../../store/GameContext';
import { getAvailableLeagueBudget } from '../../services/logic/leagueTreasury';
import {
  formatTeamActivityCost,
  getTeamActivityChemistryGain,
  getTeamActivityCostMillion,
} from '../../services/teamActivities';

const presentation: Record<PersonSelectorActionType, {
  title: string;
  description: string;
  accent: 'violet' | 'cyan' | 'emerald' | 'amber' | 'sky';
  icon: typeof UserRound;
}> = {
  suspension: {
    title: 'Suspend Player',
    description: 'Issue a temporary suspension for conduct or policy violations.',
    accent: 'violet',
    icon: ShieldUser,
  },
  drug_test: {
    title: 'Order Drug Test',
    description: 'Request a confidential league-administered drug screening.',
    accent: 'violet',
    icon: Pill,
  },
  dinner: {
    title: 'Invite to Dinner',
    description: 'Arrange a private dinner to build trust and discuss next steps.',
    accent: 'amber',
    icon: HeartHandshake,
  },
  general: {
    title: 'Select Personnel',
    description: 'Choose the people involved in this action.',
    accent: 'violet',
    icon: Users,
  },
  fine: {
    title: 'Fine Player',
    description: 'Issue a league fine for player misconduct or violations.',
    accent: 'violet',
    icon: ShieldUser,
  },
  movie: {
    title: 'Invite to Movie',
    description: 'Plan a casual team-bonding outing off the court.',
    accent: 'violet',
    icon: HeartHandshake,
  },
  give_money: {
    title: 'Disburse Funds',
    description: 'Choose a recipient, purpose, and league-appropriate amount.',
    accent: 'emerald',
    icon: CircleDollarSign,
  },
  contact: {
    title: 'Contact Person',
    description: 'Select the person you want to contact.',
    accent: 'cyan',
    icon: Send,
  },
  hypnotize: {
    title: 'Hypnotize Target',
    description: 'Choose a target and enter the command.',
    accent: 'violet',
    icon: Sparkles,
  },
  sabotage: {
    title: 'Sabotage Personnel',
    description: 'Select a covert injury plan and duration.',
    accent: 'violet',
    icon: UserRound,
  },
  club: {
    title: 'Go to Club',
    description: 'Choose the company and venue for the night.',
    accent: 'violet',
    icon: GlassWater,
  },
  endorse_hof: {
    title: 'Endorse for Hall of Fame',
    description: 'Select the retired player you want to endorse.',
    accent: 'amber',
    icon: Sparkles,
  },
  waive: {
    title: 'Waive Player',
    description: 'Select the player to release.',
    accent: 'violet',
    icon: UserRound,
  },
  fire: {
    title: 'Fire Personnel',
    description: 'Select the staff member to dismiss.',
    accent: 'violet',
    icon: UserRound,
  },
  retire_now: {
    title: 'Retire Coach',
    description: 'Confirm the immediate end of this coach’s active staff career.',
    accent: 'amber',
    icon: UserRound,
  },
};

export function PersonSelectorModal({
  onSelect,
  onClose,
  title,
  actionType,
  preSelectedContact,
  initialSelectedContacts,
  skipPersonSelection,
  allowEmptySelection,
  contactFilter,
  selectionTitle,
  selectionDescription,
  peoplePrimaryLabel,
  onSelectionBack,
  fundSource,
  onFundSourceChange,
  chargePersonalFunds,
}: PersonSelectorModalProps) {
  const { state } = useGame();
  const model = usePersonSelectorModalModel({
    actionType,
    onClose,
    onSelect,
    preSelectedContact,
    initialSelectedContacts,
    skipPersonSelection,
    allowEmptySelection,
    contactFilter,
  });
  const config = presentation[actionType] ?? { ...presentation.general, title };
  const Icon = config.icon;
  const isSocialAction = actionType === 'dinner' || actionType === 'movie';
  const socialActivityType = actionType === 'movie' ? 'movie' : 'dinner';
  const selectedFundsM = fundSource === 'personal' ? state.stats.personalWealth : getAvailableLeagueBudget(state.stats);
  const personalExpenseM = chargePersonalFunds && isSocialAction && model.selectedContacts.length > 0
    ? getTeamActivityCostMillion(socialActivityType, model.selectedContacts.length)
    : 0;
  const personalExpenseExceedsFunds = personalExpenseM > state.stats.personalWealth;
  const disbursementExceedsFunds = actionType === 'give_money' && model.step === 'details'
    && Number(model.amount || 0) / 1_000_000 > selectedFundsM;

  const primaryForStep = () => {
    if (model.step === 'movie') return 'Next: Select Guests';
    if (model.step === 'location') return 'Next: Add Note';
    if (model.step === 'note') return 'Confirm Selection';
    if (model.step === 'details') return 'Confirm Selection';
    if (model.step === 'club') return 'Confirm Selection';
    if (model.step === 'people') {
      if (peoplePrimaryLabel) return peoplePrimaryLabel;
      if (actionType === 'dinner') return 'Next: Select Venue';
      if (actionType === 'movie') return 'Next: Add Note';
      if (['fine', 'drug_test', 'suspension', 'sabotage', 'give_money', 'hypnotize', 'retire_now'].includes(actionType)) {
        return 'Next: Action Details';
      }
      return 'Confirm Selection';
    }
    return undefined;
  };

  const handlePrimary = () => {
    if (model.step === 'note') {
      model.handleSubmit();
      return;
    }
    if (model.step === 'details' || model.step === 'club') {
      model.handleSubmit();
      return;
    }
    model.handleNext();
  };

  const currentTitle = model.step === 'movie'
    ? 'Select Movie'
    : model.step === 'people'
      ? selectionTitle ?? `Select ${isSocialAction ? 'Guests' : 'Personnel'}`
      : model.step === 'location'
        ? 'Select Venue'
        : model.step === 'note'
          ? actionType === 'movie' ? 'Invite to Movie' : 'Invite to Dinner'
          : config.title;
  const currentDescription = model.step === 'people'
    ? selectionDescription ?? 'Choose everyone involved in this action.'
    : model.step === 'location'
      ? 'Choose where the private dinner will take place.'
      : model.step === 'movie'
        ? 'Choose the movie for the outing.'
        : config.description;
  const HeaderIcon = model.step === 'movie'
    ? Film
    : model.step === 'location'
      ? Utensils
      : model.step === 'note'
        ? NotebookPen
        : model.step === 'people'
          ? Users
          : Icon;
  const handleBack = model.step === 'people' && onSelectionBack
      ? onSelectionBack
    : model.goBack;

  return (
    <ActionModalShell
      title={currentTitle}
      description={currentDescription}
      icon={<HeaderIcon size={actionType === 'sabotage' ? 32 : 28} />}
      accent={config.accent}
      wide={actionType === 'sabotage' || model.step === 'people'}
      onClose={onClose}
      onBack={model.step === 'people' && !isSocialAction && !preSelectedContact && !onSelectionBack ? undefined : handleBack}
      selectedCount={model.selectedContacts.length}
      primaryLabel={primaryForStep()}
      primaryDisabled={!model.isFormValid() || disbursementExceedsFunds || personalExpenseExceedsFunds}
      onPrimary={primaryForStep() ? handlePrimary : undefined}
    >
      {model.step === 'movie' && (
        <MovieStep
          movies={model.movies}
          movieSearch={model.movieSearch}
          setMovieSearch={model.setMovieSearch}
          selectedMovie={model.selectedMovie}
          setSelectedMovie={model.setSelectedMovie}
          loadingMovies={model.loadingMovies}
        />
      )}

      {model.step === 'people' && (
        <div className="space-y-4">
          {model.availableFilters.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {model.availableFilters.map(filter => (
                <button
                  type="button"
                  key={filter}
                  onClick={() => model.setActiveFilter(filter)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${
                    model.activeFilter === filter
                      ? 'bg-violet-600 text-white'
                      : 'border border-slate-700 bg-slate-900/50 text-slate-400 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          )}
          {model.activeFilter === 'Referee' && !model.refsLoaded ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-xs uppercase tracking-widest text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
              Loading officials
            </div>
          ) : (
            <ActionContactPicker
              contacts={model.filteredContacts}
              selectedContacts={model.selectedContacts}
              searchTerm={model.searchTerm}
              onSearchTermChange={model.setSearchTerm}
              onToggle={model.handleContactToggle}
              placeholder="Search by name or team..."
            />
          )}
        </div>
      )}

      {model.step === 'location' && (
        <LocationStep
          restaurants={model.restaurants}
          restaurantSearch={model.restaurantSearch}
          setRestaurantSearch={model.setRestaurantSearch}
          selectedRestaurant={model.selectedRestaurant}
          setSelectedRestaurant={model.setSelectedRestaurant}
          loadingRestaurants={model.loadingRestaurants}
          guestCount={model.selectedContacts.length}
        />
      )}

      {model.step === 'club' && (
        <ClubStep
          clubSearch={model.clubSearch}
          setClubSearch={model.setClubSearch}
          selectedClub={model.selectedClub}
          setSelectedClub={model.setSelectedClub}
          guestCount={model.selectedContacts.length}
        />
      )}

      {model.step === 'club_choice' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              model.setSelectedContacts([]);
              model.setStep('club');
            }}
            className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/25 p-6 text-center transition hover:border-violet-400/60"
          >
            <UserRound size={38} className="text-violet-300" />
            <span className="mt-4 font-black text-white">Go Alone</span>
            <span className="mt-1 text-xs text-slate-500">A solo night out.</span>
          </button>
          <button
            type="button"
            onClick={() => model.setStep('people')}
            className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/25 p-6 text-center transition hover:border-violet-400/60"
          >
            <Users size={38} className="text-violet-300" />
            <span className="mt-4 font-black text-white">Invite Someone</span>
            <span className="mt-1 text-xs text-slate-500">Bring guests for the night.</span>
          </button>
        </div>
      )}

      {model.step === 'note' && (
        <div className="space-y-6">
          <ActionTextField
            label="Occasion / Note"
            value={model.reason}
            onChange={model.setReason}
            placeholder={actionType === 'dinner'
              ? 'Discussing contract extension, team chemistry, or personal support...'
              : 'Team bonding, rookie welcome, morale boost...'}
            optional
            multiline
            minRowsClassName="min-h-28"
          />
          {actionType === 'dinner' ? (
            <ActionInfoPanel
              icon={<CalendarDays size={26} />}
              title="Next Step"
              accent="amber"
              aside={<GlassWater size={50} className="text-violet-400/80" />}
            >
              After sending the invitation, the selected venue and date will be arranged.
            </ActionInfoPanel>
          ) : (
            <ActionInfoPanel icon={<Smile size={27} />} title="Social Effect" accent="violet">
              Casual outings can strengthen relationships, improve chemistry, and build off-court comfort.
            </ActionInfoPanel>
          )}
          {chargePersonalFunds && isSocialAction && model.selectedContacts.length > 0 && (
            <ActionInfoPanel
              icon={<CircleDollarSign size={26} />}
              title="Personal Expense"
              accent={actionType === 'dinner' ? 'amber' : 'violet'}
            >
              <span className={personalExpenseExceedsFunds ? 'font-bold text-rose-300' : undefined}>
                {formatTeamActivityCost(socialActivityType, model.selectedContacts.length)} from personal funds
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                Team Chemistry +{getTeamActivityChemistryGain(model.selectedContacts.length).toFixed(1)}
              </span>
              {personalExpenseExceedsFunds && (
                <span className="mt-1 block text-xs text-rose-300">Insufficient personal funds.</span>
              )}
            </ActionInfoPanel>
          )}
        </div>
      )}

      {model.step === 'details' && (
        <PersonActionDetails
          actionType={actionType}
          model={model}
          fundSource={fundSource}
          onFundSourceChange={onFundSourceChange}
          disbursementExceedsFunds={disbursementExceedsFunds}
        />
      )}
    </ActionModalShell>
  );
}
