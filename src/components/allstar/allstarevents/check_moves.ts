import * as fs from 'fs';

const movesFile = fs.readFileSync('src/data/dunkMoves.ts', 'utf8');
const commFile = fs.readFileSync('src/data/dunkCommentary.ts', 'utf8');

const moveRegex = /id:\s*'([^']+)'/g;
let match;
const moves: string[] = [];
while ((match = moveRegex.exec(movesFile)) !== null) {
  moves.push(match[1]);
}

const pools = ['DUNK_REVEAL', 'DUNK_IN_AIR', 'DUNK_MADE', 'DUNK_MISS'];
pools.forEach(pool => {
  const poolStart = commFile.indexOf(`export const ${pool}`);
  if (poolStart !== -1) {
    const nextPoolStart = commFile.indexOf('export const', poolStart + 10);
    const poolContent = nextPoolStart !== -1 ? commFile.substring(poolStart, nextPoolStart) : commFile.substring(poolStart);
    moves.forEach(move => {
      if (!poolContent.includes(`${move}:`)) {
        console.log(`Missing ${move} in ${pool}`);
      }
    });
  } else {
    console.log(`Could not find ${pool}`);
  }
});
