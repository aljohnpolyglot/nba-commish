// Types
export interface Product {
  title: string;
  price: string;
  image: string;
  brand?: string;
  isStatic?: boolean;
  link?: string;
  category?: string;
}

export interface Category {
  title: string;
  image: string;
  query: string;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterGroup {
  title: string;
  paramName: string;
  options: FilterOption[];
}

// Constants
export const TOP_PICKS: Product[] = [
  {
    title: "Nike Book 2 EP 'Rising'",
    price: "$145.00",
    image: "https://nbastore.com.ph/cdn/shop/files/1_583d84c6-833f-40d0-916b-763aec9c9c5d_500x.png",
    brand: "Nike",
    isStatic: true,
  },
  {
    title: "ANTA Klay Thompson KT Splash 7",
    price: "$71.00",
    image: "https://nbastore.com.ph/cdn/shop/files/1_443e7e55-7bd9-4fbc-a80c-d7638b12431d_500x.jpg",
    brand: "Anta",
    isStatic: true,
  },
  {
    title: 'Reebok Angel Reese 1 "King Tiago"',
    price: "$129.00",
    image: "https://nbastore.com.ph/cdn/shop/files/Untitled_design_3_500x.png",
    brand: "Reebok",
    isStatic: true,
  },
  {
    title: "ANTA Klay Thompson KT Splash 7",
    price: "$71.00",
    image: "https://nbastore.com.ph/cdn/shop/files/1_2c5968e9-7a42-46c4-9bfe-36d789232f66_500x.jpg",
    brand: "Anta",
    isStatic: true,
  },
  {
    title: "NBA Team Print Hoodie - Knicks",
    price: "$41.00",
    image: "https://nbastore.com.ph/cdn/shop/files/1_3a8a526a-194c-460c-858a-4e78400e5041_500x.jpg",
    brand: "Fexpro",
    isStatic: true,
  },
];

export const CATEGORIES: Category[] = [
  {
    title: "Accessories",
    image: "https://nbastore.com.ph/cdn/shop/files/ACCESSORIES_540x.png",
    query: "Accessories",
  },
  {
    title: "Collectibles",
    image: "https://nbastore.com.ph/cdn/shop/files/COLLECTIBLES_540x.png",
    query: "Collectibles",
  },
  {
    title: "Footwear",
    image: "https://store.nba.com/content/ws/all/97c5e1e0-4604-43f5-bf8e-b4fa935fbc56__480X639.jpg?w=480",
    query: "Footwear",
  },
  {
    title: "Hardwood Classics",
    image: "https://preview.redd.it/nba-hardwood-classic-jerseys-v0-fgqxsfdlvswf1.jpeg?auto=webp&s=80387196e83859a9861e340c5b04fa2f6fd7977a",
    query: "Hardwood Classics",
  },
  {
    title: "Hats",
    image: "https://store.nba.com/content/ws/all/a831addf-60ec-47ab-aab1-e6a44e1ee0a2__480X639.jpg?w=480",
    query: "Hats",
  },
  {
    title: "Hoodies",
    image: "https://store.nba.com/content/ws/all/3159dd7c-1f19-4b99-b3f3-5d1a3bf7838b__480X639.jpg?w=480",
    query: "Hoodies",
  },
  {
    title: "Jerseys",
    image: "https://nbastore.com.ph/cdn/shop/files/JERSEYS_dc6ee61a-68d2-4255-aa36-05f75e2dbfe2_540x.png",
    query: "Jerseys",
  },
  {
    title: "Outerwear",
    image: "https://store.nba.com/content/ws/all/815cc62e-fe02-417f-b537-bddd2ca71108__480X639.jpg?w=480",
    query: "Jacket",
  },
  {
    title: "Shorts",
    image: "https://store.nba.com/content/ws/all/277c4071-0ecd-4b3f-ba33-408763dba8f4__480X639.jpg?w=480",
    query: "Shorts",
  },
  {
    title: "T-Shirts",
    image: "https://nbastore.com.ph/cdn/shop/files/TEES_540x.png",
    query: "T-Shirts",
  },
];

export const PLAYERS: Category[] = [
  {
    title: "Luka Doncic",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_Luka_Doncic_540x.png",
    query: "Luka Doncic",
  },
  {
    title: "LeBron James",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_LeBron_James_540x.png",
    query: "LeBron James",
  },
  {
    title: "Stephen Curry",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_Stephen_Curry_540x.png",
    query: "Stephen Curry",
  },
  {
    title: "Anthony Edwards",
    image: "https://nbastore.com.ph/cdn/shop/collections/ANT_540x.png",
    query: "Anthony Edwards",
  },
  {
    title: "Jayson Tatum",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_Jayson_Tatum_360x.png?v=1764556315",
    query: "Jayson Tatum",
  },
  {
    title: "Kyrie Irving",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_Kyrie_Irving_360x.png?v=1764556347",
    query: "Kyrie Irving",
  },
  {
    title: "Kevin Durant",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_Kevin_Durant_360x.png?v=1764556121",
    query: "Kevin Durant",
  },
  {
    title: "Devin Booker",
    image: "https://nbastore.com.ph/cdn/shop/collections/DEVINBOOKER_360x.png?v=1764556221",
    query: "Devin Booker",
  },
  {
    title: "Ja Morant",
    image: "https://nbastore.com.ph/cdn/shop/collections/JAMORANT_HOMEPAGE_360x.png?v=1764556101",
    query: "Ja Morant",
  },
  {
    title: "Giannis Antetokounmpo",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_Giannis_Antetokounmpo_360x.png?v=1764556171",
    query: "Giannis Antetokounmpo",
  },
  {
    title: "Zion Williamson",
    image: "https://nbastore.com.ph/cdn/shop/collections/NBA_Store_Player_Headshot_Guide_-_Zion_Williamson_360x.png?v=1764556190",
    query: "Zion Williamson",
  },
];
