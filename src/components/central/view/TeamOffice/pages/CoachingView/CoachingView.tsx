import React, { useState, useEffect, useMemo } from 'react';
import { Save, Check, ChevronLeft, ChevronRight, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Team, PlayerK2 } from '../types';
import { getCoachPhoto, getCoachBio, getNBA2KCoach, getTeamStaff, getCoachContract } from '../lib/staffService';
import type { CoachData } from '../lib/staffService';
import type { NBA2KCoachData, CoachContractData } from '../../../../../../services/staffService';
import type { CoachData as CoachBioData } from '../../../../../../services/staffService';
import { StarterService } from '../lib/starterService';
import { systemDescriptions } from '../lib/systemDescriptions';
import { PlayerPortrait } from '../../../../../shared/PlayerPortrait';
import { GameplanTab } from './GameplanTab';
import { IdealRotationTab } from './IdealRotationTab';
import { getMinutesDiff } from '../../../../../../store/gameplanStore';
import { getScoringOptions, saveScoringOptions } from '../../../../../../store/scoringOptionsStore';
import { getLockedStrategy, lockStrategy, unlockStrategy } from '../../../../../../store/coachStrategyLockStore';
import { getCoachSystem } from '../../../../../../store/coachSystemStore';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';

interface CoachingViewProps {
  team: any; // The processed team object from App.tsx
  allCoaches: CoachData[];
  staffData: any;
  onSaveSystem?: (teamId: string, systemName: string) => void;
}

const CourtSVG = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2762.11 441.29" className="w-full h-auto opacity-80">
    <defs>
      <style>{`
        .cls-1 { fill: #999999; }
        .cls-2 { fill: #999999; }
        .cls-3 { fill: #999999; }
        .cls-4 { fill: #999999; }
        .cls-5 { fill: #999999; }
        .cls-6 { fill: #999999; }
        .cls-7 { fill: #999999; }
        .cls-8 { fill: #999999; }
        .cls-9 { fill: #999999; }
        .cls-10 { fill: #999999; }
        .cls-11 { fill: #999999; }
        .cls-12 { fill: #999999; }
        .cls-13 { fill: #999999; }
        .cls-14 { fill: #999999; }
        .cls-15 { fill: #fff; }
        .cls-16 { fill: #fff; }
      `}</style>
    </defs>
    <g id="Floor">
      <path className="cls-15" d="M2882.71,593.43H121l-.39-1q10.06-6.06,20.13-12.13,56.88-34.11,113.77-68.22,46.42-27.81,92.9-55.55,50.26-30.13,100.46-60.37,49.83-29.88,99.75-59.64,47-28.2,94-56.49,47.28-28.35,94.61-56.59,58-34.71,115.87-69.54a12,12,0,0,1,6.6-1.6q220.48,0,441,0l751.94,0c27.66,0,55.33.43,83-.2,10-.22,18.19,2.52,26.53,7.62,31.91,19.52,64.12,38.53,96.19,57.79q50,30,100,60.16c31.07,18.62,62.27,37,93.33,55.69,33.22,19.94,66.32,40.09,99.54,60,39.79,23.9,79.7,47.59,119.47,71.52q96,57.78,192,115.73Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Three_Right" data-name="Three Right">
      <path className="cls-14" d="M2059.56,160.08h33.85c14.83,0,29.66.1,44.49-.07a18.35,18.35,0,0,1,10.28,2.8Q2217.45,205,2286.85,247q75.38,45.6,150.81,91.09c2.56,1.55,5.11,3.13,7.6,4.8.59.39,1.56.82,1.2,1.89s-1.32.86-2.09.91c-1.17.08-2.34,0-3.5,0q-56.49,0-113,0a16.17,16.17,0,0,1-9.82-2.81q-63.3-44.51-126.65-88.93-63.51-44.58-127-89.13c-1.75-1.23-3.44-2.55-5.16-3.83C2059.33,160.73,2059.44,160.4,2059.56,160.08Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Three_Elbow_Right" data-name="Three Elbow Right">
      <path className="cls-13" d="M1980.39,434.15c22-2.71,44-5.25,65.9-8.15,37.46-4.95,74.85-10.32,112-17.4,21.43-4.09,42.73-8.7,63.85-14.09,27.58-7,55.09-14.45,81-26.48,8.34-3.87,17.35-7.12,22.31-15.93,1.35-2.39,3.9-1.48,5.94-1.48,34.5-.06,69,.54,103.48-.32a67.09,67.09,0,0,1,39.23,10.85c35.63,22.38,71.84,43.84,107.82,65.66q49.5,30,99,60.07,68.72,41.58,137.48,83.09c6.12,3.7,12.25,7.39,18.34,11.14,1.65,1,3.52,1.87,4.64,4.22-2.05,1.49-4.39,1-6.54,1q-78.74.07-157.48.06-261.22,0-522.46.09a20.79,20.79,0,0,1-12.53-3.81q-43.14-30.18-86.32-60.28c-3.93-2.75-8.2-5-11.66-8.44-5.13-3.83-10.36-7.52-15.77-10.94l-.13-.18c-2.94-2.81-6.49-4.75-9.93-6.82l-.12-.09c-18.21-12.72-36.11-25.88-54.69-38.08-4.67-3.07-9-6.61-13.74-9.63l-.37.09-.25-.29a29.42,29.42,0,0,0-6.69-5.1c-1.38-.86-2.27-2.07-1.93-3.72.44-2.09,2.26-1.61,3.67-1.58,11.31.22,22.38-2.72,33.68-2.59A3.56,3.56,0,0,0,1980.39,434.15Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Three_Middle" data-name="Three Middle">
      <path className="cls-12" d="M885.45,585.49c2.57-3.68,6.24-5.39,9.37-7.58q61.66-43.32,123.47-86.43,34.53-24.17,69-48.5a11.28,11.28,0,0,1,7.87-2.07c24.73,1.67,49.44,3.66,74.17,5.4,36.53,2.57,73.1,4.26,109.66,6.13,24.62,1.26,49.26,1.93,73.9,2.58,69.46,1.85,138.93,2.23,208.41,1.67,47-.37,93.94-1.62,140.88-3.4,41.91-1.6,83.8-4,125.68-6.41,27.39-1.61,54.75-3.95,82.11-6.12,2.81-.22,4.8.82,6.86,2.26q69.21,48.59,138.45,97.16,29.2,20.48,58.48,40.85c1.09.76,2.12,1.61,3.16,2.44.61.49,1.54.86,1.14,1.9s-1.39.79-2.16.81c-2.5.07-5,0-7.5,0q-607.87,0-1215.76,0C890.35,586.23,888,586.62,885.45,585.49Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Three_Elbow_Left" data-name="Three Elbow Left">
      <path className="cls-11" d="M1066,439.17c-15.16,10.6-30,21-44.84,31.34Q972,504.7,922.83,538.8q-31.33,21.78-62.62,43.64a19.9,19.9,0,0,1-12,4q-175-.2-349.9-.1-164,0-327.91,0c-3.09,0-6.28.47-9.36-.8.76-2.63,2.9-3.45,4.68-4.53q54.86-33.21,109.73-66.34Q340.35,475.33,405.16,436l97.71-59.27q19.61-11.89,39.26-23.72a15.8,15.8,0,0,1,8.41-2.62q59.73.15,119.46,0c3.91,0,6.37.79,8.94,4.42,4.61,6.52,12.28,9.54,19.36,12.74,23.73,10.74,48.65,17.93,73.78,24.6,32.35,8.59,65,15.49,98,21,21.17,3.56,42.47,6.36,63.69,9.6,26.66,4.07,53.46,7,80.23,10.15,15.54,1.85,31.13,3.18,46.7,4.75C1062.34,437.85,1064.07,437.48,1066,439.17Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Three_Left" data-name="Three Left">
      <path className="cls-10" d="M556.4,344.29C566.67,338,576.56,332,586.48,326q50.13-30.4,100.27-60.8,54.64-33,109.34-66,30.75-18.58,61.43-37.29A10.2,10.2,0,0,1,863,160q40.23.09,80.46.05a11,11,0,0,1,1.88.57c-2.75,2-5,3.7-7.34,5.34q-46.12,32.43-92.25,64.83Q786.95,272.05,728,313.17q-20.85,14.59-41.61,29.32c-2.62,1.86-5.21,3.26-8.63,3.26q-58.47-.12-116.94-.06C559.59,345.69,558.19,346.11,556.4,344.29Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Mid_Right" data-name="Mid Right">
      <path className="cls-9" d="M2303.27,346.34,1956,285.85c1.93-3.19,4.73-4.33,6.94-6.08,6.72-5.31,12.74-11.24,16.89-18.8,8.84-16.08,5-30.87-4.93-44.86-10.36-14.65-24.48-25.25-39-35.39-8.86-6.21-18.16-11.74-27.55-17.11-1.34-.77-3.08-1.12-3.87-2.87,1.69-1.32,3.58-.63,5.29-.63q65.73-.08,131.48-.09a12.43,12.43,0,0,1,7.8,2.45q58,41.58,116.1,83L2298.72,341C2300.29,342.12,2302.1,343,2303.27,346.34Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Mid_Elbow_Right" data-name="Mid Elbow Right">
      <path className="cls-8" d="M2308.41,352.92c-7.27,6.67-15.64,10.32-24,13.8-31.18,12.93-63.75,21.23-96.51,28.88-33.73,7.89-67.86,13.62-102.09,18.87-45.43,7-91.07,12.2-136.74,17.19-5.62.62-11.28,1-16.9,1.61-2.4.27-4.18-.77-6-2L1802.5,345.13c-4.09-2.85-8.23-5.64-12.25-8.59-1.08-.79-3.19-1.19-2.54-3.13.56-1.67,2.47-1.37,3.88-1.62,13.93-2.46,27.91-4.65,41.78-7.36,35.16-6.86,70.13-14.8,102.84-29.75,10-4.57,19-4.1,28.81-2.33,22.44,4,44.91,7.91,67.37,11.85q47.71,8.39,95.42,16.75c25.43,4.4,50.9,8.55,76.33,13q51.39,8.94,102.75,18.14A7.78,7.78,0,0,1,2308.41,352.92Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Mid_Middle" data-name="Mid Middle">
      <path className="cls-7" d="M1903.68,435.94a4993.75,4993.75,0,0,1-803.55,0c-.16-.51-.32-1-.49-1.52,5.33-3.86,10.61-7.79,16-11.57q43.5-30.51,87.07-61c11.43-8,22.9-16,34.27-24.07a9.22,9.22,0,0,1,7-1.78q48.1,5.75,96.46,9c31.58,2.07,63.18,3.38,94.81,4.39,40.81,1.3,81.62,1.2,122.42.41q63.18-1.21,126.22-6.17c25.39-2,50.74-4.41,76-7.58a9.77,9.77,0,0,1,7.41,1.91q66.36,46.59,132.77,93.12C1901.5,432.11,1903.18,433,1903.68,435.94Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Mid_Elbow_Left" data-name="Mid Elbow Left">
      <path className="cls-6" d="M1218.19,333.57c-10.29,7.17-20.46,14.28-30.66,21.36Q1133,392.81,1078.6,430.74c-3.4,2.38-6.52,2.39-10.26,2.08-28.54-2.38-57-5.76-85.38-9.28-35.17-4.37-70.25-9.48-105.19-15.54-39.87-6.91-79.34-15.58-118.11-27.2-18.48-5.54-36.85-11.51-53.92-20.75-2.48-1.34-4.79-3-7.17-4.53-1-.62-2.27-1.27-2-2.57s1.88-1.12,3-1.31c15.24-2.67,30.49-5.29,45.73-8q48.91-8.58,97.83-17.19c27.06-4.73,54.13-9.37,81.18-14.08q57.3-10,114.58-20a36.44,36.44,0,0,0,3.95-.53c8.51-2.5,16.08-1.11,24.33,2.69,24.87,11.45,51.3,18.39,77.92,24.52,22.54,5.19,45.33,9.16,68.17,12.78C1214.84,332.1,1216.64,331.81,1218.19,333.57Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Mid_Left" data-name="Mid Left">
      <path className="cls-5" d="M1099.69,161.27c-10.64,6.11-21.26,12.26-31.34,19.27-13.13,9.13-25.85,18.8-36,31.34a68.1,68.1,0,0,0-9,14.29c-7.38,15.91-4.1,30.12,6.74,43.12a74.32,74.32,0,0,0,14.46,13c1.16.82,2.63,1.36,3.25,3.65L701.54,346.21c-.21-3.13,1.76-3.78,3.11-4.75q61.68-44.16,123.41-88.24c39.25-28.05,78.67-55.87,117.61-84.33a43.84,43.84,0,0,1,28.28-9c40.82.57,81.65.23,122.48.23h2.82Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Close_Right" data-name="Close Right">
      <path className="cls-4" d="M1708.21,161.19c2.11-1.76,4-1.05,5.7-1.05q85-.07,170-.09a17.25,17.25,0,0,1,9,2.21c21.68,12.18,42.67,25.28,60.16,43.27a60.11,60.11,0,0,1,12.75,18.35c6.45,15.24,2.84,28.63-8,40.47-11.73,12.79-26.62,20.87-42.23,27.76-34,15-70,23.45-106.32,30.31-9.33,1.76-18.71,3.19-28,4.94a7.85,7.85,0,0,1-6.51-1.38q-40.08-28-80.23-55.93c-1.31-.91-3.61-1.59-3.38-3.3.28-2.13,2.91-1.79,4.5-2.25,19-5.4,37.52-11.79,53.47-23.83,9.37-7.09,16.57-15.69,14.92-28.6-1.2-9.45-7.05-16.37-13.43-22.77-9.86-9.88-21.56-17.19-33.85-23.63C1713.92,164.25,1711.21,162.79,1708.21,161.19Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Close_Middle" data-name="Close Middle">
      <path className="cls-3" d="M1501.56,345.59c-37.81-.26-75.63-.73-113.39-2.64-42.22-2.14-84.42-4.94-126.37-10.44-3.13-.41-6.29-.64-9.42-1-1-.12-2.2-.11-2.56-1.2-.47-1.46,1-1.92,1.83-2.54q11.38-8.12,22.82-16.16,27.78-19.5,55.56-39a7.29,7.29,0,0,1,6-1.53c21.75,4.19,43.7,6.87,65.73,9.26,39.13,4.26,78.33,6.44,117.67,5.51a965.13,965.13,0,0,0,115.89-9.48c11.05-1.6,22.08-3.16,33-5.37a6.24,6.24,0,0,1,5.13,1.25q39,27.4,78,54.85c1.13.8,3.19,1.36,2.73,3.08s-2.51,1.4-3.91,1.54c-20,2.12-40,4.37-60.1,6.17-36.32,3.25-72.71,5.56-109.16,6.3-26.48.53-53,.1-79.45.1Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Close_Left" data-name="Close Left">
      <path className="cls-2" d="M1295.14,160.26c-8.73,5.94-17.94,10.58-26.38,16.52-10.27,7.24-20,15.09-25.85,26.53-5.49,10.68-3.67,21.47,4.54,30.42,9.72,10.58,22.23,16.76,35.2,22.08a210.87,210.87,0,0,0,27,9.05c1.22.32,3,.2,3.4,1.61s-1.35,2.1-2.39,2.82q-30.92,21.54-61.85,43c-6.28,4.38-12.61,8.69-18.79,13.21a9,9,0,0,1-7.37,1.83C1180,320.3,1137.77,312,1097.47,296c-18.45-7.35-36.21-16.05-50.35-30.65s-16-32.51-4.41-49.45c10.64-15.57,25.63-26.44,40.92-36.88a314.33,314.33,0,0,1,29.07-17.48,10.42,10.42,0,0,1,5.15-1.42q87.47.06,175,0C1293.58,160.1,1294.36,160.2,1295.14,160.26Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Under_the_Basket" data-name="Under the Basket">
      <path className="cls-1" d="M1501.78,160.19q90.49,0,181-.08a31.63,31.63,0,0,1,14.82,3.28c14.47,7.25,28.67,14.88,40.24,26.49a75.84,75.84,0,0,1,6.87,7.89c9.13,12,8.19,23.87-2.74,34.28-11.35,10.81-25.3,17.07-39.81,22.18-30.79,10.84-62.73,16.34-95,20.19-28.63,3.41-57.37,4.82-86.18,5.54a866.83,866.83,0,0,1-138.45-7.31c-30.7-4.17-61.08-10.18-90-22a110.65,110.65,0,0,1-25.61-14.33c-16.93-13-18.18-27.49-3.83-43.29,9.78-10.77,22.16-17.88,34.46-25.26,10.76-6.46,22-7.8,34.31-7.72C1388.47,160.39,1445.13,160.19,1501.78,160.19Z" transform="translate(-120.61 -152.14)"></path>
    </g>
    <g id="Ring">
      <path className="cls-16" d="M1593.06,167.77H1415.62a30.49,30.49,0,0,0-4.49.19,2.38,2.38,0,0,0-2,2.5c0,1.45.9,2.07,2.22,2.15s2.66,0,4,0c19.5,0,39,0,58.49,0,1.91,0,4.23-.92,6,1.46a60,60,0,0,0-6.13,2.72c-3.43,2-7.49,3.82-7.36,8.59s4.07,6.6,7.69,8.27c8.79,4,18.23,5.22,27.75,5.33,11.23.13,22.37-.9,32.55-6.2,8-4.18,8.11-10.29.34-15-2.45-1.47-5.13-2.58-7.71-3.85,0-.35.11-.7.16-1.05,2.2-.12,4.41-.34,6.61-.34,19.83,0,39.66,0,59.49,0,1.69,0,4.17.68,4.22-2.11S1595.12,167.77,1593.06,167.77Zm-61.47,17.76c0,4.77-13,8.64-28.95,8.64s-28.94-3.87-28.94-8.64,13-8.65,28.94-8.65S1531.59,180.75,1531.59,185.53Z" transform="translate(-120.61 -152.14)"></path>
    </g>
  </svg>
);

export default function CoachingView({ team, allCoaches, staffData, onSaveSystem }: CoachingViewProps) {
  // IMPORTANT: Do not change major things in this UI. 
  // The primary goal moving forward is just to connect the correct starter service, 
  // the correct rosters, and the game state to the game engine.
  // 
  // NOTE: This view is currently a visual representation of team strategy.
  // In the future, moving these sliders would affect the simulator knobs 
  // (pace, shot distribution, etc.) for this team in the game engine.
  // This doesn't do anything on my game yet, but once sliders are moved, 
  // it would affect my simulator knobs for that team.
  //
  // Additionally, when connecting the scoring options to simulator knobs,
  // it increases their shot diet or pts target, but reduces efficiency.
  // Note that these options still don't change overall team strength, 
  // just the tendencies and shot distribution.
  const [activeTab, setActiveTab] = useState<'GAMEPLAN' | 'IDEAL' | 'SYSTEM' | 'COACHING' | 'PREFERENCES' | 'STAFF'>('GAMEPLAN');
  const [starters, setStarters] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState(
    () => getCoachSystem(Number(team.tid))?.selectedSystem ?? team.bestSystem
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  // Guard against leaving the Gameplan tab while minutes don't sum to 240.
  // When triggered, the next-tab target is stashed so the modal's "Leave anyway"
  // button can proceed — otherwise users would have to remember what they were
  // going to open.
  const [pendingTab, setPendingTab] = useState<typeof activeTab | null>(null);
  const [pendingMinutesDiff, setPendingMinutesDiff] = useState(0);

  const requestTabChange = (next: typeof activeTab) => {
    if (activeTab === 'GAMEPLAN' && next !== 'GAMEPLAN') {
      const diff = getMinutesDiff(Number(team.tid));
      if (diff !== 0) {
        setPendingMinutesDiff(diff);
        setPendingTab(next);
        return;
      }
    }
    setActiveTab(next);
  };

  const usageSortedPlayers = useMemo(() => {
    if (!team || !team.roster) return [];
    return [...team.roster].sort((a, b) => {
      const getUsage = (p: any) => {
        if (!p.ratings || !p.ratings[0]) return 0;
        const r = p.ratings[0];
        const usageScore = (r.ins * 0.23 + r.dnk * 0.15 + r.fg * 0.15 + r.tp * 0.15 + r.spd * 0.08 + r.hgt * 0.08 + r.drb * 0.08 + r.oiq * 0.08);
        // Canonical OVR — matches PlayerRatingsView / NBA Central.
        const overall = getDisplayOverall(p);
        return (usageScore * 0.5) + (overall * 0.5);
      };
      return getUsage(b) - getUsage(a);
    });
  }, [team]);

  // Scoring options store internalIds (not indices) so edits survive roster
  // re-sorts, trades, and aren't dependent on baseline order. The store
  // scopes by saveId to prevent leaks between saves; see scoringOptionsStore.
  const baselineIds: string[] = useMemo(
    () => usageSortedPlayers.slice(0, 3).map((p: any) => String(p.internalId ?? p.pid)),
    [usageSortedPlayers]
  );
  const [scoringOptionIds, setScoringOptionIds] = useState<string[]>(baselineIds);

  // Strategy lock — snapshot of coachSliders that survives roster changes until
  // the user unlocks. Effective sliders fall back to live team.coachSliders
  // when no lock is set.
  const [lockTick, setLockTick] = useState(0);
  const lockedStrategy = useMemo(
    () => getLockedStrategy(Number(team.tid)),
    [team.tid, lockTick]
  );
  const effectiveSliders = lockedStrategy?.sliders ?? team.coachSliders;
  const toggleStrategyLock = () => {
    if (lockedStrategy) {
      unlockStrategy(Number(team.tid));
    } else {
      lockStrategy(Number(team.tid), team.coachSliders);
    }
    setLockTick(t => t + 1);
  };
  const updateLockedSlider = (key: string, value: number) => {
    // Only applies when locked — editing an unlocked slider is a no-op since
    // the underlying value is auto-computed from the roster.
    if (!lockedStrategy) return;
    lockStrategy(Number(team.tid), { ...lockedStrategy.sliders, [key]: value });
    setLockTick(t => t + 1);
  };

  useEffect(() => {
    // Unlocked → coach's auto-pick wins. Display top-3 baseline, never touch
    // the stored overrides so a future re-lock still has the user's saved picks.
    if (!lockedStrategy) {
      setScoringOptionIds(baselineIds);
      return;
    }

    // Locked → reconcile saved options against current roster. Any id not on
    // the team anymore (traded/cut/retired) is replaced with the next baseline
    // player not already selected. Runs on lock, team switch, or roster change.
    const rosterIds = new Set(usageSortedPlayers.map((p: any) => String(p.internalId ?? p.pid)));
    const saved = getScoringOptions(Number(team.tid));
    const source = saved && saved.optionIds.length === 3 ? saved.optionIds : baselineIds;
    const picked = new Set<string>();
    const backfillPool = baselineIds.filter(id => !source.includes(id));
    const reconciled = source.map(id => {
      if (rosterIds.has(id) && !picked.has(id)) {
        picked.add(id);
        return id;
      }
      while (backfillPool.length) {
        const next = backfillPool.shift()!;
        if (!picked.has(next) && rosterIds.has(next)) {
          picked.add(next);
          return next;
        }
      }
      return id;
    });

    setScoringOptionIds(reconciled);

    const changed = !saved || saved.optionIds.some((v, i) => v !== reconciled[i]);
    if (changed && reconciled.length === 3) {
      saveScoringOptions(Number(team.tid), reconciled);
    }
  }, [team.tid, baselineIds.join('|'), lockedStrategy]);

  const handleOptionChange = (optionIndex: number, direction: number) => {
    setScoringOptionIds(prev => {
      if (usageSortedPlayers.length === 0) return prev;
      const ids = usageSortedPlayers.map((p: any) => String(p.internalId ?? p.pid));
      const currentId = prev[optionIndex];
      let cursor = ids.indexOf(currentId);
      if (cursor < 0) cursor = optionIndex; // fallback if stored ID vanished

      const maxAttempts = ids.length;
      let attempts = 0;
      let nextId = currentId;
      do {
        cursor = (cursor + direction + ids.length) % ids.length;
        nextId = ids[cursor];
        attempts++;
      } while (
        attempts <= maxAttempts &&
        prev.some((other, idx) => idx !== optionIndex && other === nextId)
      );

      const next = [...prev];
      next[optionIndex] = nextId;
      saveScoringOptions(Number(team.tid), next);
      return next;
    });
  };

  const handleSystemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSystem = e.target.value;
    setSelectedSystem(newSystem);
    if (onSaveSystem) {
      // Auto-save when changing system
      onSaveSystem(team.tid, newSystem);
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setSelectedSystem(getCoachSystem(Number(team.tid))?.selectedSystem ?? team.bestSystem);
  }, [team.tid, team.bestSystem]);

  useEffect(() => {
    // We need to get the starters for this team.
    // team.top12 contains the top 12 players.
    // StarterService expects Player objects, but we have PlayerK2. They are compatible enough for getProjectedStarters.
    const projectedStarters = StarterService.getProjectedStarters(
      { tid: Number(team.tid), id: Number(team.tid) } as any,
      team.top12, 
      2026, 
      team.top12, 
      true
    );
    setStarters(projectedStarters);
  }, [team]);

  let coachName = "Unknown Coach";
  let coachImg = "https://via.placeholder.com/150";
  let coachBio: CoachBioData | undefined;
  let nba2kCoach: NBA2KCoachData | undefined;
  let coachContract: CoachContractData | undefined;

  if (staffData && staffData.coaches) {
    const teamCoach = staffData.coaches.find((c: any) => {
      const pos = (c.position || c.team || '').toLowerCase();
      return pos.includes(team.teamName.toLowerCase().split(' ').pop() || '');
    });
    if (teamCoach) {
      coachName = teamCoach.name;
      coachBio = getCoachBio(coachName);
      nba2kCoach = getNBA2KCoach(coachName);
      coachContract = getCoachContract(coachName);
      coachImg = getCoachPhoto(coachName) || teamCoach.playerPortraitUrl || nba2kCoach?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(teamCoach.name)}&background=1a1a2e&color=FDB927&size=512&bold=true`;
      
      if (!coachContract) {
        console.log(`No contract data found for coach: ${coachName}`);
      }
    }
  }

  // TODO: In-game, these contracts will be used for future coaching and staff updates.
  let contractDisplay = '-';
  if (coachContract && coachContract.history && coachContract.history.length > 0) {
    const currentContract = coachContract.history[0];
    if (currentContract.annual_salary) {
      const salaryM = (currentContract.annual_salary / 1000000).toFixed(1).replace('.0', '');
      contractDisplay = `$${salaryM}M until ${currentContract.end_year}`;
    } else {
      contractDisplay = `Until ${currentContract.end_year}`;
    }
  }

  const getBornDate = (bornStr?: string) => {
    if (!bornStr) return 'Unknown';
    // Match Month Day, Year OR Day Month Year
    // Then extract up to the 4-digit year and stop
    const match = bornStr.match(/(?:[a-zA-Z]+\s\d{1,2},?\s\d{4})|(?:\d{1,2}\s[a-zA-Z]+\s\d{4})/);
    return match ? match[0] : bornStr;
  };

  const calculateAge = (bornStr?: string) => {
    if (!bornStr) return null;
    // Extract year from string like "Sep 27, 1965" or "1965-09-27"
    const yearMatch = bornStr.match(/\d{4}/);
    if (!yearMatch) return null;
    const birthYear = parseInt(yearMatch[0]);
    // TODO: replace this entirely with logic once imported from game (season or game date-x)
    // but for now, just use 2026 - born year
    return 2026 - birthYear;
  };

  const nationality = nba2kCoach?.nationality || coachBio?.nationality || 'Unknown';
  
  let coachingCareer = nba2kCoach?.coaching_career;
  if (!coachingCareer || coachingCareer === 'Unknown') {
    if (coachBio?.startSeason) {
      const startYear = coachBio.startSeason.split('-')[0];
      // Using 2026 as current season for now
      coachingCareer = `${startYear}-present`;
    } else {
      coachingCareer = 'Unknown';
    }
  }

  let born = getBornDate(nba2kCoach?.born);
  if (!born || born === 'Unknown') {
    born = coachBio?.birthDate || 'Unknown';
  }

  const formatName = (name: string) => {
    if (!name) return 'Unknown';
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
  };

  const renderStars = (score: number) => {
    // 50 = 0 stars, 55 = 0.5 stars, 60 = 1 star, ..., 100 = 5 stars
    const stars = Math.max(0, Math.min(5, (score - 50) / 10));
    const starElements = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= stars) {
        starElements.push(<span key={i} className="text-yellow-400 text-2xl md:text-3xl">★</span>);
      } else if (i - 0.5 <= stars) {
        // Half star representation
        starElements.push(
          <span key={i} className="relative text-gray-600 text-2xl md:text-3xl">
            ★
            <span className="absolute left-0 top-0 overflow-hidden text-yellow-400" style={{ width: '50%' }}>★</span>
          </span>
        );
      } else {
        starElements.push(<span key={i} className="text-gray-600 text-2xl md:text-3xl">★</span>);
      }
    }
    return starElements;
  };

  // Helper to get position label based on index
  const getPosLabel = (idx: number) => {
    const posMap = ['PG', 'SG', 'SF', 'PF', 'C'];
    return posMap[idx] || 'RES';
  };

  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Helper to position players on the court
  const getCourtPosition = (idx: number) => {
    const positions = isMobile ? [
      { bottom: '10%', left: '50%', transform: 'translate(-50%, 0)' }, // PG
      { top: '45%', left: '2%', transform: 'translate(0, 0)' }, // SG
      { top: '45%', right: '2%', transform: 'translate(0, 0)' }, // SF
      { top: '15%', left: '25%', transform: 'translate(-50%, 0)' }, // PF
      { top: '15%', right: '25%', transform: 'translate(50%, 0)' }, // C
    ] : [
      { bottom: '10%', left: '50%', transform: 'translate(-50%, 0)' }, // PG
      { top: '45%', left: '5%', transform: 'translate(0, 0)' }, // SG
      { top: '45%', right: '5%', transform: 'translate(0, 0)' }, // SF
      { top: '15%', left: '30%', transform: 'translate(-50%, 0)' }, // PF
      { top: '15%', right: '30%', transform: 'translate(50%, 0)' }, // C
    ];
    return positions[idx] || {};
  };

  return (
    <div className="bg-[#1a1a1a] text-white p-3 md:p-6 rounded-lg shadow-xl max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
      {/* Left Sidebar */}
      <div className="w-full lg:w-1/3 bg-[#222] rounded-lg overflow-hidden border border-gray-700 flex flex-col">
        {/* Coach Image */}
        <div className="h-[450px] md:h-[550px] bg-gray-800 relative flex-shrink-0">
          <img
            src={coachImg}
            alt={coachName}
            className="w-full h-full object-cover object-top"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              const fallbacks = [
                getCoachPhoto(coachName),
                nba2kCoach?.image,
                coachBio?.img,
                `https://ui-avatars.com/api/?name=${encodeURIComponent(coachName)}&background=1a1a2e&color=FDB927&size=512&bold=true&font-size=0.4`,
              ].filter(Boolean) as string[];
              const next = fallbacks.find(u => u && u !== target.src);
              if (next) target.src = next;
            }}
          />
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black via-black/90 to-transparent p-4 pt-20">
            <h2 className="text-xl md:text-2xl font-bold uppercase mb-0.5">{coachName}</h2>
            <div className="text-[10px] md:text-xs text-yellow-500 font-bold uppercase mb-4">{nba2kCoach?.position || 'Head Coach'}</div>
            
            <div className="flex flex-col gap-1.5 text-xs md:text-sm text-gray-300">
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">Years with team:</span>
                <span className="font-bold text-white">{coachBio?.yearsInRole ?? '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">Contract Exp:</span>
                <span className="font-bold text-white">{contractDisplay}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">Coaching Career:</span>
                <span className="font-bold text-white">{coachingCareer}</span>
              </div>
              {nba2kCoach?.playing_career && (
                <div className="flex justify-between items-center">
                  <span className="uppercase text-[10px] text-gray-500">Playing Career:</span>
                  <span className="font-bold text-white">{nba2kCoach.playing_career}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">Age:</span>
                <span className="font-bold text-white">{nba2kCoach?.age || calculateAge(born) || '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">Born:</span>
                <span className="font-bold text-white">{born}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-gray-500">Nationality:</span>
                <span className="font-bold text-white">{nationality}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 flex-grow bg-[#1a1a1a]">
          <h3 className="text-gray-400 text-[10px] font-bold mb-4 uppercase tracking-wider border-b border-gray-800 pb-1">Coach Systems</h3>
          
          <div className="mb-4">
            <div className="text-xs text-gray-400 uppercase">Active System:</div>
            <div className={`font-bold text-lg ${selectedSystem !== team.bestSystem ? 'text-amber-400' : 'text-yellow-500'}`}>
              {toTitleCase(selectedSystem)}
            </div>
            {selectedSystem !== team.bestSystem && (
              <div className="text-[10px] text-amber-500 mt-0.5">Not best fit — affects performance</div>
            )}
          </div>

          <div>
            <div className="text-xs text-gray-400 uppercase">Best Fit System:</div>
            <div className="text-yellow-500 font-bold text-lg">{toTitleCase(team.bestSystem)}</div>
          </div>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="w-full lg:w-2/3 flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
          <button
            className={`px-4 md:px-6 py-2 font-bold uppercase text-xs md:text-sm flex-shrink-0 ${activeTab === 'GAMEPLAN' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => requestTabChange('GAMEPLAN')}
          >
            Gameplan
          </button>
          <button
            className={`px-4 md:px-6 py-2 font-bold uppercase text-xs md:text-sm flex-shrink-0 ${activeTab === 'IDEAL' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => requestTabChange('IDEAL')}
            title="Full-strength rotation — the one you'll actually tweak. The game-day rotation derives from this minus injuries."
          >
            Ideal
          </button>
          <button
            className={`px-4 md:px-6 py-2 font-bold uppercase text-xs md:text-sm flex-shrink-0 ${activeTab === 'SYSTEM' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => requestTabChange('SYSTEM')}
          >
            System
          </button>
          <button 
            className={`px-4 md:px-6 py-2 font-bold uppercase text-xs md:text-sm flex-shrink-0 ${activeTab === 'COACHING' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => requestTabChange('COACHING')}
          >
            Strategy
          </button>
          <button 
            className={`px-4 md:px-6 py-2 font-bold uppercase text-xs md:text-sm flex-shrink-0 ${activeTab === 'PREFERENCES' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => requestTabChange('PREFERENCES')}
          >
            Preferences
          </button>
          <button 
            className={`px-4 md:px-6 py-2 font-bold uppercase text-xs md:text-sm flex-shrink-0 ${activeTab === 'STAFF' ? 'text-white border-b-2 border-white' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => requestTabChange('STAFF')}
          >
            Staff
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-grow bg-[#222] rounded-lg border border-gray-700 p-3 md:p-4">
          {activeTab === 'IDEAL' && (
            <IdealRotationTab teamId={Number(team.tid)} />
          )}
          {activeTab === 'GAMEPLAN' && (
            <GameplanTab teamId={Number(team.tid)} />
          )}
          {activeTab === 'SYSTEM' && (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <select 
                    className="bg-[#1a1a1a] border border-gray-700 text-white font-bold text-lg md:text-xl py-1 px-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 scrollbar-hide"
                    value={selectedSystem}
                    onChange={handleSystemChange}
                  >
                    {[...team.sortedProfs].sort((a, b) => a[0].localeCompare(b[0])).map(([name]) => (
                      <option key={name} value={name}>{toTitleCase(name)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] md:text-xs text-gray-400 uppercase">Active:</span>
                  <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                </div>
              </div>
              
              <div className="flex flex-col xl:flex-row gap-6 flex-grow">
                {/* Court Area Container */}
                <div className="w-full xl:w-2/3 flex flex-col gap-4">
                  {/* Court Area */}
                  <div className="relative border-2 border-gray-600 rounded-sm bg-[#1a1a1a] p-4 flex flex-col justify-center items-center min-h-[350px] md:min-h-[400px] overflow-hidden">
                    {/* Court Markings */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-50">
                      <CourtSVG />
                    </div>
                    
                    {/* Starter Nodes */}
                    <div className="absolute inset-0">
                      {/* TODO: remove injured players from here once in game */}
                      {starters.map((starter, idx) => (
                        <div key={idx} className="absolute flex flex-col items-center z-10" style={getCourtPosition(idx)}>
                          <div className="relative">
                            <PlayerPortrait
                              imgUrl={starter.imgURL}
                              face={(starter as any).face}
                              playerName={starter.name}
                              teamLogoUrl={team.imgURL}
                              overallRating={starter.overallRating}
                              ratings={starter.ratings}
                              size={isMobile ? 44 : 56}
                            />
                          </div>
                          <div className="text-[10px] md:text-xs font-bold bg-black bg-opacity-70 px-1.5 md:px-2 py-0.5 rounded whitespace-nowrap mt-1">
                            {formatName(starter.name || `${(starter as any).firstName} ${(starter as any).lastName}`)} | {starter.pos || getPosLabel(idx)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Proficiency Area */}
                  <div className="text-center w-full p-4 border border-gray-700 rounded-sm bg-[#1a1a1a] z-10">
                    <div className="text-xs md:text-sm font-bold uppercase mb-2">Overall System Proficiency</div>
                    <div className="flex justify-center gap-1">
                      {renderStars(team.sortedProfs.find(([name]) => name === selectedSystem)?.[1] || 0)}
                    </div>
                  </div>
                </div>
                
                {/* Description Area */}
                <div className="w-full xl:w-1/3 flex flex-col">
                  <h4 className="font-bold text-base md:text-lg mb-2">Description</h4>
                  <p className="text-xs md:text-sm text-gray-400 mb-6">
                    {systemDescriptions[selectedSystem]?.desc || 'Description not available.'}
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
                    <div>
                      <h5 className="text-yellow-500 font-bold text-[10px] md:text-sm mb-2 uppercase">Positives</h5>
                      <ul className="list-disc list-inside text-xs md:text-sm text-gray-300 mb-4 xl:mb-6 space-y-1">
                        {systemDescriptions[selectedSystem]?.pos.map((pos, idx) => (
                          <li key={idx}>{pos}</li>
                        )) || <li>Not available</li>}
                      </ul>
                    </div>
                    
                    <div>
                      <h5 className="text-yellow-500 font-bold text-[10px] md:text-sm mb-2 uppercase">Negatives</h5>
                      <ul className="list-disc list-inside text-xs md:text-sm text-gray-300 space-y-1">
                        {systemDescriptions[selectedSystem]?.neg.map((neg, idx) => (
                          <li key={idx}>{neg}</li>
                        )) || <li>Not available</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'COACHING' && (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm">Tactics</h4>
                <button
                  onClick={toggleStrategyLock}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] md:text-xs font-bold uppercase transition-colors ${
                    lockedStrategy
                      ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                  title={lockedStrategy ? 'Strategy locked — roster changes won\'t shift sliders' : 'Lock strategy against roster/injury changes'}
                >
                  {lockedStrategy ? <Lock size={12} /> : <Unlock size={12} />}
                  {lockedStrategy ? 'Locked' : 'Lock'}
                </button>
              </div>
              {[
                { label: 'Tempo', key: 'tempo' },
                { label: 'Defensive Pressure', key: 'defensivePressure' },
                { label: 'Help Defense', key: 'helpDefense' },
                { label: 'Fast Break', key: 'fastBreak' },
                { label: 'Crash Offensive Glass', key: 'crashOffensiveGlass' },
                { label: 'Run Plays Frequency', key: 'runPlays' },
                { label: 'Early Offense', key: 'earlyOffense' },
                { label: 'Double Team', key: 'doubleTeam' },
                { label: 'Zone Usage Frequency', key: 'zoneUsage' },
              ].map((slider, idx) => (
                <div key={slider.key} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${idx % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'}`}>
                  <span className="text-xs md:text-sm font-bold">{slider.label}</span>
                  <div className="flex items-center gap-4 w-full sm:w-1/2">
                    <span className="text-yellow-500 font-bold w-8 text-right text-xs md:text-sm">{effectiveSliders[slider.key]}</span>
                    <input
                      type="range" min="0" max="100"
                      value={effectiveSliders[slider.key]}
                      readOnly={!lockedStrategy}
                      disabled={!lockedStrategy}
                      onChange={(e) => updateLockedSlider(slider.key, Number(e.target.value))}
                      className={`w-full accent-yellow-500 ${lockedStrategy ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                    />
                  </div>
                </div>
              ))}

              <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm mt-6 mb-2">Shot Distribution</h4>
              {[
                { label: 'Shot Inside', key: 'shotInside' },
                { label: 'Shot Close', key: 'shotClose' },
                { label: 'Shot Medium', key: 'shotMedium' },
                { label: 'Shot 3PT', key: 'shot3pt' },
                { label: 'Attack Basket', key: 'attackBasket' },
                { label: 'Post Plays', key: 'postPlayers' },
              ].map((slider, idx) => (
                <div key={slider.key} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${idx % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'}`}>
                  <span className="text-xs md:text-sm font-bold">{slider.label}</span>
                  <div className="flex items-center gap-4 w-full sm:w-1/2">
                    <span className="text-yellow-500 font-bold w-8 text-right text-xs md:text-sm">{effectiveSliders[slider.key]}</span>
                    <input
                      type="range" min="0" max="100"
                      value={effectiveSliders[slider.key]}
                      readOnly={!lockedStrategy}
                      disabled={!lockedStrategy}
                      onChange={(e) => updateLockedSlider(slider.key, Number(e.target.value))}
                      className={`w-full accent-yellow-500 ${lockedStrategy ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'PREFERENCES' && (
            <div className="space-y-4">
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={toggleStrategyLock}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] md:text-xs font-bold uppercase transition-colors ${
                    lockedStrategy
                      ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                  title={lockedStrategy ? 'Strategy locked — roster changes won\'t shift sliders' : 'Lock strategy against roster/injury changes'}
                >
                  {lockedStrategy ? <Lock size={12} /> : <Unlock size={12} />}
                  {lockedStrategy ? 'Locked' : 'Lock'}
                </button>
              </div>
              <div className="mb-6">
                <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm mb-2">Scoring Options</h4>
                {['FIRST OPTION', 'SECOND OPTION', 'THIRD OPTION'].map((label, idx) => {
                  const id = scoringOptionIds[idx];
                  const player = usageSortedPlayers.find(
                    (p: any) => String(p.internalId ?? p.pid) === id
                  );
                  return (
                    <div key={label} className="flex justify-between items-center bg-[#1a1a1a] p-2 rounded mb-2 border border-gray-800">
                      <span className="text-xs md:text-sm font-bold w-32">{label}</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleOptionChange(idx, -1)}
                          disabled={!lockedStrategy}
                          className={`transition-colors p-1 ${lockedStrategy ? 'text-gray-400 hover:text-white' : 'text-gray-700 cursor-not-allowed'}`}
                          title={lockedStrategy ? 'Previous option' : 'Lock strategy to edit scoring options'}
                        ><ChevronLeft size={16} /></button>
                        <span className="text-yellow-500 font-bold text-sm w-40 text-center truncate">
                          {player ? formatName(player.name || `${player.firstName} ${player.lastName}`) : '-'}
                        </span>
                        <button
                          onClick={() => handleOptionChange(idx, 1)}
                          disabled={!lockedStrategy}
                          className={`transition-colors p-1 ${lockedStrategy ? 'text-gray-400 hover:text-white' : 'text-gray-700 cursor-not-allowed'}`}
                          title={lockedStrategy ? 'Next option' : 'Lock strategy to edit scoring options'}
                        ><ChevronRight size={16} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Note: These sliders are currently read-only in the UI. 
                  Once moved, they would affect the simulator knobs for this team. */}
              {[
                { label: 'Bench Depth', key: 'benchDepth' },
                { label: 'Offense / Defense', key: 'prefOffDef' },
                { label: 'Inside / Outside', key: 'prefInOut' },
                { label: 'Size / Speed', key: 'prefSizeSpeed' },
                { label: 'Athleticism / Skill', key: 'prefAthleticSkill' },
              ].map((slider, idx) => (
                <div key={slider.key} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${idx % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'}`}>
                  <span className="text-xs md:text-sm font-bold">{slider.label}</span>
                  <div className="flex items-center gap-4 w-full sm:w-1/2">
                    <span className="text-yellow-500 font-bold w-8 text-right text-xs md:text-sm">{effectiveSliders[slider.key]}</span>
                    <input
                      type="range" min="0" max="100"
                      value={effectiveSliders[slider.key]}
                      readOnly={!lockedStrategy}
                      disabled={!lockedStrategy}
                      onChange={(e) => updateLockedSlider(slider.key, Number(e.target.value))}
                      className={`w-full accent-yellow-500 ${lockedStrategy ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                    />
                  </div>
                </div>
              ))}

              <h4 className="font-bold text-yellow-500 uppercase text-[10px] md:text-sm mt-6 mb-2">Play Through Injuries</h4>
              {([
                { label: 'Regular Season', key: 'ptiRegular', defaultVal: 0 },
                { label: 'Playoffs', key: 'ptiPlayoffs', defaultVal: 40 },
              ] as { label: string; key: 'ptiRegular' | 'ptiPlayoffs'; defaultVal: number }[]).map((slider, idx) => {
                const val: number = (effectiveSliders as any)[slider.key] ?? slider.defaultVal;
                const ptiLevel = Math.round((val / 100) * 4);
                const ptiDesc = ['Healthy only', 'Day-to-day (1–3 games)', 'Moderate (4–7 games)', 'Significant (8–14 games)', 'Major (15+ games)'][ptiLevel];
                return (
                  <div key={slider.key} className={`flex flex-col gap-1 ${idx % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <span className="text-xs md:text-sm font-bold">{slider.label}</span>
                      <div className="flex items-center gap-4 w-full sm:w-1/2">
                        <span className="text-yellow-500 font-bold w-8 text-right text-xs md:text-sm">{val}</span>
                        <input
                          type="range" min="0" max="100"
                          value={val}
                          readOnly={!lockedStrategy}
                          disabled={!lockedStrategy}
                          onChange={(e) => updateLockedSlider(slider.key, Number(e.target.value))}
                          className={`w-full accent-yellow-500 ${lockedStrategy ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 px-2 sm:pl-[calc(50%+1rem)]">{ptiDesc}</div>
                  </div>
                );
              })}
            </div>
          )}
          {activeTab === 'STAFF' && (
            <div className="flex flex-col h-full overflow-y-auto max-h-[500px] pr-2 scrollbar-hide">
              <h3 className="text-xl font-bold uppercase mb-4 text-yellow-500">Other Staff</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {getTeamStaff(team.teamName).filter(s => s.name !== coachName).map((staff, idx) => (
                  <div key={idx} className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 flex gap-4 items-center">
                    <img
                      src={staff.image || getCoachPhoto(staff.name) || `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.name)}&background=1a1a2e&color=FDB927&size=128`}
                      alt={staff.name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-gray-600 flex-shrink-0"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        const nba2k = getNBA2KCoach(staff.name);
                        const fallbacks = [
                          getCoachPhoto(staff.name),
                          nba2k?.image,
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.name)}&background=1a1a2e&color=FDB927&size=128`,
                        ].filter(Boolean) as string[];
                        const next = fallbacks.find(u => u && u !== img.src);
                        if (next) img.src = next;
                      }}
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-lg leading-tight">{staff.name}</span>
                      <span className="text-sm text-yellow-500 mb-1">{staff.position}</span>
                      <span className="text-xs text-gray-400 line-clamp-2" title={staff.coaching_career || staff.playing_career || ''}>
                        {staff.coaching_career || staff.playing_career || 'Career info unavailable'}
                      </span>
                    </div>
                  </div>
                ))}
                {getTeamStaff(team.teamName).filter(s => s.name !== coachName).length === 0 && (
                  <div className="col-span-full text-gray-400 text-sm italic">No other staff information available.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unbalanced-minutes guard — stops the user from leaving GAMEPLAN with a
          broken rotation. Shows the signed diff, offers two escape hatches:
          "Keep editing" (stay) and "Leave anyway" (go through to pendingTab). */}
      {pendingTab && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1a1a1a] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="font-black uppercase tracking-widest text-amber-300 text-sm">
                  Rotation Not Finished
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Gameplan minutes don't total 240.
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-300 mb-5 leading-relaxed">
              Your rotation is currently{' '}
              <span className={`font-black ${pendingMinutesDiff > 0 ? 'text-amber-300' : 'text-rose-300'}`}>
                {pendingMinutesDiff > 0 ? `${pendingMinutesDiff} min under` : `${Math.abs(pendingMinutesDiff)} min over`}
              </span>{' '}
              the 48-minute team budget. Finish distributing minutes before switching tabs so next game's rotation isn't broken.
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                onClick={() => { setPendingTab(null); setPendingMinutesDiff(0); }}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs tracking-widest"
              >
                Keep Editing
              </button>
              <button
                onClick={() => {
                  const next = pendingTab;
                  setPendingTab(null);
                  setPendingMinutesDiff(0);
                  if (next) setActiveTab(next);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase text-xs tracking-widest"
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
