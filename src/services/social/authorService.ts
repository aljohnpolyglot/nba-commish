export interface Author {
  name: string;
  position: string;
  image_url: string;
}

const BIO_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/espnfullbio';

export async function fetchWriters(): Promise<Author[]> {
  try {
    const response = await fetch(BIO_URL);
    if (!response.ok) throw new Error('Failed to fetch bios');
    const data: Author[] = await response.json();
    const writers = data.filter(a => a.position.toLowerCase().includes('writer'));
    return writers.length > 0 ? writers : data.slice(0, 30);
  } catch {
    return [];
  }
}
