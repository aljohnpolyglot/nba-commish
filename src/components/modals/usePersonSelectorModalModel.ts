import { useEffect, useMemo, useRef, useState } from 'react';
import { Contact } from '../../types';
import { Club } from '../../data/clubs';
import { convertTo2KRating } from '../../utils/helpers';
import { getInjuries } from '../../services/injuryService';
import { InjurySystem } from '../../services/simulation/InjurySystem';
import { getAllReferees, fetchRefereeData, getRefereePhoto } from '../../data/photos';
import { PERSON_ACTION_MAP } from '../../data/personActionDefs';
import { useGame } from '../../store/GameContext';
import { Restaurant, RESTAURANT_DATA_URL, Movie } from './PersonSelector/types';
import { loadAvailableMovies } from './PersonSelector/movieAvailability';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { isExternalLeaguePlayer } from '../../utils/playerLeagueScope';
import type { DisciplineTemplateSelection } from '../../services/disciplinePolicy';
import { useFineAmountControl } from './PersonSelector/useFineAmountControl';
import { isPersonSelectorFormValid } from './PersonSelector/isPersonSelectorFormValid';
import type {
  PersonSelectorActionType,
  PersonSelectorModalProps,
  PersonSelectorStep,
} from './personSelectorModalShared';
import { getPlayerImage } from '../../utils/playerImage';
import { ensurePortraitLookupsLoaded } from '../../data/realPlayerDataFetcher';

type UsePersonSelectorModalModelArgs = Pick<
  PersonSelectorModalProps,
  | 'actionType'
  | 'allowEmptySelection'
  | 'contactFilter'
  | 'initialSelectedContacts'
  | 'onClose'
  | 'onSelect'
  | 'preSelectedContact'
  | 'skipPersonSelection'
>;

export function usePersonSelectorModalModel({
  actionType,
  onClose,
  onSelect,
  preSelectedContact,
  initialSelectedContacts,
  skipPersonSelection,
  allowEmptySelection,
  contactFilter,
}: UsePersonSelectorModalModelArgs) {
  const { state } = useGame();
  const isFictional = state.leagueType === 'fictional';
  const leagueLabel = isFictional ? 'Association' : 'NBA';
  const [step, setStep] = useState<PersonSelectorStep>(() => {
    if (actionType === 'club') return 'club_choice';
    if (actionType === 'movie') return 'movie';
    if (
      skipPersonSelection
      && preSelectedContact
      && ['fine', 'drug_test', 'suspension', 'sabotage', 'give_money', 'hypnotize', 'retire_now'].includes(actionType)
    ) return 'details';
    return 'people';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [includeFine, setIncludeFine] = useState(false);
  const [disciplineTemplate, setDisciplineTemplate] = useState<DisciplineTemplateSelection>();
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>(
    initialSelectedContacts?.length
      ? initialSelectedContacts
      : preSelectedContact
        ? [preSelectedContact]
        : [],
  );
  const [injurySort, setInjurySort] = useState<'name' | 'games-asc' | 'games-desc'>('name');
  const [selectedInjuryName, setSelectedInjuryName] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [movieSearch, setMovieSearch] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [useMovieDatabase, setUseMovieDatabase] = useState<boolean | null>(actionType === 'movie' ? true : null);
  const [clubSearch, setClubSearch] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [refsLoaded, setRefsLoaded] = useState(false);
  const [portraitLookupVersion, setPortraitLookupVersion] = useState(0);
  const appliedDisciplineCaseKey = useRef<string | null>(null);
  const fineAmount = useFineAmountControl(actionType, selectedContacts, state);
  const openDisciplineCase = useMemo(() => {
    if (selectedContacts.length !== 1) return undefined;
    return state.inbox.find(email =>
      email.action?.type === 'discipline-case'
      && email.action.status === 'open'
      && email.action.playerIds.includes(selectedContacts[0].id),
    );
  }, [selectedContacts, state.inbox]);
  const isDisciplineReasonLocked = openDisciplineCase?.action?.type === 'discipline-case'
    && actionType === 'drug_test';

  const isMultiSelect = ['dinner', 'movie', 'drug_test', 'suspension', 'sabotage', 'club', 'endorse_hof'].includes(actionType);
  const maxSelections = isMultiSelect ? 100 : 1;
  const requiresLocation = actionType === 'dinner';
  const requiresClub = actionType === 'club';
  const isMovieAction = actionType === 'movie';

  useEffect(() => {
    fetchRefereeData().then(() => setRefsLoaded(true)).catch(() => setRefsLoaded(true));
  }, []);

  useEffect(() => {
    let active = true;
    ensurePortraitLookupsLoaded()
      .then(() => { if (active) setPortraitLookupVersion(version => version + 1); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (skipPersonSelection && preSelectedContact && actionType === 'contact') {
      onSelect([preSelectedContact]);
    }
  }, [actionType, onSelect, preSelectedContact, skipPersonSelection]);

  useEffect(() => {
    if (openDisciplineCase?.action?.type !== 'discipline-case') {
      appliedDisciplineCaseKey.current = null;
      return;
    }
    const caseKey = `${actionType}:${openDisciplineCase.action.incidentId}`;
    if (appliedDisciplineCaseKey.current === caseKey) return;
    appliedDisciplineCaseKey.current = caseKey;
    if (['fine', 'suspension', 'drug_test'].includes(actionType)) {
      setReason(openDisciplineCase.action.reason);
      setDisciplineTemplate(undefined);
    }
    if (actionType === 'suspension') {
      setDuration(String(Math.max(1, openDisciplineCase.action.recommendedGames)));
      setIncludeFine(openDisciplineCase.action.recommendedSanction === 'fine_and_suspension');
    }
  }, [actionType, openDisciplineCase]);

  useEffect(() => {
    if (!requiresLocation || step !== 'location' || restaurants.length > 0) return;
    setLoadingRestaurants(true);
    fetch(RESTAURANT_DATA_URL)
      .then(res => res.text())
      .then(text => {
        const mapped = text
          .split('\n')
          .map(name => name.trim())
          .filter(name => name.length > 0)
          .map(name => ({
            name,
            city: 'Various',
            state: 'USA',
            telephone: 'N/A',
            genre: 'Restaurant',
          }));
        setRestaurants(mapped);
        setLoadingRestaurants(false);
      })
      .catch(err => {
        console.error('Failed to fetch restaurants', err);
        setLoadingRestaurants(false);
      });
  }, [requiresLocation, restaurants.length, step]);

  useEffect(() => {
    if (!isMovieAction || step !== 'movie' || movies.length > 0) return;
    setLoadingMovies(true);
    loadAvailableMovies(state.date, state.leagueStats.year)
      .then(available => {
        setMovies(available);
        setLoadingMovies(false);
      })
      .catch(err => {
        console.error('Failed to fetch movies', err);
        setLoadingMovies(false);
      });
  }, [isMovieAction, movies.length, state.date, state.leagueStats.year, step]);

  const allContacts = useMemo(() => {
    const contactsMap = new Map<string, Contact>();
    const { staff, players, teams, nonNBATeams } = state;
    const actionDef = PERSON_ACTION_MAP.get(actionType);
    const eligibility = actionDef?.eligibility ?? {};

    if (eligibility.includesTeams) {
      teams.forEach(team => {
        contactsMap.set(`team-${team.id}`, {
          id: `team-${team.id}`,
          name: team.name,
          title: 'Franchise',
          organization: leagueLabel,
          type: 'team' as const,
          teamLogoUrl: team.logoUrl,
        });
      });
    }

    if (eligibility.includesNonNBATeams && !isFictional) {
      nonNBATeams.forEach(team => {
        contactsMap.set(`non-nba-team-${team.tid}`, {
          id: `non-nba-team-${team.tid}`,
          name: team.name,
          title: 'International Franchise',
          organization: team.league,
          type: 'team' as const,
          teamLogoUrl: team.imgURL,
        });
      });
    }

    if (staff && (eligibility.includesStaff || eligibility.staffOnly)) {
      staff.gms.forEach(gm => {
        contactsMap.set(`gm-${gm.name}`, {
          id: `gm-${gm.name}`,
          name: gm.name,
          title: 'General Manager',
          organization: gm.team || 'NBA',
          type: 'gm' as const,
          playerPortraitUrl: gm.playerPortraitUrl,
          teamLogoUrl: gm.teamLogoUrl,
          league: 'GM',
        });
      });
      staff.owners.forEach(owner => {
        contactsMap.set(`owner-${owner.name}`, {
          id: `owner-${owner.name}`,
          name: owner.name,
          title: 'Owner',
          organization: owner.team || 'NBA',
          type: 'owner' as const,
          playerPortraitUrl: owner.playerPortraitUrl,
          teamLogoUrl: owner.teamLogoUrl,
          league: 'Owner',
        });
      });
      staff.coaches.forEach(coach => {
        contactsMap.set(`coach-${coach.name}`, {
          id: `coach-${coach.name}`,
          name: coach.name,
          title: 'Head Coach',
          organization: coach.team || 'NBA',
          type: 'coach' as const,
          playerPortraitUrl: coach.playerPortraitUrl,
          teamLogoUrl: coach.teamLogoUrl,
          league: 'Coach',
        });
      });
    }

    if (staff && (eligibility.includesLeagueOffice || eligibility.staffOnly)) {
      staff.leagueOffice.forEach(executive => {
        contactsMap.set(`league-office-${executive.name}`, {
          id: `league-office-${executive.name}`,
          name: executive.name,
          title: executive.jobTitle || 'Executive',
          organization: `${leagueLabel} Office`,
          type: 'league_office' as const,
          playerPortraitUrl: executive.playerPortraitUrl,
        });
      });
    }

    if (eligibility.includesRefs || eligibility.staffOnly) {
      getAllReferees().forEach(ref => {
        contactsMap.set(`ref-${ref.id}`, {
          id: `ref-${ref.id}`,
          name: ref.name,
          title: 'League Referee',
          organization: 'League Officials',
          type: 'coach' as const,
          playerPortraitUrl: getRefereePhoto(ref.name) || undefined,
          league: 'Referee',
        });
      });
    }

    if (eligibility.staffOnly) {
      return Array.from(contactsMap.values()).sort((a, b) => (a.organization || '').localeCompare(b.organization || ''));
    }

    const filteredPlayers = players.filter(player => {
      if (player.diedYear) return false;
      if (isFictional && isExternalLeaguePlayer(player)) return false;
      if (player.tid === -2 || player.status === 'Prospect' || player.status === 'Draft Prospect') return false;
      if (eligibility.excludeHOF) {
        return (player.status === 'Retired' || player.tid === -3) && !player.hof;
      }
      if (eligibility.requireActiveNBA) {
        if (player.status !== 'Active' || (player.tid ?? -1) < 0) return false;
        if (eligibility.excludeInjured && player.injury && player.injury.gamesRemaining > 0) return false;
        return true;
      }
      if (eligibility.playerStatuses) {
        return eligibility.playerStatuses.includes(player.status as any);
      }
      return true;
    });

    const processedPlayerNames = new Set<string>();
    filteredPlayers.forEach(player => {
      if (processedPlayerNames.has(player.name)) return;
      if (actionType === 'endorse_hof' && (player.hof || state.endorsedPlayers.includes(player.internalId))) return;
      processedPlayerNames.add(player.name);

      let organization = leagueLabel;
      let title = 'Player';
      let league = leagueLabel;
      const resolvedTeam = player.tid >= 0
        ? resolveAnyTeam(player.tid, teams, nonNBATeams)
        : null;
      const nbaTeam = player.tid >= 0 && player.tid < 100
        ? teams.find(team => team.id === player.tid) ?? resolvedTeam
        : null;
      const nonNBATeam = player.tid >= 100
        ? nonNBATeams.find(team => team.tid === player.tid) ?? resolvedTeam
        : null;

      if (player.tid === -100 || player.status === 'WNBA') {
        organization = 'WNBA';
        title = 'WNBA Player';
        league = 'WNBA';
      } else if (resolvedTeam) {
        organization = resolvedTeam.name;
        league = player.tid < 100 ? leagueLabel : player.status || 'International';
      } else if (player.tid === -1 && player.status === 'Free Agent') {
        organization = 'Free Agent';
        league = 'Free Agent';
      } else if (player.tid === -2 || player.status === 'Prospect' || player.status === 'Draft Prospect') {
        organization = 'Draft Prospect';
        title = 'Prospect';
        league = 'Draft Prospect';
      } else if (player.tid === -3 || player.status === 'Retired') {
        organization = player.hof ? 'Hall of Famer' : 'Retired Player';
        title = 'Retired';
        league = 'Retired';
      }

      const latestRatings = player.ratings?.[player.ratings.length - 1];
      const rating2K = convertTo2KRating(player.overallRating || 0, latestRatings?.hgt ?? 50, latestRatings?.tp);

      contactsMap.set(player.internalId, {
        id: player.internalId,
        name: player.name,
        title,
        organization,
        type: 'player' as const,
        playerPortraitUrl: getPlayerImage(player),
        teamLogoUrl: nbaTeam?.logoUrl || (nonNBATeam as any)?.imgURL || (resolvedTeam as any)?.logoUrl,
        ovr: Math.round(rating2K),
        league,
      });
    });

    return Array.from(contactsMap.values()).sort((a, b) => {
      const aIsStaff = ['owner', 'gm', 'coach'].includes(a.type);
      const bIsStaff = ['owner', 'gm', 'coach'].includes(b.type);
      if (aIsStaff && bIsStaff) return (a.organization || '').localeCompare(b.organization || '');
      if (!aIsStaff && !bIsStaff) return (b.ovr || 0) - (a.ovr || 0);
      return aIsStaff ? 1 : -1;
    });
  }, [actionType, portraitLookupVersion, refsLoaded, state]);

  const availableFilters = useMemo(() => {
    const filters = isFictional
      ? ['All', 'Association', 'Draft Prospect', 'Owner', 'GM', 'Coach', 'Referee', 'Free Agent', 'Retired']
      : ['All', 'NBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA', 'Draft Prospect', 'Owner', 'GM', 'Coach', 'Referee', 'Free Agent', 'Retired'];
    return filters.filter(filter => {
      if (filter === 'All') return true;
      if (actionType === 'endorse_hof' && ['Owner', 'GM', 'Coach', 'Referee'].includes(filter)) return false;
      return allContacts.some(contact =>
        contact.league === filter && (!contactFilter || contactFilter(contact)),
      );
    });
  }, [actionType, allContacts, contactFilter, isFictional]);

  useEffect(() => {
    if (!availableFilters.includes(activeFilter)) {
      setActiveFilter('All');
    }
  }, [activeFilter, availableFilters]);

  const filteredContacts = useMemo(
    () =>
      allContacts
        .filter(contact => {
          const matchesSearch =
            contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            contact.organization?.toLowerCase().includes(searchTerm.toLowerCase());
          if (!matchesSearch) return false;
          if (actionType === 'endorse_hof' && contact.type !== 'player') return false;
          if (contactFilter && !contactFilter(contact)) return false;
          if (activeFilter === 'All') return true;
          return contact.league === activeFilter;
        })
        .slice(0, 50),
    [actionType, activeFilter, allContacts, contactFilter, searchTerm],
  );

  const filteredRestaurants = useMemo(
    () =>
      (!restaurantSearch
        ? restaurants
        : restaurants.filter(restaurant =>
            restaurant.name.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
            restaurant.city.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
            restaurant.genre.toLowerCase().includes(restaurantSearch.toLowerCase()),
          )
      ).slice(0, 50),
    [restaurantSearch, restaurants],
  );

  const sortedInjuries = useMemo(
    () =>
      [...getInjuries()].sort((a, b) => {
        if (injurySort === 'name') return a.name.localeCompare(b.name);
        if (injurySort === 'games-asc') return a.games - b.games;
        return b.games - a.games;
      }),
    [injurySort],
  );

  const handleInjurySelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const injuryName = event.target.value;
    setSelectedInjuryName(injuryName);
    const injury = getInjuries().find(item => item.name === injuryName);
    if (!injury) return;
    setReason(injury.name);
    setDuration(InjurySystem.getSabotageGames(injury.games).toString());
  };

  const handleContactToggle = (contact: Contact) => {
    setSelectedContacts(current => {
      if (isMultiSelect) {
        if (current.some(item => item.id === contact.id)) {
          return current.filter(item => item.id !== contact.id);
        }
        return current.length < maxSelections ? [...current, contact] : current;
      }
      return current.some(item => item.id === contact.id) ? [] : [contact];
    });
  };

  const handleSubmit = () => {
    let finalReason = reason;
    if (actionType === 'movie' && selectedMovie) {
      finalReason = `${reason ? `${reason} - ` : ''}Watching ${selectedMovie.title}`;
    }
    const locationName = selectedRestaurant ? selectedRestaurant.name : selectedClub ? selectedClub.name : undefined;
    const selectedAmount = actionType === 'suspension' && !includeFine
      ? undefined
      : fineAmount.amount
        ? parseFloat(fineAmount.amount)
        : undefined;
    onSelect(selectedContacts, finalReason, selectedAmount, locationName, duration, disciplineTemplate);
  };

  const handleNext = () => {
    if (step === 'movie') {
      setStep('people');
      return;
    }
    if (step === 'people' && requiresLocation) {
      setStep('location');
      return;
    }
    if (step === 'people' && actionType === 'movie') {
      setStep('note');
      return;
    }
    if (step === 'people' && requiresClub) {
      setStep('club');
      return;
    }
    if (step === 'people' && ['fine', 'drug_test', 'suspension', 'sabotage', 'give_money', 'hypnotize', 'retire_now'].includes(actionType)) {
      setStep('details');
      return;
    }
    if (step === 'location') {
      setStep('note');
      return;
    }
    handleSubmit();
  };

  const goBack = () => {
    if (step === 'details') {
      if (skipPersonSelection && preSelectedContact) onClose();
      else setStep('people');
      return;
    }
    if (step === 'note') {
      setStep(actionType === 'dinner' ? 'location' : 'people');
      return;
    }
    if (step === 'location') {
      setStep('people');
      return;
    }
    if (step === 'club') {
      setStep(actionType === 'club' ? 'club_choice' : 'people');
      return;
    }
    if (step === 'club_choice') {
      onClose();
      return;
    }
    if (step === 'movie') {
      onClose();
      return;
    }
    if (step === 'people' && isMovieAction) {
      setStep('movie');
      return;
    }
    if (step === 'people' && actionType === 'club') {
      setStep('club_choice');
    }
  };

  const isFormValid = () => isPersonSelectorFormValid({
    actionType, step, selectedCount: selectedContacts.length, reason, duration, amount: fineAmount.amount,
    requiresLocation, hasRestaurant: !!selectedRestaurant, requiresClub, hasClub: !!selectedClub,
    useMovieDatabase, hasMovie: !!selectedMovie,
    allowEmptySelection,
  });

  return {
    step,
    setStep,
    searchTerm,
    setSearchTerm,
    activeFilter,
    setActiveFilter,
    reason,
    setReason,
    duration,
    setDuration,
    includeFine,
    setIncludeFine,
    disciplineTemplate,
    setDisciplineTemplate,
    amount: fineAmount.amount,
    setAmount: fineAmount.setAmount,
    fineAmountStep: fineAmount.step,
    recommendedFineAmount: fineAmount.recommendedAmount,
    fineCurrencyCode: fineAmount.currencyCode,
    selectedContacts,
    setSelectedContacts,
    injurySort,
    setInjurySort,
    selectedInjuryName,
    restaurants: filteredRestaurants,
    restaurantSearch,
    setRestaurantSearch,
    selectedRestaurant,
    setSelectedRestaurant,
    loadingRestaurants,
    movies,
    movieSearch,
    setMovieSearch,
    selectedMovie,
    setSelectedMovie,
    loadingMovies,
    useMovieDatabase,
    setUseMovieDatabase,
    clubSearch,
    setClubSearch,
    selectedClub,
    setSelectedClub,
    refsLoaded,
    requiresLocation,
    requiresClub,
    isMovieAction,
    isDisciplineReasonLocked,
    availableFilters,
    filteredContacts,
    sortedInjuries,
    handleInjurySelect,
    handleContactToggle,
    handleNext,
    handleSubmit,
    goBack,
    isFormValid,
  };
}
