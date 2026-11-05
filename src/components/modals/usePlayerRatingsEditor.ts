import { useEffect, useMemo, useState } from 'react';
import type { NBAPlayer } from '../../types';
import type { PlayerRatingsUpdateOptions } from '../../store/gameContextCore';
import { resolvePlayerRatingBundle } from '../../store/playerRatingStore';
import { calculateK2 } from '../../services/simulation/convert2kAttributes';
import { applyLeagueDisplayScale } from '../../hooks/useLeagueScaledRatings';
import {
  deriveK2DetailOffsets,
  getK2DetailAttributeKey,
  hasK2DetailOffsets,
  normalizeK2DetailOffsets,
  projectK2ToCoreRatings,
  setK2DetailValue,
  type K2CategoryKey,
  type K2DetailOffsets,
} from '../../services/simulation/k2DetailRatings';

type UpdatePlayerRatings = (
  playerId: string,
  season: number,
  ratings: Record<string, number>,
  options?: PlayerRatingsUpdateOptions,
) => void;

export function usePlayerRatingsEditor({
  player,
  season,
  ratingVersion,
  isGodMode,
  updatePlayerRatings,
}: {
  player: NBAPlayer;
  season: number;
  ratingVersion: number;
  isGodMode: boolean;
  updatePlayerRatings: UpdatePlayerRatings;
}) {
  const currentRatings = useMemo(
    () => resolvePlayerRatingBundle(player, season, season, { blendReal2K: false }).currentRatings,
    [player, season, ratingVersion],
  );
  const selectedRating = useMemo(() => {
    const ratings = (player.ratings ?? []) as any[];
    return ratings.find(rating => rating.season === season) ?? ratings[ratings.length - 1] ?? {};
  }, [player.ratings, season]);
  const savedDetailOffsets = useMemo(
    () => normalizeK2DetailOffsets(selectedRating.k2DetailOffsets),
    [selectedRating],
  );
  const savedRatingBundle = useMemo(
    () => resolvePlayerRatingBundle(player, season, season),
    [player, season, ratingVersion],
  );
  const editorDetailOffsets = useMemo(
    () => hasK2DetailOffsets(savedDetailOffsets)
      ? savedDetailOffsets
      : deriveK2DetailOffsets(savedRatingBundle.rawK2, savedRatingBundle.displayK2),
    [savedDetailOffsets, savedRatingBundle],
  );

  const [editMode, setEditMode] = useState(false);
  const [detailed, setDetailed] = useState(true);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>(currentRatings);
  const [detailOffsets, setDetailOffsets] = useState<K2DetailOffsets>(editorDetailOffsets);
  const [durability, setDurability] = useState(savedRatingBundle.durability);
  const [authoredDetailKeys, setAuthoredDetailKeys] = useState<Set<string>>(() => new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (editMode) return;
    setLocalRatings(currentRatings);
    setDetailOffsets(editorDetailOffsets);
    setDurability(savedRatingBundle.durability);
    setAuthoredDetailKeys(new Set());
    setDirty(false);
  }, [currentRatings, editorDetailOffsets, savedRatingBundle.durability, editMode]);

  const ratingBundle = useMemo(
    () => resolvePlayerRatingBundle(player, season, season, {
      ratingsOverride: localRatings,
      k2DetailOffsetsOverride: detailOffsets,
      durabilityOverride: durability,
    }),
    [player, season, localRatings, detailOffsets, durability, ratingVersion],
  );

  const reset = () => {
    setLocalRatings(currentRatings);
    setDetailOffsets(editorDetailOffsets);
    setDurability(savedRatingBundle.durability);
    setAuthoredDetailKeys(new Set());
    setDirty(false);
  };

  const toggleEditing = () => {
    reset();
    if (editMode) setDetailed(false);
    setEditMode(current => !current);
  };

  const changeCore = (key: string, value: number) => {
    setDirty(true);
    setLocalRatings(current => ({ ...current, [key]: value }));
  };

  const changeDetail = (category: string, index: number, value: number) => {
    setDirty(true);
    if (category === 'MI') {
      setDurability(Math.max(0, Math.min(99, Math.round(value))));
      return;
    }
    const categoryKey = category as K2CategoryKey;
    setAuthoredDetailKeys(current => new Set(current).add(getK2DetailAttributeKey(categoryKey, index)));
    setDetailOffsets(current =>
      setK2DetailValue(ratingBundle.rawK2, current, categoryKey, index, value),
    );
  };

  const save = () => {
    if (!isGodMode) return;
    if (!dirty) {
      setEditMode(false);
      setDetailed(false);
      return;
    }
    const desiredK2 = ratingBundle.k2;
    const physicals = {
      pos: player.pos,
      heightIn: player.hgt,
      weightLbs: player.weight,
      age: ratingBundle.age,
    };
    const projection = projectK2ToCoreRatings({
      ratings: localRatings,
      desiredK2,
      physicals,
      evaluate: candidate => calculateK2(
        applyLeagueDisplayScale(player.status, candidate) as any,
        physicals,
      ),
      authoredAttributes: authoredDetailKeys,
    });
    updatePlayerRatings(player.internalId, season, projection.ratings, {
      k2DetailOffsets: projection.detailOffsets,
      durability,
      standingDunk: desiredK2.IS.sub[1],
      drivingDunk: desiredK2.IS.sub[2],
    });
    setEditMode(false);
    setDetailed(false);
  };

  return {
    editMode,
    detailed,
    currentRatings,
    localRatings,
    ratingBundle,
    setDetailed,
    toggleEditing,
    changeCore,
    changeDetail,
    save,
  };
}
