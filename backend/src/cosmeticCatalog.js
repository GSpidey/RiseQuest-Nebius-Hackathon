// Public product data shared by the API and mobile app. Prices are enforced by the API.
const item = (id, name, type, price, category, description, extra = {}) =>
  ({ id, name, type, price, category, description, ageGroups: ['child', 'teen', 'adult'], ...extra });
const CATALOG = [
  item('avatar_lumen', 'Lumen', 'companions', 1800, 'premium', 'A lantern-bearing fox with reading tools; generated voice is priced separately'),
  item('theme_nature', 'Forest Morning', 'themes', 200, 'basic', 'Sunlit woodland artwork and fresh green accents'),
  item('theme_space', 'Space Explorer', 'themes', 200, 'basic', 'A cosmic backdrop with violet accents'),
  item('theme_ocean', 'Ocean Waves', 'themes', 200, 'basic', 'An ocean backdrop with turquoise accents'),
  item('theme_urban', 'City Vibes', 'themes', 350, 'premium', 'City artwork with warm sunset accents'),
  item('theme_zen', 'Zen Garden', 'themes', 350, 'premium', 'A peaceful garden with soft sage accents'),
  item('sound_birds', 'Morning Birds', 'sounds', 120, 'basic', 'A bright birdsong-inspired wake-up melody'),
  item('sound_rain', 'Gentle Rain', 'sounds', 120, 'basic', 'A soft rain-inspired wake-up sound'),
  item('sound_motivational', 'Rise and Shine', 'sounds', 220, 'premium', 'An uplifting wake-up melody; add your own voice recording'),
  item('anim_sparkles', 'Success Sparkles', 'animations', 150, 'basic', 'Golden sparkles celebrate your progress'),
  item('anim_fireworks', 'Victory Fireworks', 'animations', 250, 'premium', 'Colorful bursts celebrate your milestones'),
  item('anim_petals', 'Garden Petals', 'animations', 150, 'basic', 'Gentle petals for small victories'),
  item('anim_aurora', 'Aurora Ribbons', 'animations', 250, 'premium', 'Flowing ribbons of color'),
  item('badge_early_bird', 'Sunrise Gold', 'badges', 80, 'basic', 'A golden sunrise decoration for your collection'),
  item('badge_streak_master', 'Starlight Medal', 'badges', 150, 'premium', 'A jewel-toned star decoration for your collection'),
  item('bundle_starter', 'Starter Pack', 'bundles', 450, 'basic', 'One basic theme, sound, animation and decorative badge',
    { items: ['theme_nature', 'sound_birds', 'anim_sparkles', 'badge_early_bird'] }),
  item('bundle_premium', 'Premium Collection', 'bundles', 900, 'premium', 'One premium theme, sound, animation and decorative badge',
    { items: ['theme_zen', 'sound_motivational', 'anim_fireworks', 'badge_streak_master'] }),
  item('avatar_orbit', 'Orbit', 'companions', 650, 'premium', 'Your friendly space traveller'),
  item('avatar_ember', 'Ember', 'companions', 850, 'premium', 'A bright spark for your day'),
];
const ACHIEVEMENTS = [
  [
    "achievement_first_wake",
    "Hello, Morning!",
    "wakeDays",
    1,
    "Complete your first alarm day",
    "sun",
    25
  ],
  [
    "achievement_three_wakes",
    "Morning Explorer",
    "wakeDays",
    3,
    "Complete alarms on 3 different days",
    "sun",
    50
  ],
  [
    "achievement_week",
    "Week of Wonder",
    "bestStreak",
    7,
    "Complete alarms on 7 consecutive days",
    "flame",
    150
  ],
  [
    "achievement_month",
    "Morning Constellation",
    "bestStreak",
    30,
    "Complete alarms on 30 consecutive days",
    "star",
    600
  ],
  [
    "achievement_quest",
    "First Adventure",
    "quests",
    1,
    "Finish your first quest",
    "flag",
    25
  ],
  [
    "achievement_five_quests",
    "Quest Explorer",
    "quests",
    5,
    "Finish 5 quests",
    "flag",
    75
  ],
  [
    "achievement_twenty_quests",
    "Quest Champion",
    "quests",
    20,
    "Finish 20 quests",
    "crown",
    250
  ],
  [
    "achievement_steps",
    "Small Steps, Big Joy",
    "steps",
    10,
    "Complete 10 quest steps",
    "leaf",
    50
  ],
  [
    "achievement_fifty_steps",
    "Trailblazer",
    "steps",
    50,
    "Complete 50 quest steps",
    "leaf",
    175
  ],
  [
    "achievement_challenge",
    "Bright Spark",
    "challenges",
    1,
    "Finish an alarm challenge",
    "bolt",
    25
  ],
  [
    "achievement_ten_challenges",
    "Challenge Champion",
    "challenges",
    10,
    "Finish challenges on 10 different days",
    "bolt",
    200
  ],
  [
    "achievement_sleep",
    "Dream Keeper",
    "sleepDays",
    7,
    "Log sleep on 7 different days",
    "moon",
    100
  ],
  [
    "achievement_seven_wakes",
    "Sunrise Voyager",
    "wakeDays",
    7,
    "Complete alarms on 7 different days",
    "sun",
    100
  ],
  [
    "achievement_thirty_wakes",
    "Dawn Guardian",
    "wakeDays",
    30,
    "Complete alarms on 30 different days",
    "sun",
    300
  ],
  [
    "achievement_hundred_wakes",
    "Phoenix Rising",
    "wakeDays",
    100,
    "Complete alarms on 100 different days",
    "flame",
    900
  ],
  [
    "achievement_year_wakes",
    "Around the Sun",
    "wakeDays",
    365,
    "Complete alarms on 365 different days",
    "sun",
    3000
  ],
  [
    "achievement_fortnight",
    "Steady Flame",
    "bestStreak",
    14,
    "Complete alarms on 14 consecutive days",
    "flame",
    300
  ],
  [
    "achievement_sixty_streak",
    "Unstoppable Dawn",
    "bestStreak",
    60,
    "Complete alarms on 60 consecutive days",
    "flame",
    1200
  ],
  [
    "achievement_hundred_streak",
    "Centurion of Light",
    "bestStreak",
    100,
    "Complete alarms on 100 consecutive days",
    "crown",
    2000
  ],
  [
    "achievement_fifty_quests",
    "Adventure Seeker",
    "quests",
    50,
    "Finish 50 quests",
    "flag",
    500
  ],
  [
    "achievement_hundred_quests",
    "Treasure Hunter",
    "quests",
    100,
    "Finish 100 quests",
    "crown",
    900
  ],
  [
    "achievement_legend_quests",
    "Quest Legend",
    "quests",
    250,
    "Finish 250 quests",
    "crown",
    2000
  ],
  [
    "achievement_hundred_steps",
    "Growing Strong",
    "steps",
    100,
    "Complete 100 quest steps",
    "leaf",
    350
  ],
  [
    "achievement_fivehundred_steps",
    "Forest of Progress",
    "steps",
    500,
    "Complete 500 quest steps",
    "leaf",
    1500
  ],
  [
    "achievement_thirty_challenges",
    "Puzzle Pioneer",
    "challenges",
    30,
    "Finish challenges on 30 different days",
    "bolt",
    500
  ],
  [
    "achievement_hundred_challenges",
    "Mind Dragon",
    "challenges",
    100,
    "Finish challenges on 100 different days",
    "bolt",
    1500
  ],
  [
    "achievement_thirty_sleep",
    "Moonlight Rhythm",
    "sleepDays",
    30,
    "Log sleep on 30 different days",
    "moon",
    350
  ],
  [
    "achievement_hundred_sleep",
    "Dream Architect",
    "sleepDays",
    100,
    "Log sleep on 100 different days",
    "moon",
    1000
  ]
].map(([id, name, metric, target, description, symbol, xp], i) => ({ id, name, metric, target, description,
  symbol, xp, type: 'badges', category: 'earned', price: 0, palette: i % 5 }));
const byId = Object.fromEntries([...CATALOG, ...ACHIEVEMENTS].map(value => [value.id, value]));
// Keep historical contents: the original premium pack included TWO themes.
const LEGACY_BUNDLES = { bundle_starter: ['theme_nature', 'sound_birds', 'anim_sparkles'],
  bundle_premium: ['theme_zen', 'theme_urban', 'sound_motivational', 'anim_fireworks'] };
function expand(ids, catalog = byId, legacy = false) {
  return [...new Set(ids.flatMap(id => [id, ...(legacy ? LEGACY_BUNDLES[id] || [] : catalog[id]?.items || [])]))];
}
function quote(ids, owned, catalog = byId) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length ||
    ids.some(id => typeof id !== 'string' || !Object.hasOwn(catalog, id) || catalog[id].category === 'earned')) {
    throw new Error('Choose items from the current store.');
  }
  const selected = expand(ids, catalog), inventory = new Set(owned);
  // Avoid charging twice for a single item included in two selected products.
  const contents = ids.flatMap(id => catalog[id].items || [id]);
  if (new Set(contents).size !== contents.length) throw new Error('Your cart contains overlapping bundle items.');
  const lines = ids.map(id => {
    const product = catalog[id];
    if (inventory.has(id)) throw new Error(`${product.name} is already in your collection.`);
    if (!product.items) return { id, amount: product.price };
    const total = product.items.reduce((sum, child) => sum + catalog[child].price, 0);
    const missing = product.items.filter(child => !inventory.has(child));
    if (!missing.length) throw new Error('You already own everything in this bundle.');
    return { id, amount: Math.ceil(product.price * missing.reduce((sum, child) => sum + catalog[child].price, 0) / total) };
  });
  return { amount: lines.reduce((sum, line) => sum + line.amount, 0), lines,
    grants: selected.filter(id => !inventory.has(id)), itemIds: ids };
}
module.exports = { CATALOG, ACHIEVEMENTS, byId, expand, quote, LEGACY_BUNDLES };
