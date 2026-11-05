import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FormatTab } from './FormatTab';
import { DraftTab } from './DraftTab';
import { AllStarTab } from './AllStarTab';
import { NBACupTab } from './NBACupTab';
import { GameRulesSettings } from './GameRulesSettings';
import { LeagueHonorsSection } from '../LeagueHonorsSection';
import { AwardsCatalogSection } from '../AwardsCatalogSection';
import { EconomyTab } from './EconomyTab';
import {
    getBalancedFirstRoundByes,
    getMinimumPlayoffField,
    getPlayoffBracketCapacity,
    MAX_PLAYOFF_ROUNDS,
    MIN_PLAYOFF_ROUNDS,
} from '../../../../utils/playoffFormat';

interface TabsContentProps {
    activeTab: string;
    rulesState: any;
    startup?: boolean;
}

export const TabsContent: React.FC<TabsContentProps> = ({ activeTab, rulesState, startup = false }) => {
    const updatePlayoffFormat = (index: number, value: string) => {
        const newFormat = [...rulesState.playoffFormat];
        if (value === '') {
            newFormat[index] = '';
        } else {
            newFormat[index] = parseInt(value, 10);
        }
        rulesState.setPlayoffFormat(newFormat);
    };

    const addPlayoffRound = () => {
        if (rulesState.playoffFormat.length >= MAX_PLAYOFF_ROUNDS) return;
        const previousLength = rulesState.playoffFormat.length;
        const previousValue = Number(rulesState.playoffFormat[previousLength - 1]) || 1;
        const newFormat = [...rulesState.playoffFormat, previousValue];
        const teamCount = getPlayoffBracketCapacity(newFormat.length);
        rulesState.setPlayoffFormat(newFormat);
        rulesState.setNumPlayoffTeams(teamCount);
        rulesState.setNumPlayoffByes(0);
    };

    const removePlayoffRound = () => {
        if (rulesState.playoffFormat.length <= MIN_PLAYOFF_ROUNDS) return;
        const newFormat = rulesState.playoffFormat.slice(0, -1);
        const capacity = getPlayoffBracketCapacity(newFormat.length);
        const minimum = getMinimumPlayoffField(newFormat.length, rulesState.playoffsByConf);
        const requested = Math.min(capacity, Math.max(minimum, Number(rulesState.numPlayoffTeams) || minimum));
        const teamCount = rulesState.playoffsByConf && requested % 2 !== 0 ? requested - 1 : requested;
        rulesState.setPlayoffFormat(newFormat);
        rulesState.setNumPlayoffTeams(teamCount);
        rulesState.setNumPlayoffByes(getBalancedFirstRoundByes(teamCount, newFormat.length));
    };

    const setPlayoffsByConference = (value: boolean) => {
        rulesState.setPlayoffsByConf(value);
        if (!value) rulesState.setPlayIn(false);
        const minimum = getMinimumPlayoffField(rulesState.playoffFormat.length, value);
        const capacity = getPlayoffBracketCapacity(rulesState.playoffFormat.length);
        const requested = Math.min(capacity, Math.max(minimum, Number(rulesState.numPlayoffTeams) || minimum));
        const teamCount = value && requested % 2 !== 0 ? requested - 1 : requested;
        rulesState.setNumPlayoffTeams(teamCount);
        rulesState.setNumPlayoffByes(getBalancedFirstRoundByes(teamCount, rulesState.playoffFormat.length));
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
                        playoffsEnabled={rulesState.playoffsEnabled}
                        setPlayoffsEnabled={rulesState.setPlayoffsEnabled}
                        playIn={rulesState.playIn}
                        setPlayIn={rulesState.setPlayIn}
                        playoffFormat={rulesState.playoffFormat}
                        updatePlayoffFormat={updatePlayoffFormat}
                        addPlayoffRound={addPlayoffRound}
                        removePlayoffRound={removePlayoffRound}
                        numPlayoffTeams={rulesState.numPlayoffTeams}
                        setNumPlayoffTeams={rulesState.setNumPlayoffTeams}
                        numPlayoffByes={rulesState.numPlayoffByes}
                        setNumPlayoffByes={rulesState.setNumPlayoffByes}
                        playoffsByConf={rulesState.playoffsByConf}
                        setPlayoffsByConf={setPlayoffsByConference}
                        minGamesRequirement={rulesState.minGamesRequirement}
                        setMinGamesRequirement={rulesState.setMinGamesRequirement}
                        customScheduleEnabled={rulesState.customScheduleEnabled}
                        setCustomScheduleEnabled={rulesState.setCustomScheduleEnabled}
                        leagueCalendar={rulesState.leagueCalendar}
                        setLeagueCalendar={rulesState.setLeagueCalendar}
                        gamesPerSeason={rulesState.gamesPerSeason}
                        setGamesPerSeason={rulesState.setGamesPerSeason}
                        divisionGames={rulesState.divisionGames}
                        setDivisionGames={rulesState.setDivisionGames}
                        conferenceGames={rulesState.conferenceGames}
                        setConferenceGames={rulesState.setConferenceGames}
                        preseasonGamesPerTeam={rulesState.preseasonGamesPerTeam}
                        setPreseasonGamesPerTeam={rulesState.setPreseasonGamesPerTeam}
                        jerseyPatchProgramEnabled={rulesState.jerseyPatchProgramEnabled}
                        setJerseyPatchProgramEnabled={rulesState.setJerseyPatchProgramEnabled}
                        uiMode={rulesState.uiMode}
                        seasonYear={rulesState.seasonYear}
                        inSeasonTournament={rulesState.inSeasonTournament}
                        allStarGameEnabled={rulesState.allStarGameEnabled}
                        summerLeagueEnabled={rulesState.summerLeagueEnabled}
                    />
                )}

                {activeTab === 'NBA Cup' && (
                    <NBACupTab rules={rulesState.rules} setRule={rulesState.setRule} startup={startup} />
                )}

                {activeTab === 'Draft' && (
                    <DraftTab
                        draftType={rulesState.draftType}
                        setDraftType={rulesState.setDraftType}
                        eligibilityRule={rulesState.eligibilityRule}
                        setEligibilityRule={rulesState.setEligibilityRule}
                        isPbaMode={rulesState.isPbaMode}
                    />
                )}

                {activeTab === 'Honors' && (
                    <div className="space-y-6">
                        {!rulesState.isPbaMode && (
                            <AwardsCatalogSection
                                leagueStats={startup ? rulesState.rules : undefined}
                                uiMode={startup ? 'fictional' : undefined}
                                onAwardSettingsChange={startup ? settings => rulesState.setRule('awardSettings', settings) : undefined}
                            />
                        )}
                        <LeagueHonorsSection 
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
                            fictional={startup}
                        />
                    </div>
                )}

                {activeTab === 'All-Star' && (
                    <AllStarTab rules={rulesState.rules} setRule={rulesState.setRule} />
                )}

                {activeTab === 'Game Rules' && (
                    <div className="space-y-8">
                        <GameRulesSettings rules={rulesState.rules} setRule={rulesState.setRule} />
                    </div>
                )}

                {activeTab === 'Economy' && (
                    <EconomyTab
                        startupSeasonYear={startup ? rulesState.rules.year : undefined}
                        uiMode={rulesState.uiMode}
                        draftType={rulesState.draftType}
                        currency={rulesState.currency}
                        setCurrency={rulesState.setCurrency}
                        tradesAllowed={rulesState.tradesAllowed}
                        setTradesAllowed={rulesState.setTradesAllowed}
                        pbaLocalEligibilityMode={rulesState.pbaLocalEligibilityMode}
                        setPbaLocalEligibilityMode={rulesState.setPbaLocalEligibilityMode}
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
                        tradeMatchingRatioUnder={rulesState.tradeMatchingRatioUnder}
                        setTradeMatchingRatioUnder={rulesState.setTradeMatchingRatioUnder}
                        tradeMatchingRatioOver1st={rulesState.tradeMatchingRatioOver1st}
                        setTradeMatchingRatioOver1st={rulesState.setTradeMatchingRatioOver1st}
                        tradeMatchingRatioOver2nd={rulesState.tradeMatchingRatioOver2nd}
                        setTradeMatchingRatioOver2nd={rulesState.setTradeMatchingRatioOver2nd}
                        restrictCashSendOver2ndApron={rulesState.restrictCashSendOver2ndApron}
                        setRestrictCashSendOver2ndApron={rulesState.setRestrictCashSendOver2ndApron}
                        restrictAggregationOver2ndApron={rulesState.restrictAggregationOver2ndApron}
                        setRestrictAggregationOver2ndApron={rulesState.setRestrictAggregationOver2ndApron}
                        restrictSignAndTradeAcquisitionOver1stApron={rulesState.restrictSignAndTradeAcquisitionOver1stApron}
                        setRestrictSignAndTradeAcquisitionOver1stApron={rulesState.setRestrictSignAndTradeAcquisitionOver1stApron}
                        freezePickAt2ndApron={rulesState.freezePickAt2ndApron}
                        setFreezePickAt2ndApron={rulesState.setFreezePickAt2ndApron}
                        restrictTPEProvenanceOver2ndApron={rulesState.restrictTPEProvenanceOver2ndApron}
                        setRestrictTPEProvenanceOver2ndApron={rulesState.setRestrictTPEProvenanceOver2ndApron}
                        postSigningMoratoriumEnabled={rulesState.postSigningMoratoriumEnabled}
                        setPostSigningMoratoriumEnabled={rulesState.setPostSigningMoratoriumEnabled}
                        twoWayContractsEnabled={rulesState.twoWayContractsEnabled}
                        setTwoWayContractsEnabled={rulesState.setTwoWayContractsEnabled}
                        developmentalContractsEnabled={rulesState.developmentalContractsEnabled}
                        setDevelopmentalContractsEnabled={rulesState.setDevelopmentalContractsEnabled}
                        maxDevelopmentalPlayersPerTeam={rulesState.maxDevelopmentalPlayersPerTeam}
                        setMaxDevelopmentalPlayersPerTeam={rulesState.setMaxDevelopmentalPlayersPerTeam}
                        developmentalMaxServiceYears={rulesState.developmentalMaxServiceYears}
                        setDevelopmentalMaxServiceYears={rulesState.setDevelopmentalMaxServiceYears}
                        developmentalMaxGames={rulesState.developmentalMaxGames}
                        setDevelopmentalMaxGames={rulesState.setDevelopmentalMaxGames}
                        developmentalWeeklyStipendUSD={rulesState.developmentalWeeklyStipendUSD}
                        setDevelopmentalWeeklyStipendUSD={rulesState.setDevelopmentalWeeklyStipendUSD}
                        developmentalActiveGameBonusUSD={rulesState.developmentalActiveGameBonusUSD}
                        setDevelopmentalActiveGameBonusUSD={rulesState.setDevelopmentalActiveGameBonusUSD}
                        nonGuaranteedContractsEnabled={rulesState.nonGuaranteedContractsEnabled ?? true}
                        setNonGuaranteedContractsEnabled={rulesState.setNonGuaranteedContractsEnabled}
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
                        supermaxMinYears={rulesState.supermaxMinYears}
                        setSupermaxMinYears={rulesState.setSupermaxMinYears}
                        rookieExtEnabled={rulesState.rookieExtEnabled}
                        setRookieExtEnabled={rulesState.setRookieExtEnabled}
                        rookieExtPct={rulesState.rookieExtPct}
                        setRookieExtPct={rulesState.setRookieExtPct}
                        rookieExtRosePct={rulesState.rookieExtRosePct}
                        setRookieExtRosePct={rulesState.setRookieExtRosePct}
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
                        r2ContractsNonGuaranteed={rulesState.r2ContractsNonGuaranteed}
                        setR2ContractsNonGuaranteed={rulesState.setR2ContractsNonGuaranteed}
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
                        stepienRuleEnabled={rulesState.stepienRuleEnabled}
                        setStepienRuleEnabled={rulesState.setStepienRuleEnabled}
                        tradeExceptionsEnabled={rulesState.tradeExceptionsEnabled}
                        setTradeExceptionsEnabled={rulesState.setTradeExceptionsEnabled}
                        disabledPlayerExceptionEnabled={rulesState.disabledPlayerExceptionEnabled}
                        setDisabledPlayerExceptionEnabled={rulesState.setDisabledPlayerExceptionEnabled}
                        rfaMatchingEnabled={rulesState.rfaMatchingEnabled}
                        setRfaMatchingEnabled={rulesState.setRfaMatchingEnabled}
                        rfaMatchWindowDays={rulesState.rfaMatchWindowDays}
                        setRfaMatchWindowDays={rulesState.setRfaMatchWindowDays}
                        rfaAutoDeclineOver2ndApron={rulesState.rfaAutoDeclineOver2ndApron}
                        setRfaAutoDeclineOver2ndApron={rulesState.setRfaAutoDeclineOver2ndApron}
                        deadMoneyEnabled={rulesState.deadMoneyEnabled}
                        setDeadMoneyEnabled={rulesState.setDeadMoneyEnabled}
                        ngGuaranteeDeadlineMonth={rulesState.ngGuaranteeDeadlineMonth}
                        setNgGuaranteeDeadlineMonth={rulesState.setNgGuaranteeDeadlineMonth}
                        ngGuaranteeDeadlineDay={rulesState.ngGuaranteeDeadlineDay}
                        setNgGuaranteeDeadlineDay={rulesState.setNgGuaranteeDeadlineDay}
                        stretchProvisionEnabled={rulesState.stretchProvisionEnabled}
                        setStretchProvisionEnabled={rulesState.setStretchProvisionEnabled}
                        stretchProvisionMultiplier={rulesState.stretchProvisionMultiplier}
                        setStretchProvisionMultiplier={rulesState.setStretchProvisionMultiplier}
                        stretchedDeadMoneyCapPct={rulesState.stretchedDeadMoneyCapPct}
                        setStretchedDeadMoneyCapPct={rulesState.setStretchedDeadMoneyCapPct}
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
