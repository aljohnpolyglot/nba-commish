import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceRoot = path.resolve('C:/Users/user-MSI/Downloads/nba-store-data/playerfaces_regen_replacements');
const outputPath = path.resolve(repoRoot, 'src/data/regenPortraitPackManifest.ts');

const GROUPS = {
  BLACK: [
    'Afroamerican',
    'Afrocaribbean',
    'CentralAfrica',
    'EastAfrica',
    'HornOfAfrica',
    'SahelianAfrica',
    'SouthernAfrica',
    'WestAfrica',
  ],
  ASIAN: [
    'China',
    'CentralAsian',
    'Indonesia',
    'Japan',
    'Korea',
    'MainlandSEA',
    'Malaysia',
    'Mongolia',
    'Singapore',
    'SouthAsia',
    'Tajikistan',
    'Uzbekistan',
    'Vietnam',
  ],
  BROWN: [
    'ArabGulf',
    'Armenian',
    'Azerbaijan',
    'BrazilMixed',
    'Caucasus',
    'IndigenousSA',
    'Iran',
    'Israel',
    'Maghreb',
    'Mashriq',
    'Mestizo',
    'MixedRace',
    'NorthernSA',
    'PacificIslanders',
    'SouthConeSA',
  ],
  EURO: [
    'Albania',
    'AlbanianGreek',
    'Anglosphere',
    'Baltics',
    'CaucasianNA',
    'CentralEurope',
    'EastBalkan',
    'EastSlavic',
    'Finstonia',
    'France',
    'Hungary',
    'Iceland',
    'Ireland',
    'Italia',
    'Netherlands',
    'Poland',
    'Portugal',
    'Romania',
    'Scandinavian',
    'Spain',
    'Turkish',
    'WestBalkan',
    'WestSlavic',
  ],
  FILIPINO: ['Filipino'],
};

const listFiles = dir => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(abs));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      files.push(abs);
    }
  }
  return files;
};

const rel = abs => path.relative(sourceRoot, abs).replace(/\\/g, '/');

const collectGroup = folderNames => {
  const files = [];
  for (const folder of folderNames) {
    const folderPath = path.join(sourceRoot, folder);
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Missing portrait folder: ${folderPath}`);
    }
    files.push(...listFiles(folderPath).map(rel));
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
};

const formatArray = (name, values) => {
  const lines = values.map(value => `  '${value}',`);
  return `export const ${name} = [\n${lines.join('\n')}\n] as const;`;
};

const black = collectGroup(GROUPS.BLACK);
const asian = collectGroup(GROUPS.ASIAN);
const brown = collectGroup(GROUPS.BROWN);
const euro = collectGroup(GROUPS.EURO);
const filipino = collectGroup(GROUPS.FILIPINO);

const contents = `// AUTO-GENERATED from NG_Regens_MainPack + nba-store-data merge.
// Do not edit by hand. Re-run scripts/generate-regen-portrait-manifest.mjs.

export const REGEN_PORTRAIT_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/playerfaces_regen_replacements';
export const REGEN_FILIPINO_BASE = 'https://raw.githubusercontent.com/aljohnpolyglot/ng-regens-filipino/refs/heads/main';

${formatArray('REGEN_BLACK_PATHS', black)}

${formatArray('REGEN_ASIAN_PATHS', asian)}

${formatArray('REGEN_BROWN_PATHS', brown)}

${formatArray('REGEN_EURO_PATHS', euro)}

${formatArray('REGEN_FILIPINO_PATHS', filipino)}
`;

fs.writeFileSync(outputPath, contents, 'utf8');

console.log(`Wrote ${outputPath}`);
console.log(
  JSON.stringify(
    {
      black: black.length,
      asian: asian.length,
      brown: brown.length,
      euro: euro.length,
      filipino: filipino.length,
    },
    null,
    2,
  ),
);
