import { useEffect, useMemo, useState } from 'react';
import { Contact } from '../../types';
import { Club } from '../../data/clubs';
import { convertTo2KRating } from '../../utils/helpers';
import { getInjuries } from '../../services/injuryService';
import { InjurySystem } from '../../services/simulation/InjurySystem';
import { getAllReferees, fetchRefereeData, getRefereePhoto } from '../../data/photos';
import { PERSON_ACTION_MAP } from '../../data/personActionDefs';
import { useGame } from '../../store/GameContext';
import { Restaurant, RESTAURANT_DATA_URL, Movie, MOVIE_DATA_URL } from './PersonSelector/types';
import type {
  PersonSelectorActionType,
  PersonSelectorModalProps,
  PersonSelectorStep,
} from './personSelectorModalShared';

type UsePersonSelectorModalModelArgs = Pick<
  PersonSelectorModalProps,
  'actionType' | 'onClose' | 'onSelect' | 'preSelectedContact' | 'skipPersonSelection'
>;

export function usePersonSelectorModalModel({
  actionType,
  onClose,
  onSelect,
  preSelectedContact,
  skipPersonSelection,
}: UsePersonSelectorModalModelArgs) {
  const { state } = useGame();
  const [step, setStep] = useState<PersonSelectorStep>(actionType === 'club' ? 'club_choice' : 'people');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>(preSelectedContact ? [preSelectedContact] : []);
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
  const [useMovieDatabase, setUseMovieDatabase] = useState<boolean | null>(null);
  const [clubSearch, setClubSearch] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [refsLoaded, setRefsLoaded] = useState(false);

  const isMultiSelect = ['dinner', 'movie', 'bribe', 'drug_test', 'suspension', 'sabotage', 'club', 'endorse_hof'].includes(actionType);
  const maxSelections = isMultiSelect ? 100 : 1;
  const requiresLocation = actionType === 'dinner';
  const requiresClub = actionType === 'club';
  const isMovieAction = actionType === 'movie';

  useEffect(() => {
    fetchRefereeData().then(() => setRefsLoaded(true)).catch(() => setRefsLoaded(true));
  }, []);

  useEffect(() => {
    if (isMovieAction && useMovieDatabase === null && step === 'people') {
      setStep('movie_prompt');
    }
  }, [isMovieAction, step, useMovieDatabase]);

  useEffect(() => {
    if (skipPersonSelection && preSelectedContact && actionType === 'contact') {
      onSelect([preSelectedContact]);
    }
  }, [actionType, onSelect, preSelectedContact, skipPersonSelection]);

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
    fetch(MOVIE_DATA_URL)
      .then(res => res.json())
      .then(data => {
        setMovies(data.data || []);
        setLoadingMovies(false);
      })
      .catch(err => {
        console.error('Failed to fetch movies', err);
        setLoadingMovies(false);
      });
  }, [isMovieAction, movies.length, step]);

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
          organization: 'NBA',
          type: 'team' as const,
          teamLogoUrl: team.logoUrl,
        });
      });
    }

    if (eligibility.includesNonNBATeams) {
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
          organization: 'NBA League Office',
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

      let organization = 'NBA';
      let title = 'Player';
      let league = 'NBA';
      const isNBA = !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'Draft Prospect', 'Prospect'].includes(player.status || '');
      const nbaTeam = isNBA ? teams.find(team => team.id === player.tid) : null;
      const nonNBATeam = !isNBA ? nonNBATeams.find(team => team.tid === player.tid && team.league === player.status) : null;

      if (player.tid === -100 || player.status === 'WNBA') {
        organization = 'WNBA';
        title = 'WNBA Player';
        league = 'WNBA';
      } else if (nbaTeam) {
        organization = nbaTeam.name;
      } else if (nonNBATeam) {
        organization = nonNBATeam.name;
        league = player.status || 'International';
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
        playerPortraitUrl: player.imgURL,
        teamLogoUrl: nbaTeam?.logoUrl || nonNBATeam?.imgURL,
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
  }, [actionType, refsLoaded, state]);

  const availableFilters = useMemo(() => {
    const filters = ['All', 'NBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA', 'Draft Prospect', 'Owner', 'GM', 'Coach', 'Referee', 'Free Agent', 'Retired'];
    return filters.filter(filter => {
      if (filter === 'All') return true;
      if (actionType === 'endorse_hof' && ['Owner', 'GM', 'Coach', 'Referee'].includes(filter)) return false;
      return allContacts.some(contact => contact.league === filter);
    });
  }, [actionType, allContacts]);

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
          if (activeFilter === 'All') return true;
          return contact.league === activeFilter;
        })
        .slice(0, 50),
    [actionType, activeFilter, allContacts, searchTerm],
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
    if (actionType === 'suspension' && duration) {
      finalReason = `${reason} (Duration: ${duration})`;
    }
    if (actionType === 'movie' && selectedMovie) {
      finalReason = `${reason ? `${reason} - ` : ''}Watching ${selectedMovie.title}`;
    }
    const locationName = selectedRestaurant ? selectedRestaurant.name : selectedClub ? selectedClub.name : undefined;
    onSelect(selectedContacts, finalReason, amount ? parseFloat(amount) : undefined, locationName, duration);
  };

  const handleNext = () => {
    if (step === 'movie_prompt') {
      setStep(useMovieDatabase ? 'movie' : 'people');
      return;
    }
    if (step === 'movie') {
      setStep('people');
      return;
    }
    if (step === 'people' && requiresLocation) {
      setStep('location');
      return;
    }
    if (step === 'people' && requiresClub) {
      setStep('club');
      return;
    }
    handleSubmit();
  };

  const goBack = () => {
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
      setStep('movie_prompt');
      return;
    }
    if (step === 'people' && isMovieAction && useMovieDatabase) {
      setStep('movie');
      return;
    }
    if (step === 'people' && actionType === 'club') {
      setStep('club_choice');
    }
  };

  const isFormValid = () => {
    if (step === 'movie_prompt') return useMovieDatabase !== null;
    if (step === 'movie') return !!selectedMovie;
    if (step === 'club_choice') return true;
    if (step === 'people' && selectedContacts.length === 0) return false;
    if (actionType !== 'club' && selectedContacts.length === 0) return false;
    if (actionType === 'club' && step !== 'club' && selectedContacts.length === 0) return false;
    if (actionType === 'suspension' && !reason.trim()) return false;
    if (actionType === 'sabotage' && (!reason.trim() || !duration.trim())) return false;
    if (actionType === 'drug_test' && !reason.trim()) return false;
    if (actionType === 'leak_scandal' && !reason.trim()) return false;
    if (actionType === 'hypnotize' && !reason.trim()) return false;
    if ((actionType === 'fine' || actionType === 'bribe' || actionType === 'give_money') && (!amount || !reason.trim())) return false;
    if (requiresLocation && step === 'location' && !selectedRestaurant) return false;
    if (requiresClub && step === 'club' && !selectedClub) return false;
    return true;
  };

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
    amount,
    setAmount,
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
    availableFilters,
    filteredContacts,
    sortedInjuries,
    handleInjurySelect,
    handleContactToggle,
    handleNext,
    goBack,
    isFormValid,
  };
}
