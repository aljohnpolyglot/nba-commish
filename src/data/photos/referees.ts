const REFEREE_DATA_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/4d8d8447ec12377ce79914c3a8b9eacb/raw/a1b303d26892cb21652ace96c7c3bedabecac579/referee_data";
const REFEREE_PICS_GIST = "https://gist.githubusercontent.com/aljohnpolyglot/39217471bf53cc1f6f5673823e0e2da1/raw/22b6f73155a3e6a8f4b652d41ab0738f1891189c/referee_pics";

export interface RefereeData {
  id: string;
  name: string;
  slug: string;
  photo_url?: string;
}

// Static fallback — always available synchronously for modals that import REFS directly.
// The gist fetch enriches this data with photo_url at runtime.
export const REFS: { id: string; name: string; slug: string }[] = [
  { id: '54', name: 'Ray Acosta',               slug: 'ray-acosta' },
  { id: '67', name: 'Brandon Adair',            slug: 'brandon-adair' },
  { id: '36', name: 'Brent Barnaky',            slug: 'brent-barnaky' },
  { id: '74', name: 'Curtis Blair',             slug: 'courtney-kirkland-2' },
  { id: '25', name: 'Tony Brothers',            slug: 'tony-brothers' },
  { id: '3',  name: 'Nick Buchert',             slug: 'nick-buchert' },
  { id: '30', name: 'John Butler',              slug: 'john-butler' },
  { id: '19', name: 'James Capers',             slug: 'james-capers' },
  { id: '11', name: 'Derrick Collins',          slug: 'derrick-collins' },
  { id: '79', name: 'John Conley',              slug: 'john-conley' },
  { id: '33', name: 'Sean Corbin',              slug: 'sean-corbin' },
  { id: '34', name: 'Kevin Cutler',             slug: 'kevin-cutler' },
  { id: '28', name: 'Mousa Dagher',             slug: 'mousa-dagher' },
  { id: '37', name: 'Eric Dalen',               slug: 'eric-dalen' },
  { id: '8',  name: 'Marc Davis',               slug: 'marc-davis' },
  { id: '22', name: 'JB DeRosa',                slug: 'jb-derosa' },
  { id: '27', name: 'Mitchell Ervin',           slug: 'mitchell-ervin' },
  { id: '91', name: "Che Flores",               slug: 'cheryl-flores' },
  { id: '39', name: 'Tyler Ford',               slug: 'tyler-ford' },
  { id: '45', name: 'Brian Forte',              slug: 'brian-forte' },
  { id: '48', name: 'Scott Foster',             slug: 'scott-foster' },
  { id: '26', name: 'Pat Fraher',               slug: 'pat-fraher' },
  { id: '68', name: 'Jacyn Goble',              slug: 'jacyn-goble' },
  { id: '10', name: 'John Goble',               slug: 'john-goble' },
  { id: '35', name: 'Jason Goldenberg',         slug: 'jason-goldenberg' },
  { id: '65', name: 'Nate Green',               slug: 'nate-green' },
  { id: '16', name: 'David Guthrie',            slug: 'david-guthrie' },
  { id: '7',  name: 'Lauren Holtkamp-Sterling', slug: 'lauren-holtkamp' },
  { id: '85', name: 'Robert Hussey',            slug: 'robert-hussey' },
  { id: '96', name: 'Intae Hwang',              slug: 'intae-hwang' },
  { id: '81', name: 'Simone Jelks',             slug: 'simone-jelks' },
  { id: '88', name: 'Matt Kallio',              slug: 'matt-kallio' },
  { id: '55', name: 'Bill Kennedy',             slug: 'bill-kennedy' },
  { id: '61', name: 'Courtney Kirkland',        slug: 'courtney-kirkland' },
  { id: '32', name: 'Marat Kogut',              slug: 'marat-kogut' },
  { id: '77', name: 'Karl Lane',                slug: 'karl-lane' },
  { id: '29', name: 'Mark Lindsay',             slug: 'mark-lindsay' },
  { id: '23', name: 'Tre Maddox',               slug: 'tre-maddox' },
  { id: '14', name: 'Ed Malloy',                slug: 'ed-malloy' },
  { id: '82', name: 'Suyash Mehta',             slug: 'suyash-mehta' },
  { id: '98', name: "Sha'rae Mitchell",         slug: 'sharae-mitchell' },
  { id: '89', name: 'Dannica Mosher',           slug: 'dannica-mosher' },
  { id: '71', name: 'Rodney Mott',              slug: 'rodney-mott' },
  { id: '13', name: 'Ashley Moyer-Gleich',      slug: 'ashley-moyer-gleich' },
  { id: '43', name: 'Matt Myers',               slug: 'matt-myers' },
  { id: '83', name: 'Andy Nagy',                slug: 'andy-nagy' },
  { id: '44', name: 'Brett Nansel',             slug: 'brett-nansel' },
  { id: '72', name: 'J.T. Orr',                slug: 'j-t-orr' },
  { id: '50', name: 'Gediminas Petraitis',      slug: 'gediminas-petraitis' },
  { id: '94', name: 'JD Ralls',                slug: 'jd-ralls' },
  { id: '70', name: 'Phenizee Ransom',          slug: 'phenizee-ransom' },
  { id: '63', name: 'Derek Richardson',         slug: 'derek-richardson' },
  { id: '95', name: 'Tyler Ricks',              slug: 'tyler-ricks' },
  { id: '84', name: 'Jenna Schroeder',          slug: 'jenna-schroeder' },
  { id: '9',  name: 'Natalie Sago',             slug: 'natalie-sago' },
  { id: '86', name: 'Brandon Schwab',           slug: 'brandon-schwab' },
  { id: '87', name: 'Danielle Scott',           slug: 'danielle-scott' },
  { id: '78', name: 'Evan Scott',               slug: 'evan-scott' },
  { id: '24', name: 'Kevin Scott',              slug: 'kevin-scott' },
  { id: '51', name: 'Aaron Smith',              slug: 'aaron-smith' },
  { id: '38', name: 'Michael Smith',            slug: 'michael-smith' },
  { id: '17', name: 'Jonathan Sterling',        slug: 'jonathan-sterling' },
  { id: '46', name: 'Ben Taylor',               slug: 'ben-taylor' },
  { id: '21', name: 'Dedric Taylor',            slug: 'dedric-taylor' },
  { id: '58', name: 'Josh Tiven',               slug: 'joshua-tiven' },
  { id: '52', name: 'Scott Twardoski',          slug: 'scott-twardoski' },
  { id: '64', name: 'Justin Van Duyne',         slug: 'justin-van-duyne' },
  { id: '31', name: 'Scott Wall',               slug: 'scott-wall' },
  { id: '12', name: 'CJ Washington',            slug: 'cj-washington' },
  { id: '60', name: 'James Williams',           slug: 'james-williams' },
  { id: '49', name: 'Tom Washington',           slug: 'tom-washington' },
  { id: '40', name: 'Leon Wood',                slug: 'leon-wood' },
  { id: '4',  name: 'Sean Wright',              slug: 'sean-wright' },
  { id: '15', name: 'Zach Zarba',               slug: 'zach-zarba' },
];

let _refs: RefereeData[] = [];
let _fetched = false;

export const fetchRefereeData = async (): Promise<void> => {
  if (_fetched) return;
  try {
    const [dataRes, picsRes] = await Promise.all([
      fetch(REFEREE_DATA_GIST),
      fetch(REFEREE_PICS_GIST),
    ]);
    if (dataRes.ok) _refs = await dataRes.json();
    if (picsRes.ok) {
      const pics: { name: string; photo_url: string }[] = await picsRes.json();
      const photoMap = new Map(pics.map(p => [p.name, p.photo_url]));
      _refs = _refs.map(r => ({ ...r, photo_url: photoMap.get(r.name) ?? r.photo_url }));
    }
    _fetched = true;
  } catch (e) {
    console.error('[RefereeData] fetch failed', e);
  }
};

// Returns gist data when available; falls back to static REFS (no photos)
export const getAllReferees = (): RefereeData[] =>
  _refs.length > 0 ? _refs : REFS.map(r => ({ ...r }));

export const getRefereePhoto = (name: string): string | undefined =>
  _refs.find(r => r.name === name)?.photo_url;

export const getRefereeSlug = (name: string): string | undefined =>
  _refs.find(r => r.name === name)?.slug ?? REFS.find(r => r.name === name)?.slug;
