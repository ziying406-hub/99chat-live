import assert from "node:assert/strict";
import test from "node:test";

import { buildGroupBotPatch, buildNewGroupBotPayload, normalizeKeywordRules } from "./groupBotSettings.js";

test("builds group bot patch with editable name", () => {
  assert.deepEqual(
    buildGroupBotPatch(
      { name: "公告机器人", message: "旧公告", scheduleMode: "interval", intervalSeconds: 60 },
      { name: "值班公告助手", message: "新公告" }
    ),
    {
      name: "值班公告助手",
      message: "新公告",
      keywordRules: [],
      scheduleMode: "interval",
      intervalSeconds: 60,
      dailyTime: undefined
    }
  );
});

test("builds daily group bot patch with daily time", () => {
  assert.deepEqual(
    buildGroupBotPatch(
      { name: "公告机器人", message: "每日公告", scheduleMode: "daily", dailyTime: "20:00" },
      { name: "公告机器人", message: "每日公告", dailyTime: "20:30" }
    ),
    {
      name: "公告机器人",
      message: "每日公告",
      keywordRules: [],
      scheduleMode: "daily",
      intervalSeconds: undefined,
      dailyTime: "20:30"
    }
  );
});

test("normalizes keyword rules and keeps at most three", () => {
  assert.deepEqual(
    normalizeKeywordRules([
      { keyword: " 公告 ", reply: " 请查看群公告 " },
      { keyword: "", reply: "空关键词忽略" },
      { keyword: "客服", reply: "联系值班客服" },
      { keyword: "规则", reply: "群规如下" },
      { keyword: "第四条", reply: "不应保留" }
    ]),
    [
      { keyword: "公告", reply: "请查看群公告" },
      { keyword: "客服", reply: "联系值班客服" },
      { keyword: "规则", reply: "群规如下" }
    ]
  );
});

test("builds new group bot payload with numbered default name", () => {
  assert.deepEqual(buildNewGroupBotPayload(2), {
    name: "公告机器人 3",
    message: "欢迎来到群聊，请留意群公告。",
    keywordRules: [],
    scheduleMode: "interval",
    intervalSeconds: 300,
    dailyTime: undefined
  });
});
