const normalizeKey = (value: unknown): string =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const isUsableLogoUrl = (value: unknown): value is string => {
  const url = String(value ?? '').trim();
  return !!url && !/footer_fb|blank|placeholder/i.test(url);
};

const PBA_PREFERRED_MARKS: Array<{ keys: string[]; url: string }> = [
  {
    keys: ['meralcobolts', 'meralco', 'bolts', 'mer'],
    url: 'https://statsspace01.sgp1.digitaloceanspaces.com/basketball_organizer/images/5rg0jlac21fve9xix02wncz1t1uy',
  },
  {
    keys: ['tnttropang5g', 'tnttropanggiga', 'tnt', 'tropang5g', 'tropanggiga'],
    url: 'https://statsspace01.sgp1.digitaloceanspaces.com/basketball_organizer/images/6a0o355pjdq3syfi83969r81dqp6',
  },
];

const PBA_LOCAL_MARKS: Array<{ keys: string[]; url: string }> = [
  {
    keys: ['barangayginebrasanmiguel', 'ginebra', 'bgsm'],
    url: '/img/jerseys/PBA/Barangay_Ginebra_San_Miguel/Kit_body_brgyginebrasm-2015_l.png',
  },
  {
    keys: ['sanmiguelbeermen', 'sanmiguel', 'smb'],
    url: '/img/jerseys/PBA/San_Miguel_Beermen/Kit_body_sanmiguel_l.png',
  },
  {
    keys: ['magnoliachickentimpladoshotshots', 'magnoliahotshots', 'magnolia', 'mag'],
    url: '/img/jerseys/PBA/Magnolia_Hotshots_Pambansang_Manok/Kit_body_thinbluesides.png',
  },
  {
    keys: ['rainorshineelastopainters', 'rainorshine', 'ros'],
    url: '/img/jerseys/PBA/Rain_or_Shine_Elasto_Painters/Kit_body_ROS-2014_l.png',
  },
  {
    keys: ['blackwaterbossing', 'blackwater', 'bossing', 'bwb', 'blb'],
    url: '/img/jerseys/PBA/Blackwater_Bossing/Kit_body_blackwater-2015_l.png',
  },
  {
    keys: ['titanultragiantrisers', 'northportbatangpier', 'northport', 'titanultra', 'tgr', 'tit'],
    url: '/img/jerseys/PBA/NorthPort_Batang_Pier/Kit_body_globalport-2014_l.png',
  },
];

export function getResolvedTeamLogoUrl(team: any): string {
  const keys = [
    team?.name,
    team?.region,
    team?.abbrev,
    `${team?.region ?? ''} ${team?.name ?? ''}`,
  ].map(normalizeKey).filter(Boolean);

  const isPbaTeam = team?.league === 'PBA' || team?.conference === 'PBA' || keys.some(key =>
    PBA_PREFERRED_MARKS.some(mark => mark.keys.includes(key) || mark.keys.some(alias => key.includes(alias))),
  );

  if (isPbaTeam) {
    const preferred = PBA_PREFERRED_MARKS.find(mark =>
      keys.some(key => mark.keys.includes(key) || mark.keys.some(alias => key.includes(alias))),
    );
    if (preferred) return preferred.url;
  }

  for (const value of [team?.logoUrl, team?.imgURL, team?.teamLogo, team?.teamLogoUrl, team?.imgURLSmall]) {
    if (isUsableLogoUrl(value)) return String(value).trim();
  }
  if (!isPbaTeam) return '';
  return PBA_LOCAL_MARKS.find(mark => keys.some(key => mark.keys.includes(key) || mark.keys.some(alias => key.includes(alias))))?.url ?? '';
}

export function getTeamPrimaryColor(team: any): string {
  return team?.colors?.[0] ?? team?.primaryColor ?? '#1e293b';
}
