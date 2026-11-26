/** Name parts for the synthetic universe. All combinations are invented — no real people or companies. */
import { MAJOR_EMPLOYERS } from "@founders/core/taxonomy";

export const FIRST_NAMES: Record<string, string[]> = {
  es: [
    "Alejandro", "Valentina", "Mateo", "Camila", "Santiago", "Lucía", "Sebastián", "Martina", "Diego", "Sofía",
    "Nicolás", "Isabella", "Joaquín", "Daniela", "Tomás", "Gabriela", "Emiliano", "Mariana", "Rodrigo", "Paula",
    "Andrés", "Florencia", "Gonzalo", "Renata", "Ignacio", "Ximena", "Felipe", "Antonella", "Julián", "Carolina",
    "Marcelo", "Natalia", "Esteban", "Fernanda", "Pablo", "Victoria", "Raúl", "Elena", "Hernán", "Adriana",
  ],
  pt: [
    "João", "Ana", "Pedro", "Beatriz", "Lucas", "Mariana", "Gabriel", "Larissa", "Rafael", "Juliana",
    "Thiago", "Fernanda", "Gustavo", "Camila", "Felipe", "Letícia", "Bruno", "Aline", "Caio", "Bianca",
  ],
  en: [
    "James", "Olivia", "Ethan", "Ava", "Noah", "Emma", "Liam", "Mia", "Owen", "Grace",
    "Henry", "Chloe", "Jack", "Ella", "Ryan", "Nora", "Adam", "Leah", "Daniel", "Zoe",
  ],
  de: ["Lukas", "Hannah", "Felix", "Lea", "Jonas", "Lena", "Paul", "Marie", "Niklas", "Anna"],
};

export const LAST_NAMES: Record<string, string[]> = {
  es: [
    "García", "Rodríguez", "Fernández", "López", "Martínez", "Suárez", "Vargas", "Rojas", "Gutiérrez", "Paz",
    "Montaño", "Justiniano", "Saavedra", "Cuéllar", "Antelo", "Ribera", "Morales", "Herrera", "Castro", "Ortiz",
    "Navarro", "Mendoza", "Aguilar", "Salazar", "Peña", "Cabrera", "Ibáñez", "Villarroel", "Landívar", "Chávez",
    "Quiroga", "Céspedes", "Arce", "Soria", "Mercado", "Velasco", "Toledo", "Paredes", "Molina", "Reyes",
  ],
  pt: [
    "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Almeida", "Carvalho", "Ribeiro",
    "Martins", "Rocha", "Barbosa", "Teixeira", "Moura", "Cardoso", "Nogueira", "Freitas", "Campos", "Duarte",
  ],
  en: [
    "Walker", "Bennett", "Hayes", "Carter", "Brooks", "Foster", "Reed", "Price", "Hughes", "Sullivan",
    "Morgan", "Parker", "Coleman", "Turner", "Ellis", "Graham", "Wallace", "Harper", "Lawson", "Spencer",
  ],
  de: ["Becker", "Hoffmann", "Wagner", "Schulz", "Keller", "Richter", "Neumann", "Krüger", "Vogel", "Braun"],
};

export const LANG_BY_COUNTRY: Record<string, keyof typeof FIRST_NAMES> = {
  Bolivia: "es",
  Mexico: "es",
  Colombia: "es",
  Argentina: "es",
  Chile: "es",
  Peru: "es",
  Uruguay: "es",
  Paraguay: "es",
  Ecuador: "es",
  Spain: "es",
  Brazil: "pt",
  Portugal: "pt",
  "United States": "en",
  Canada: "en",
  "United Kingdom": "en",
  Germany: "de",
};

export const NAME_ROOTS = [
  "lum", "kav", "nor", "zen", "alt", "ver", "sol", "mar", "nex", "vel", "tak", "qui", "ori", "ama", "cor",
  "pax", "rio", "sil", "tor", "ula", "vio", "yar", "bru", "cel", "dor", "fen", "gal", "hel", "ira", "jun",
  "kor", "lia", "mon", "nub", "ost", "pir", "quan", "ros", "sav", "tiv", "umi", "vant", "wal", "xan", "yun",
  "zar", "andi", "chaco", "pampa", "selva", "tierra", "cielo", "luna", "piedra", "agua", "fuego", "verde",
];

export const NAME_ENDINGS = ["a", "o", "ia", "io", "ex", "ix", "on", "ar", "us", "era", "ora", "ana", "ly", "ify", "eo", "is"];

export const NAME_SUFFIXES: Record<string, string[]> = {
  "Financial Services": ["Pay", "Capital", "Finance", "Ledger", "Bank", "Credit", "Pago", "Cash"],
  "Software & Internet": ["Labs", "Cloud", "Stack", "OS", "Works", "Hub", "Sync", "Base"],
  "Artificial Intelligence": ["AI", "Intelligence", "Mind", "Logic", "Neural", "Agents"],
  "Health & Life Sciences": ["Health", "Salud", "Care", "Bio", "Med", "Clinic"],
  "Commerce & Consumer": ["Market", "Shop", "Store", "Box", "Mercado", "Go"],
  "Climate & Energy": ["Energy", "Solar", "Grid", "Carbon", "Volt"],
  "Agriculture & Food Systems": ["Agro", "Farm", "Campo", "Harvest", "Soy", "Agri"],
  "Mobility & Logistics": ["Logistics", "Freight", "Fleet", "Ruta", "Move", "Cargo"],
  "Real Estate & Construction": ["Homes", "Build", "Spaces", "Casa", "Obra"],
  "Education & Work": ["Learn", "Academy", "Talent", "Skills", "Edu"],
  "Industrials & Hardware": ["Robotics", "Dynamics", "Systems", "Industrial", "Motion"],
  "Media & Entertainment": ["Studio", "Media", "Play", "Stream", "Games"],
};

export const TLDS: Record<string, string[]> = {
  Bolivia: ["com.bo", "bo", "com", "io"],
  Brazil: ["com.br", "com", "io"],
  Mexico: ["mx", "com", "io"],
  Colombia: ["co", "com"],
  Argentina: ["com.ar", "com", "io"],
  Chile: ["cl", "com"],
  Peru: ["pe", "com"],
  Uruguay: ["uy", "com"],
  Paraguay: ["com.py", "com"],
  Ecuador: ["ec", "com"],
  "United States": ["com", "io", "ai", "co"],
  Canada: ["ca", "com", "io"],
  Spain: ["es", "com", "io"],
  "United Kingdom": ["co.uk", "com", "io"],
  Germany: ["de", "com", "io"],
  Portugal: ["pt", "com"],
};

export const TAGLINE_TEMPLATES = [
  "{vertical} for {customer} in {region}",
  "The operating system for {customer}",
  "{model} platform helping {customer} grow faster",
  "AI-native {vertical} built for {customer}",
  "Making {vertical} simple for {customer}",
  "Infrastructure for {vertical} across {region}",
  "{vertical} that pays for itself",
  "Modern {vertical} for {customer}",
];

export const CUSTOMER_PHRASES: Record<string, string[]> = {
  B2B: ["SMBs", "mid-market finance teams", "enterprise operations", "logistics operators", "agribusinesses", "retailers", "clinics", "developers"],
  B2C: ["young professionals", "families", "students", "gig workers", "the unbanked", "pet owners", "travelers"],
  B2B2C: ["banks and their customers", "employers and employees", "brands and shoppers", "insurers and policyholders"],
  B2G: ["municipal governments", "public health systems", "customs agencies", "public schools"],
};

export const UNIVERSITIES: { name: string; country: string; tier: number }[] = [
  { name: "Universidad Privada de Santa Cruz", country: "Bolivia", tier: 2 },
  { name: "Universidad Católica Boliviana", country: "Bolivia", tier: 2 },
  { name: "Universidad Mayor de San Andrés", country: "Bolivia", tier: 2 },
  { name: "Universidad Autónoma Gabriel René Moreno", country: "Bolivia", tier: 3 },
  { name: "Universidade de São Paulo", country: "Brazil", tier: 1 },
  { name: "Universidade Estadual de Campinas", country: "Brazil", tier: 1 },
  { name: "Fundação Getulio Vargas", country: "Brazil", tier: 1 },
  { name: "Tecnológico de Monterrey", country: "Mexico", tier: 1 },
  { name: "Universidad Nacional Autónoma de México", country: "Mexico", tier: 1 },
  { name: "ITAM", country: "Mexico", tier: 1 },
  { name: "Universidad de los Andes", country: "Colombia", tier: 1 },
  { name: "Universidad Nacional de Colombia", country: "Colombia", tier: 2 },
  { name: "Universidad de Buenos Aires", country: "Argentina", tier: 1 },
  { name: "Instituto Tecnológico de Buenos Aires", country: "Argentina", tier: 1 },
  { name: "Pontificia Universidad Católica de Chile", country: "Chile", tier: 1 },
  { name: "Universidad de Chile", country: "Chile", tier: 1 },
  { name: "Universidad del Pacífico", country: "Peru", tier: 2 },
  { name: "Universidad de la República", country: "Uruguay", tier: 2 },
  { name: "Stanford University", country: "United States", tier: 1 },
  { name: "Massachusetts Institute of Technology", country: "United States", tier: 1 },
  { name: "Harvard University", country: "United States", tier: 1 },
  { name: "University of California, Berkeley", country: "United States", tier: 1 },
  { name: "Carnegie Mellon University", country: "United States", tier: 1 },
  { name: "University of Toronto", country: "Canada", tier: 1 },
  { name: "IE University", country: "Spain", tier: 1 },
  { name: "IESE Business School", country: "Spain", tier: 1 },
  { name: "Universidad Politécnica de Madrid", country: "Spain", tier: 2 },
  { name: "London School of Economics", country: "United Kingdom", tier: 1 },
  { name: "Imperial College London", country: "United Kingdom", tier: 1 },
  { name: "Technical University of Munich", country: "Germany", tier: 1 },
];

export const DEGREES = ["BSc", "BA", "MSc", "MBA", "PhD", "BEng"];
export const FIELDS = ["Computer Science", "Economics", "Industrial Engineering", "Business Administration", "Finance", "Agronomy", "Medicine", "Mathematics", "Design", "Law"];

export const TITLES_BY_DEPT: Record<string, string[]> = {
  Engineering: ["Software Engineer", "Senior Software Engineer", "Staff Engineer", "Engineering Manager", "VP Engineering", "CTO"],
  Sales: ["Account Executive", "Sales Manager", "Head of Sales", "VP Sales", "Chief Revenue Officer"],
  Product: ["Product Manager", "Senior Product Manager", "Head of Product", "VP Product", "Chief Product Officer"],
  Operations: ["Operations Analyst", "Operations Manager", "Head of Operations", "COO"],
  Marketing: ["Growth Marketer", "Marketing Manager", "Head of Growth", "CMO"],
  Finance: ["Financial Analyst", "Finance Manager", "Head of Finance", "CFO"],
  Design: ["Product Designer", "Senior Designer", "Head of Design"],
  People: ["Recruiter", "People Partner", "Head of People"],
};

export const BIG_EMPLOYERS = [...MAJOR_EMPLOYERS];

export const PUBLISHERS = [
  "El Deber Economía", "Página Siete Negocios", "LatAm Tech Wire", "Andes Startup Journal", "Valor Startups", "Bloque Fintech",
  "Contxto Review", "Pulso Emprendedor", "Startups del Sur", "Global Venture Daily", "Seed Signal", "Deal Street Weekly",
];

export const INVESTOR_NAME_PARTS = {
  first: ["Andes", "Pampa", "Amazonia", "Cordillera", "Altiplano", "Pacific", "Atlantic", "Southern Cross", "Condor", "Jaguar",
    "Ceibo", "Lapacho", "Guaraní", "Chiquitano", "Illimani", "Sajama", "Titicaca", "Patagonia", "Sierra", "Delta",
    "Northstar", "Harbor", "Summit", "Granite", "Beacon", "Meridian", "Horizon", "Keystone", "Lantern", "Compass"],
  second: ["Ventures", "Capital", "Partners", "Growth", "Fund", "Equity", "Holdings", "Investments", "VC", "Labs"],
};

export const ACQUIRERS = ["Andes Telecom Group", "Pampa Retail Holdings", "Rio Payments S.A.", "Cordillera Bank", "Globex Cloud", "Northwind Software", "Initech Systems", "Umbrella Logistics"];
export const EXCHANGES: { exchange: string; country: string }[] = [
  { exchange: "B3", country: "Brazil" },
  { exchange: "BMV", country: "Mexico" },
  { exchange: "NASDAQ", country: "United States" },
  { exchange: "NYSE", country: "United States" },
  { exchange: "BBV", country: "Bolivia" },
];
