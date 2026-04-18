import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FormatTab } from './FormatTab';
import { DraftTab } from './DraftTab';
import { AllStarTab } from './AllStarTab';
import { GameRulesSettings } from './GameRulesSettings';
import { LeagueHonorsSection } from '../LeagueHonorsSection';
import { AwardModal } from '../../AwardModal';
import { EconomyTab } from './EconomyTab';

interface TabsContentProps {
    activeTab: string;
    rulesState: any;
}

export const TabsContent: React.FC<TabsContentProps> = ({ activeTab, rulesState }) => {
    const updatePlayoffFormat = (index: number, value: string) => {
        const newFormat = [...rulesState.playoffFormat];
        if (value === '') {
            newFormat[index] = '';
        } else {
            newFormat[index] = parseInt(value, 10);
        }
        rulesState.setPlayoffFormat(newFormat);
    };

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
            >
                {activeTab === 'Format' && (
                    <FormatTab 
                        playIn={rulesState.playIn}
                        setPlayIn={rulesState.setPlayIn}
                        inSeasonTournament={rulesState.inSeasonTournament}
                        setInSeasonTournament={rulesState.setInSeasonTournament}
                        playoffFormat={rulesState.playoffFormat}
                        updatePlayoffFormat={updatePlayoffFormat}
                        minGamesRequirement={rulesState.minGamesRequirement}
                        setMinGamesRequirement={rulesState.setMinGamesRequirement}
                        gamesPerSeason={rulesState.gamesPerSeason}
                        setGamesPerSeason={rulesState.setGamesPerSeason}
                        divisionGames={rulesState.divisionGames}
                        setDivisionGames={rulesState.setDivisionGames}
                        conferenceGames={rulesState.conferenceGames}
                        setConferenceGames={rulesState.setConferenceGames}
                    />
                )}

                {activeTab === 'Draft' && (
                    <DraftTab 
                        draftType={rulesState.draftType}
                        setDraftType={rulesState.setDraftType}
                        eligibilityRule={rulesState.eligibilityRule}
                        setEligibilityRule={rulesState.setEligibilityRule}
                    />
                )}

                {activeTab === 'Honors' && (
                    <div className="space-y-6">
                        <LeagueHonorsSection 
                            localAwards={rulesState.localAwards}
                            expandedAward={rulesState.expandedAward}
                            setExpandedAward={rulesState.setExpandedAward}
                            handleRemoveAward={rulesState.handleRemoveAward}
                            setAwardModalOpen={rulesState.setAwardModalOpen}
                            allNbaTeams={rulesState.allNbaTeams}
                            setAllNbaTeams={rulesState.setAllNbaTeams}
                            allNbaPlayersPerTeam={rulesState.allNbaPlayersPerTeam}
                            setAllNbaPlayersPerTeam={rulesState.setAllNbaPlayersPerTeam}
                            allDefenseTeams={rulesState.allDefenseTeams}
                            setAllDefenseTeams={rulesState.setAllDefenseTeams}
                            allDefensePlayersPerTeam={rulesState.allDefensePlayersPerTeam}
                            setAllDefensePlayersPerTeam={rulesState.setAllDefensePlayersPerTeam}
                            allRookieTeams={rulesState.allRookieTeams}
                            setAllRookieTeams={rulesState.setAllRookieTeams}
                            allRookiePlayersPerTeam={rulesState.allRookiePlayersPerTeam}
                            setAllRookiePlayersPerTeam={rulesState.setAllRookiePlayersPerTeam}
                            positionlessAwards={rulesState.positionlessAwards}
                            setPositionlessAwards={rulesState.setPositionlessAwards}
                        />
                        {rulesState.awardModalOpen && (
                            <AwardModal 
                                onClose={() => rulesState.setAwardModalOpen(false)}
                                onAdd={rulesState.handleAddAward}
                                isGenerating={rulesState.isGeneratingAward}
                            />
                        )}
                    </div>
                )}

                {activeTab === 'All-Star' && (
                    <AllStarTab 
                        allStarGameEnabled={rulesState.allStarGameEnabled}
                        setAllStarGameEnabled={rulesState.setAllStarGameEnabled}
                        allStarFormat={rulesState.allStarFormat}
                        setAllStarFormat={rulesState.setAllStarFormat}
                        allStarTeams={rulesState.allStarTeams}
                        setAllStarTeams={rulesState.setAllStarTeams}
                        allStarDunkContest={rulesState.allStarDunkContest}
                        setAllStarDunkContest={rulesState.setAllStarDunkContest}
                        allStarDunkContestPlayers={rulesState.allStarDunkContestPlayers}
                        setAllStarDunkContestPlayers={rulesState.setAllStarDunkContestPlayers}
                        allStarThreePointContest={rulesState.allStarThreePointContest}
                        setAllStarThreePointContest={rulesState.setAllStarThreePointContest}
                        allStarThreePointContestPlayers={rulesState.allStarThreePointContestPlayers}
                        setAllStarThreePointContestPlayers={rulesState.setAllStarThreePointContestPlayers}
                        allStarShootingStars={rulesState.allStarShootingStars}
                        setAllStarShootingStars={rulesState.setAllStarShootingStars}
                        allStarShootingStarsMode={rulesState.allStarShootingStarsMode}
                        setAllStarShootingStarsMode={rulesState.setAllStarShootingStarsMode}
                        allStarShootingStarsTeams={rulesState.allStarShootingStarsTeams}
                        setAllStarShootingStarsTeams={rulesState.setAllStarShootingStarsTeams}
                        allStarShootingStarsPlayersPerTeam={rulesState.allStarShootingStarsPlayersPerTeam}
                        setAllStarShootingStarsPlayersPerTeam={rulesState.setAllStarShootingStarsPlayersPerTeam}
                        allStarShootingStarsTotalPlayers={rulesState.allStarShootingStarsTotalPlayers}
                        setAllStarShootingStarsTotalPlayers={rulesState.setAllStarShootingStarsTotalPlayers}
                        allStarSkillsChallenge={rulesState.allStarSkillsChallenge}
                        setAllStarSkillsChallenge={rulesState.setAllStarSkillsChallenge}
                        allStarSkillsChallengeMode={rulesState.allStarSkillsChallengeMode}
                        setAllStarSkillsChallengeMode={rulesState.setAllStarSkillsChallengeMode}
                        allStarSkillsChallengeTeams={rulesState.allStarSkillsChallengeTeams}
                        setAllStarSkillsChallengeTeams={rulesState.setAllStarSkillsChallengeTeams}
                        allStarSkillsChallengePlayersPerTeam={rulesState.allStarSkillsChallengePlayersPerTeam}
                        setAllStarSkillsChallengePlayersPerTeam={rulesState.setAllStarSkillsChallengePlayersPerTeam}
                        allStarSkillsChallengeTotalPlayers={rulesState.allStarSkillsChallengeTotalPlayers}
                        setAllStarSkillsChallengeTotalPlayers={rulesState.setAllStarSkillsChallengeTotalPlayers}
                        allStarHorse={rulesState.allStarHorse}
                        setAllStarHorse={rulesState.setAllStarHorse}
                        allStarHorseParticipants={rulesState.allStarHorseParticipants}
                        setAllStarHorseParticipants={rulesState.setAllStarHorseParticipants}
                        allStarOneOnOneEnabled={rulesState.allStarOneOnOneEnabled}
                        setAllStarOneOnOneEnabled={rulesState.setAllStarOneOnOneEnabled}
                        allStarOneOnOneParticipants={rulesState.allStarOneOnOneParticipants}
                        setAllStarOneOnOneParticipants={rulesState.setAllStarOneOnOneParticipants}
                        allStarMirrorLeagueRules={rulesState.allStarMirrorLeagueRules}
                        setAllStarMirrorLeagueRules={rulesState.setAllStarMirrorLeagueRules}
                        allStarGameFormat={rulesState.allStarGameFormat}
                        setAllStarGameFormat={rulesState.setAllStarGameFormat}
                        allStarQuarterLength={rulesState.allStarQuarterLength}
                        setAllStarQuarterLength={rulesState.setAllStarQuarterLength}
                        allStarNumQuarters={rulesState.allStarNumQuarters}
                        setAllStarNumQuarters={rulesState.setAllStarNumQuarters}
                        allStarOvertimeDuration={rulesState.allStarOvertimeDuration}
                        setAllStarOvertimeDuration={rulesState.setAllStarOvertimeDuration}
                        allStarOvertimeTargetPoints={rulesState.allStarOvertimeTargetPoints}
                        setAllStarOvertimeTargetPoints={rulesState.setAllStarOvertimeTargetPoints}
                        allStarShootoutRounds={rulesState.allStarShootoutRounds}
                        setAllStarShootoutRounds={rulesState.setAllStarShootoutRounds}
                        allStarOvertimeType={rulesState.allStarOvertimeType}
                        setAllStarOvertimeType={rulesState.setAllStarOvertimeType}
                        allStarMaxOvertimesEnabled={rulesState.allStarMaxOvertimesEnabled}
                        setAllStarMaxOvertimesEnabled={rulesState.setAllStarMaxOvertimesEnabled}
                        allStarMaxOvertimes={rulesState.allStarMaxOvertimes}
                        setAllStarMaxOvertimes={rulesState.setAllStarMaxOvertimes}
                        allStarOvertimeTieBreaker={rulesState.allStarOvertimeTieBreaker}
                        setAllStarOvertimeTieBreaker={rulesState.setAllStarOvertimeTieBreaker}
                        risingStarsEnabled={rulesState.risingStarsEnabled}
                        setRisingStarsEnabled={rulesState.setRisingStarsEnabled}
                        risingStarsFormat={rulesState.risingStarsFormat}
                        setRisingStarsFormat={rulesState.setRisingStarsFormat}
                        risingStarsMirrorLeagueRules={rulesState.risingStarsMirrorLeagueRules}
                        setRisingStarsMirrorLeagueRules={rulesState.setRisingStarsMirrorLeagueRules}
                        celebrityGameEnabled={rulesState.celebrityGameEnabled}
                        setCelebrityGameEnabled={rulesState.setCelebrityGameEnabled}
                        celebrityGameMirrorLeagueRules={rulesState.celebrityGameMirrorLeagueRules}
                        setCelebrityGameMirrorLeagueRules={rulesState.setCelebrityGameMirrorLeagueRules}
                    />
                )}

                {activeTab === 'Game Rules' && (
                    <div className="space-y-8">
                        <GameRulesSettings
                            gameFormat={rulesState.gameFormat} setGameFormat={rulesState.setGameFormat}
                            gameTargetScore={rulesState.gameTargetScore} setGameTargetScore={rulesState.setGameTargetScore}
                            fourPointLine={rulesState.fourPointLine} setFourPointLine={rulesState.setFourPointLine}
                            threePointLineEnabled={rulesState.threePointLineEnabled} setThreePointLineEnabled={rulesState.setThreePointLineEnabled}
                            multiballCount={rulesState.multiballCount} setMultiballCount={rulesState.setMultiballCount}
                            foulOutLimit={rulesState.foulOutLimit} setFoulOutLimit={rulesState.setFoulOutLimit}
                            teamFoulPenalty={rulesState.teamFoulPenalty} setTeamFoulPenalty={rulesState.setTeamFoulPenalty}
                            quarterLength={rulesState.quarterLength} setQuarterLength={rulesState.setQuarterLength}
                            numQuarters={rulesState.numQuarters} setNumQuarters={rulesState.setNumQuarters}
                            overtimeDuration={rulesState.overtimeDuration} setOvertimeDuration={rulesState.setOvertimeDuration}
                            overtimeTargetPoints={rulesState.overtimeTargetPoints} setOvertimeTargetPoints={rulesState.setOvertimeTargetPoints}
                            shootoutRounds={rulesState.shootoutRounds} setShootoutRounds={rulesState.setShootoutRounds}
                            overtimeType={rulesState.overtimeType} setOvertimeType={rulesState.setOvertimeType}
                            maxTimeouts={rulesState.maxTimeouts} setMaxTimeouts={rulesState.setMaxTimeouts}
                            coachChallenges={rulesState.coachChallenges} setCoachChallenges={rulesState.setCoachChallenges}
                            maxCoachChallenges={rulesState.maxCoachChallenges} setMaxCoachChallenges={rulesState.setMaxCoachChallenges}
                            challengeReimbursed={rulesState.challengeReimbursed} setChallengeReimbursed={rulesState.setChallengeReimbursed}
                            shotClockEnabled={rulesState.shotClockEnabled} setShotClockEnabled={rulesState.setShotClockEnabled}
                            shotClockValue={rulesState.shotClockValue} setShotClockValue={rulesState.setShotClockValue}
                            backcourtTimerEnabled={rulesState.backcourtTimerEnabled} setBackcourtTimerEnabled={rulesState.setBackcourtTimerEnabled}
                            backcourtTimerValue={rulesState.backcourtTimerValue} setBackcourtTimerValue={rulesState.setBackcourtTimerValue}
                            offensiveThreeSecondEnabled={rulesState.offensiveThreeSecondEnabled} setOffensiveThreeSecondEnabled={rulesState.setOffensiveThreeSecondEnabled}
                            offensiveThreeSecondValue={rulesState.offensiveThreeSecondValue} setOffensiveThreeSecondValue={rulesState.setOffensiveThreeSecondValue}
                            defensiveThreeSecondEnabled={rulesState.defensiveThreeSecondEnabled} setDefensiveThreeSecondEnabled={rulesState.setDefensiveThreeSecondEnabled}
                            defensiveThreeSecondValue={rulesState.defensiveThreeSecondValue} setDefensiveThreeSecondValue={rulesState.setDefensiveThreeSecondValue}
                            inboundTimerEnabled={rulesState.inboundTimerEnabled} setInboundTimerEnabled={rulesState.setInboundTimerEnabled}
                            inboundTimerValue={rulesState.inboundTimerValue} setInboundTimerValue={rulesState.setInboundTimerValue}
                            backToBasketTimerEnabled={rulesState.backToBasketTimerEnabled} setBackToBasketTimerEnabled={rulesState.setBackToBasketTimerEnabled}
                            backToBasketTimerValue={rulesState.backToBasketTimerValue} setBackToBasketTimerValue={rulesState.setBackToBasketTimerValue}
                            backcourtViolationEnabled={rulesState.backcourtViolationEnabled} setBackcourtViolationEnabled={rulesState.setBackcourtViolationEnabled}
                            travelingEnabled={rulesState.travelingEnabled} setTravelingEnabled={rulesState.setTravelingEnabled}
                            doubleDribbleEnabled={rulesState.doubleDribbleEnabled} setDoubleDribbleEnabled={rulesState.setDoubleDribbleEnabled}
                            goaltendingEnabled={rulesState.goaltendingEnabled} setGoaltendingEnabled={rulesState.setGoaltendingEnabled}
                            basketInterferenceEnabled={rulesState.basketInterferenceEnabled} setBasketInterferenceEnabled={rulesState.setBasketInterferenceEnabled}
                            kickedBallEnabled={rulesState.kickedBallEnabled} setKickedBallEnabled={rulesState.setKickedBallEnabled}
                            flagrantFoulPenaltyEnabled={rulesState.flagrantFoulPenaltyEnabled} setFlagrantFoulPenaltyEnabled={rulesState.setFlagrantFoulPenaltyEnabled}
                            clearPathFoulEnabled={rulesState.clearPathFoulEnabled} setClearPathFoulEnabled={rulesState.setClearPathFoulEnabled}
                            illegalScreenEnabled={rulesState.illegalScreenEnabled} setIllegalScreenEnabled={rulesState.setIllegalScreenEnabled}
                            overTheBackFoulEnabled={rulesState.overTheBackFoulEnabled} setOverTheBackFoulEnabled={rulesState.setOverTheBackFoulEnabled}
                            looseBallFoulEnabled={rulesState.looseBallFoulEnabled} setLooseBallFoulEnabled={rulesState.setLooseBallFoulEnabled}
                            chargingEnabled={rulesState.chargingEnabled} setChargingEnabled={rulesState.setChargingEnabled}
                            overtimeEnabled={rulesState.overtimeEnabled} setOvertimeEnabled={rulesState.setOvertimeEnabled}
                            maxOvertimesEnabled={rulesState.maxOvertimesEnabled} setMaxOvertimesEnabled={rulesState.setMaxOvertimesEnabled}
                            maxOvertimes={rulesState.maxOvertimes} setMaxOvertimes={rulesState.setMaxOvertimes}
                            overtimeTieBreaker={rulesState.overtimeTieBreaker} setOvertimeTieBreaker={rulesState.setOvertimeTieBreaker}
                            maxPlayersOnCourt={rulesState.maxPlayersOnCourt} setMaxPlayersOnCourt={rulesState.setMaxPlayersOnCourt}
                            substitutionLimitEnabled={rulesState.substitutionLimitEnabled} setSubstitutionLimitEnabled={rulesState.setSubstitutionLimitEnabled}
                            maxSubstitutions={rulesState.maxSubstitutions} setMaxSubstitutions={rulesState.setMaxSubstitutions}
                            noDribbleRule={rulesState.noDribbleRule} setNoDribbleRule={rulesState.setNoDribbleRule}
                            multiballEnabled={rulesState.multiballEnabled} setMultiballEnabled={rulesState.setMultiballEnabled}
                            threePointLineDistance={rulesState.threePointLineDistance} setThreePointLineDistance={rulesState.setThreePointLineDistance}
                            fourPointLineDistance={rulesState.fourPointLineDistance} setFourPointLineDistance={rulesState.setFourPointLineDistance}
                            dunkValue={rulesState.dunkValue} setDunkValue={rulesState.setDunkValue}
                            midrangeValue={rulesState.midrangeValue} setMidrangeValue={rulesState.setMidrangeValue}
                            heaveRuleEnabled={rulesState.heaveRuleEnabled} setHeaveRuleEnabled={rulesState.setHeaveRuleEnabled}
                            halfCourtShotValue={rulesState.halfCourtShotValue} setHalfCourtShotValue={rulesState.setHalfCourtShotValue}
                            clutchTimeoutLimit={rulesState.clutchTimeoutLimit} setClutchTimeoutLimit={rulesState.setClutchTimeoutLimit}
                            handcheckingEnabled={rulesState.handcheckingEnabled} setHandcheckingEnabled={rulesState.setHandcheckingEnabled}
                            illegalZoneDefenseEnabled={rulesState.illegalZoneDefenseEnabled} setIllegalZoneDefenseEnabled={rulesState.setIllegalZoneDefenseEnabled}
                            outOfBoundsEnabled={rulesState.outOfBoundsEnabled} setOutOfBoundsEnabled={rulesState.setOutOfBoundsEnabled}
                            freeThrowDistance={rulesState.freeThrowDistance} setFreeThrowDistance={rulesState.setFreeThrowDistance}
                            rimHeight={rulesState.rimHeight} setRimHeight={rulesState.setRimHeight}
                            ballWeight={rulesState.ballWeight} setBallWeight={rulesState.setBallWeight}
                            startOfPossessionMethod={rulesState.startOfPossessionMethod} setStartOfPossessionMethod={rulesState.setStartOfPossessionMethod}
                            possessionPattern={rulesState.possessionPattern} setPossessionPattern={rulesState.setPossessionPattern}
                            courtLength={rulesState.courtLength} setCourtLength={rulesState.setCourtLength}
                            baselineLength={rulesState.baselineLength} setBaselineLength={rulesState.setBaselineLength}
                            keyWidth={rulesState.keyWidth} setKeyWidth={rulesState.setKeyWidth}
                            cornerThrowInEnabled={rulesState.cornerThrowInEnabled} setCornerThrowInEnabled={rulesState.setCornerThrowInEnabled}
                            techEjectionLimit={rulesState.techEjectionLimit} setTechEjectionLimit={rulesState.setTechEjectionLimit}
                            flagrant1EjectionLimit={rulesState.flagrant1EjectionLimit} setFlagrant1EjectionLimit={rulesState.setFlagrant1EjectionLimit}
                            flagrant2EjectionLimit={rulesState.flagrant2EjectionLimit} setFlagrant2EjectionLimit={rulesState.setFlagrant2EjectionLimit}
                            fightingInstantEjection={rulesState.fightingInstantEjection} setFightingInstantEjection={rulesState.setFightingInstantEjection}
                            useYellowRedCards={rulesState.useYellowRedCards} setUseYellowRedCards={rulesState.setUseYellowRedCards}
                            shotClockResetOffensiveRebound={rulesState.shotClockResetOffensiveRebound} setShotClockResetOffensiveRebound={rulesState.setShotClockResetOffensiveRebound}
                        />
                    </div>
                )}

                {activeTab === 'Economy' && (
                    <EconomyTab 
                        draftType={rulesState.draftType}
                        salaryCap={rulesState.salaryCap}
                        setSalaryCap={rulesState.setSalaryCap}
                        salaryCapEnabled={rulesState.salaryCapEnabled}
                        setSalaryCapEnabled={rulesState.setSalaryCapEnabled}
                        salaryCapType={rulesState.salaryCapType}
                        setSalaryCapType={rulesState.setSalaryCapType}
                        minimumPayrollEnabled={rulesState.minimumPayrollEnabled}
                        setMinimumPayrollEnabled={rulesState.setMinimumPayrollEnabled}
                        minimumPayrollPercentage={rulesState.minimumPayrollPercentage}
                        setMinimumPayrollPercentage={rulesState.setMinimumPayrollPercentage}
                        luxuryTaxEnabled={rulesState.luxuryTaxEnabled}
                        setLuxuryTaxEnabled={rulesState.setLuxuryTaxEnabled}
                        luxuryTaxThresholdPercentage={rulesState.luxuryTaxThresholdPercentage}
                        setLuxuryTaxThresholdPercentage={rulesState.setLuxuryTaxThresholdPercentage}
                        apronsEnabled={rulesState.apronsEnabled}
                        setApronsEnabled={rulesState.setApronsEnabled}
                        numberOfAprons={rulesState.numberOfAprons}
                        setNumberOfAprons={rulesState.setNumberOfAprons}
                        firstApronPercentage={rulesState.firstApronPercentage}
                        setFirstApronPercentage={rulesState.setFirstApronPercentage}
                        secondApronPercentage={rulesState.secondApronPercentage}
                        setSecondApronPercentage={rulesState.setSecondApronPercentage}
                        twoWayContractsEnabled={rulesState.twoWayContractsEnabled}
                        setTwoWayContractsEnabled={rulesState.setTwoWayContractsEnabled}
                        minPlayersPerTeam={rulesState.minPlayersPerTeam}
                        setMinPlayersPerTeam={rulesState.setMinPlayersPerTeam}
                        maxPlayersPerTeam={rulesState.maxPlayersPerTeam}
                        setMaxPlayersPerTeam={rulesState.setMaxPlayersPerTeam}
                        maxStandardPlayersPerTeam={rulesState.maxStandardPlayersPerTeam}
                        setMaxStandardPlayersPerTeam={rulesState.setMaxStandardPlayersPerTeam}
                        maxTwoWayPlayersPerTeam={rulesState.maxTwoWayPlayersPerTeam}
                        setMaxTwoWayPlayersPerTeam={rulesState.setMaxTwoWayPlayersPerTeam}
                        maxTrainingCampRoster={rulesState.maxTrainingCampRoster}
                        setMaxTrainingCampRoster={rulesState.setMaxTrainingCampRoster}
                        minContractType={rulesState.minContractType}
                        setMinContractType={rulesState.setMinContractType}
                        minContractStaticAmount={rulesState.minContractStaticAmount}
                        setMinContractStaticAmount={rulesState.setMinContractStaticAmount}
                        maxContractType={rulesState.maxContractType}
                        setMaxContractType={rulesState.setMaxContractType}
                        maxContractStaticPercentage={rulesState.maxContractStaticPercentage}
                        setMaxContractStaticPercentage={rulesState.setMaxContractStaticPercentage}
                        supermaxEnabled={rulesState.supermaxEnabled}
                        setSupermaxEnabled={rulesState.setSupermaxEnabled}
                        supermaxPercentage={rulesState.supermaxPercentage}
                        setSupermaxPercentage={rulesState.setSupermaxPercentage}
                        birdRightsEnabled={rulesState.birdRightsEnabled}
                        setBirdRightsEnabled={rulesState.setBirdRightsEnabled}
                        minContractLength={rulesState.minContractLength}
                        setMinContractLength={rulesState.setMinContractLength}
                        maxContractLengthStandard={rulesState.maxContractLengthStandard}
                        setMaxContractLengthStandard={rulesState.setMaxContractLengthStandard}
                        maxContractLengthBird={rulesState.maxContractLengthBird}
                        setMaxContractLengthBird={rulesState.setMaxContractLengthBird}
                        playerOptionsEnabled={rulesState.playerOptionsEnabled}
                        setPlayerOptionsEnabled={rulesState.setPlayerOptionsEnabled}
                        tenDayContractsEnabled={rulesState.tenDayContractsEnabled}
                        setTenDayContractsEnabled={rulesState.setTenDayContractsEnabled}
                        rookieScaleType={rulesState.rookieScaleType}
                        setRookieScaleType={rulesState.setRookieScaleType}
                        rookieStaticAmount={rulesState.rookieStaticAmount}
                        setRookieStaticAmount={rulesState.setRookieStaticAmount}
                        rookieMaxContractPercentage={rulesState.rookieMaxContractPercentage}
                        setRookieMaxContractPercentage={rulesState.setRookieMaxContractPercentage}
                        rookieScaleAppliesTo={rulesState.rookieScaleAppliesTo}
                        setRookieScaleAppliesTo={rulesState.setRookieScaleAppliesTo}
                        rookieContractLength={rulesState.rookieContractLength}
                        setRookieContractLength={rulesState.setRookieContractLength}
                        rookieTeamOptionsEnabled={rulesState.rookieTeamOptionsEnabled}
                        setRookieTeamOptionsEnabled={rulesState.setRookieTeamOptionsEnabled}
                        rookieTeamOptionYears={rulesState.rookieTeamOptionYears}
                        setRookieTeamOptionYears={rulesState.setRookieTeamOptionYears}
                        rookieRestrictedFreeAgentEligibility={rulesState.rookieRestrictedFreeAgentEligibility}
                        setRookieRestrictedFreeAgentEligibility={rulesState.setRookieRestrictedFreeAgentEligibility}
                        rookieContractCapException={rulesState.rookieContractCapException}
                        setRookieContractCapException={rulesState.setRookieContractCapException}
                        inflationEnabled={rulesState.inflationEnabled}
                        setInflationEnabled={rulesState.setInflationEnabled}
                        inflationMin={rulesState.inflationMin}
                        setInflationMin={rulesState.setInflationMin}
                        inflationMax={rulesState.inflationMax}
                        setInflationMax={rulesState.setInflationMax}
                        inflationAverage={rulesState.inflationAverage}
                        setInflationAverage={rulesState.setInflationAverage}
                        inflationStdDev={rulesState.inflationStdDev}
                        setInflationStdDev={rulesState.setInflationStdDev}
                        tradableDraftPickSeasons={rulesState.tradableDraftPickSeasons}
                        setTradableDraftPickSeasons={rulesState.setTradableDraftPickSeasons}
                        mleEnabled={rulesState.mleEnabled}
                        setMleEnabled={rulesState.setMleEnabled}
                        roomMleAmount={rulesState.roomMleAmount}
                        setRoomMleAmount={rulesState.setRoomMleAmount}
                        nonTaxpayerMleAmount={rulesState.nonTaxpayerMleAmount}
                        setNonTaxpayerMleAmount={rulesState.setNonTaxpayerMleAmount}
                        taxpayerMleAmount={rulesState.taxpayerMleAmount}
                        setTaxpayerMleAmount={rulesState.setTaxpayerMleAmount}
                        biannualEnabled={rulesState.biannualEnabled}
                        setBiannualEnabled={rulesState.setBiannualEnabled}
                        biannualAmount={rulesState.biannualAmount}
                        setBiannualAmount={rulesState.setBiannualAmount}
                        roomMlePercentage={rulesState.roomMlePercentage}
                        setRoomMlePercentage={rulesState.setRoomMlePercentage}
                        nonTaxpayerMlePercentage={rulesState.nonTaxpayerMlePercentage}
                        setNonTaxpayerMlePercentage={rulesState.setNonTaxpayerMlePercentage}
                        taxpayerMlePercentage={rulesState.taxpayerMlePercentage}
                        setTaxpayerMlePercentage={rulesState.setTaxpayerMlePercentage}
                        biannualPercentage={rulesState.biannualPercentage}
                        setBiannualPercentage={rulesState.setBiannualPercentage}
                        tradeDeadlineMonth={rulesState.tradeDeadlineMonth}
                        setTradeDeadlineMonth={rulesState.setTradeDeadlineMonth}
                        tradeDeadlineOrdinal={rulesState.tradeDeadlineOrdinal}
                        setTradeDeadlineOrdinal={rulesState.setTradeDeadlineOrdinal}
                        tradeDeadlineDayOfWeek={rulesState.tradeDeadlineDayOfWeek}
                        setTradeDeadlineDayOfWeek={rulesState.setTradeDeadlineDayOfWeek}
                        faStartMonth={rulesState.faStartMonth}
                        setFaStartMonth={rulesState.setFaStartMonth}
                        faStartDay={rulesState.faStartDay}
                        setFaStartDay={rulesState.setFaStartDay}
                        faMoratoriumDays={rulesState.faMoratoriumDays}
                        setFaMoratoriumDays={rulesState.setFaMoratoriumDays}
                        regularSeasonFAEnabled={rulesState.regularSeasonFAEnabled}
                        setRegularSeasonFAEnabled={rulesState.setRegularSeasonFAEnabled}
                        postDeadlineMultiYearContracts={rulesState.postDeadlineMultiYearContracts}
                        setPostDeadlineMultiYearContracts={rulesState.setPostDeadlineMultiYearContracts}
                    />
                )}
            </motion.div>
        </AnimatePresence>
    );
};
