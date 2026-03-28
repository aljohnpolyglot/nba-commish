export type PlayerImageMap = Record<string, string>;

// The Gist URL for Player Images
const PLAYER_IMAGES_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/daa76f3421f5b5b965a5d7ac263b9d80/raw/b3d8b85d5d4f122aab987a63a83eb35542972349/statmuse_avatars";

/**
 * These are exported so index.ts doesn't break.
 */
export let STATMUSE_PLAYER_IMAGES: PlayerImageMap = {};

export const fetchStatmuseData = async () => {
    console.log("ImageService: Syncing Statmuse player images...");
    try {
        const response = await fetch(PLAYER_IMAGES_GIST);
        if (!response.ok) throw new Error("Fetch failed");
        const data = await response.json();
        
        // This updates the object without changing the reference
        Object.assign(STATMUSE_PLAYER_IMAGES, data);
        
        console.log(`ImageService: Successfully loaded ${Object.keys(STATMUSE_PLAYER_IMAGES).length} images.`);
    } catch (error) {
        console.error("ImageService: Error loading Statmuse images:", error);
    }
};
