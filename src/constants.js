export const STORAGE_KEY = "pgs-shop-data-v1";

export const ORDER_TYPES = {
  sell_pokemon: { label: "ขาย Pokémon", short: "ขาย", emoji: "🐉", color: "#FFCB05" },
  hire_boss: { label: "จ้างตีบอส", short: "ตีบอส", emoji: "🎯", color: "#3B5DC9" },
  hire_invite: { label: "จ้างเชิญตี", short: "เชิญตี", emoji: "📨", color: "#33C481" },
};

export const PAYMENT_STATUS = {
  pending: { label: "รอชำระ", color: "#FF5470" },
  partial: { label: "ชำระบางส่วน", color: "#FFCB05" },
  paid: { label: "ชำระแล้ว", color: "#33C481" },
};

export const TRADE_STATUS = {
  waiting: { label: "รอเทรด", color: "#8B8DA3" },
  traded: { label: "เทรดแล้ว", color: "#33C481" },
  three_hearts: { label: "ทำ 3 ใจ", color: "#FFCB05" },
};

export const HIRE_STATUS = {
  ongoing: { label: "ค้างอยู่", color: "#FF5470" },
  done: { label: "เสร็จสิ้น", color: "#33C481" },
};

export const INVEST_TYPES = {
  topup: { label: "เติม Coin" },
  buy_pokemon: { label: "ซื้อ Pokémon" },
};

export const POKEMON_VARIANTS = {
  normal: { label: "ปกติ", emoji: "⭐" },
  shiny: { label: "Shiny", emoji: "✨" },
  shadow: { label: "Shadow", emoji: "🌑" },
  purified: { label: "Purified", emoji: "💠" },
  lucky: { label: "Lucky", emoji: "🍀" },
  alolan: { label: "Alolan", emoji: "🌴" },
  galarian: { label: "Galarian", emoji: "⚔️" },
  hisuian: { label: "Hisuian", emoji: "🏔️" },
  mega: { label: "Mega", emoji: "💥" },
  xl_perfect: { label: "XL Perfect(100%)", emoji: "💯" },
};

export const HIRE_MODES = {
  scheduled: { label: "ตั้งรอบ" },
  anytime: { label: "ไม่ระบุรอบ (ตีเมื่อสะดวก)" },
};
