/**
 * gameImageGenerator.ts
 *
 * Generates AI game action photos via Together AI worker.
 * - One image per game per day (cached, shared across all posts)
 * - Uses player face URL + jersey number for likeness reference
 * - Specialized prompts for action types (dunk, three, layup, etc.)
 * - Falls back gracefully if generation fails
 */

import type { NBATeam } from '../../types';

// ─── Config ───────────────────────────────────────────────────────────────────

const TOGETHER_WORKER_URL = 'https://nba-chat-worker.mogatas-princealjohn-05082003.workers.dev/image';
const IMAGE_MODEL = 'google/gemini-3-pro-image';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameImageRequest {
    playerName: string;
    playerFaceUrl?: string;       // NBA CDN headshot URL
    jerseyNumber?: string | number;
    teamName: string;
    teamColors?: string[];        // hex colors e.g. ['#1d428a', '#ffc72c']
    homeTeam: NBATeam;
    awayTeam: NBATeam;
    actionHint?: string;          // templateId or category hint
    gameKey: string;              // cache key
}

export interface GeneratedGameImage {
    url: string;                  // base64 data URL or CDN URL
    playerName: string;
    gameKey: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/** gameKey → generated image URL */
const imageCache = new Map<string, string>();

/** gameKey → in-flight promise (prevents duplicate generations) */
const pendingGenerations = new Map<string, Promise<string | null>>();

// ─── Action prompt builder ────────────────────────────────────────────────────

function buildActionPrompt(req: GameImageRequest): string {
    const { playerName, jerseyNumber, teamName, teamColors, actionHint, homeTeam, awayTeam } = req;
    const hint = (actionHint || '').toLowerCase();
    const jersey = jerseyNumber ? `#${jerseyNumber}` : '';
    const primaryColor = teamColors?.[0] || '#1d428a';
    const arenaMatchup = `${awayTeam.name} at ${homeTeam.name}`;

    // ── Action type from hint ──────────────────────────────────────────────
    let actionDesc: string;
    let cameraAngle: string;

    if (hint.includes('buzzer') || hint.includes('game_winner') || hint.includes('walkoff')) {
        actionDesc = `hitting a game-winning shot, ball leaving fingertips, arm extended in follow-through, crowd erupting behind them`;
        cameraAngle = `low angle, wide lens, shot from behind the basket looking up`;
    } else if (hint.includes('dunk') || hint.includes('fifty') || hint.includes('feat')) {
        actionDesc = `mid-dunk, both hands on the rim, body fully extended above the basket`;
        cameraAngle = `low angle, shot from court level looking up at the rim`;
    } else if (hint.includes('triple') || hint.includes('5x5') || hint.includes('double')) {
        actionDesc = `driving to the basket, one hand extended for a layup`;
        cameraAngle = `side angle, shallow depth of field, defender blurred in background`;
    } else if (hint.includes('three') || hint.includes('perfect')) {
        actionDesc = `shooting a three-pointer, perfect form, feet set, elbow in, wrist snapped`;
        cameraAngle = `medium distance, slightly elevated, crowd visible behind`;
    } else if (hint.includes('blowout')) {
        actionDesc = `celebrating with teammates, fist pump, team jersey visible`;
        cameraAngle = `eye level, candid moment`;
    } else {
        actionDesc = `dribbling in isolation, attacking off the dribble toward the basket`;
        cameraAngle = `medium shot, eye level, arena court background`;
    }

    return `A professional sports photograph of NBA player ${playerName} wearing ${teamName} jersey ${jersey} (${primaryColor} colored uniform). The player is ${actionDesc}. ${cameraAngle}. Shot during an NBA game, ${arenaMatchup} matchup. Packed arena crowd in background, professional NBA arena lighting, sharp focus on player, photorealistic, 8K quality, cinematic sports photography style. No text overlays.

CRITICAL INSTRUCTIONS:
1. SOLO SHOT: This is a SOLO portrait of ${playerName} ONLY. There must be NO OTHER PLAYERS with visible or recognizable faces anywhere in the frame. Any defenders or background players must be completely blurred, out of focus, or cropped out entirely. If another player's face is visible, the image is wrong.
2. LIKENESS: The player must match ${playerName}'s face from the reference headshot exactly — skin tone, facial features, hair. Do not invent a generic face.
3. JERSEY: The jersey number must be ${jersey} in ${primaryColor} colored ${teamName} uniform. This is non-negotiable.
4. REALISM: This must look like a real NBA game photograph, not CGI or illustration.`;
}

// ─── Main generator ────────────────────────────────────────────────────────────

export async function generateGamePhoto(req: GameImageRequest): Promise<string | null> {
    // Already cached
    if (imageCache.has(req.gameKey)) {
        console.log(`[GameImageGen] Cache hit for ${req.gameKey}`);
        return imageCache.get(req.gameKey)!;
    }

    // Already generating
    if (pendingGenerations.has(req.gameKey)) {
        console.log(`[GameImageGen] Already generating for ${req.gameKey}, waiting...`);
        return pendingGenerations.get(req.gameKey)!;
    }

    const promise = (async (): Promise<string | null> => {
        try {
            console.log(`[GameImageGen] Generating photo for "${req.playerName}" (${req.gameKey})`);
            console.log(`[GameImageGen] Action hint: "${req.actionHint || 'generic'}"`);

            const prompt = buildActionPrompt(req);
            console.log(`[GameImageGen] Prompt: "${prompt.slice(0, 120)}..."`);

            const response = await fetch(TOGETHER_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: IMAGE_MODEL,
                    prompt: buildActionPrompt(req),
                    width: 1024,
                    height: 768,
                    steps: 4,
                    n: 1,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Together AI image gen failed: ${response.status} ${JSON.stringify(err)}`);
            }

            const data = await response.json();
            const imageUrl = data?.data?.[0]?.url;
            if (!imageUrl) {
                console.warn('[GameImageGen] Response:', JSON.stringify(data).slice(0, 200));
                throw new Error('No image in response');
            }

            imageCache.set(req.gameKey, imageUrl);
            console.log(`[GameImageGen] ✅ Generated and cached image for ${req.gameKey}`);
            return imageUrl;

        } catch (err) {
            console.warn(`[GameImageGen] Generation failed for ${req.gameKey}:`, err);
            return null;
        } finally {
            pendingGenerations.delete(req.gameKey);
        }
    })();

    pendingGenerations.set(req.gameKey, promise);
    return promise;
}

/** Clear image cache (call between simulation days to respect 1-image-per-day limit) */
export function clearGameImageCache(): void {
    imageCache.clear();
    console.log('[GameImageGen] Cache cleared for new simulation day');
}

/** Check if a game already has a generated image */
export function hasGeneratedImage(gameKey: string): boolean {
    return imageCache.has(gameKey);
}
