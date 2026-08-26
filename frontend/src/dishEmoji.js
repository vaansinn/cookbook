// Dish thumbnail emoji, keyed by slug. Used on Home's browse cards and the
// meal-plan item rows. New dishes without an entry fall back to a neutral plate.
const DISH_EMOJI = {
  "lentil-bolognese": "🍝",
  "chickpea-tikka-masala": "🍛",
  "spinach-egg-fried-rice": "🍳",
  "sushi-rice": "🍚",
  "lemon-ricotta-spaghetti": "🍋",
  "potato-chickpea-skillet": "🥘",
  "eggs-benedict": "🍳",
  "tiramisu": "🍰",
  "banana-bread": "🍞",
  "no-knead-bread": "🥖",
  "french-onion-soup": "🍲",
  "guacamole": "🥑",
  "thai-green-curry": "🍛",
  "greek-salad": "🥗",
  "chicken-souvlaki": "🍢",
};

export const dishEmoji = (slug) => DISH_EMOJI[slug] || "🍽️";

export default DISH_EMOJI;
