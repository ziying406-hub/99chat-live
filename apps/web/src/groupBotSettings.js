export function buildGroupBotPatch(bot, form = {}) {
  const scheduleMode = bot?.scheduleMode === "daily" ? "daily" : "interval";
  return {
    name: String(form.name ?? bot?.name ?? "").trim(),
    message: String(form.message ?? bot?.message ?? "").trim(),
    keywordRules: normalizeKeywordRules(form.keywordRules ?? bot?.keywordRules),
    scheduleMode,
    intervalSeconds: scheduleMode === "interval" ? (bot?.intervalSeconds || 300) : undefined,
    dailyTime: scheduleMode === "daily" ? (form.dailyTime || bot?.dailyTime || "20:00") : undefined
  };
}

export function normalizeKeywordRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map(rule => ({
      keyword: String(rule?.keyword || "").trim(),
      reply: String(rule?.reply || "").trim()
    }))
    .filter(rule => rule.keyword && rule.reply)
    .slice(0, 3);
}

export function buildNewGroupBotPayload(count = 0) {
  const nextNumber = Math.max(1, Number(count || 0) + 1);
  return {
    name: `公告机器人 ${nextNumber}`,
    message: "欢迎来到群聊，请留意群公告。",
    keywordRules: [],
    scheduleMode: "interval",
    intervalSeconds: 300,
    dailyTime: undefined
  };
}
