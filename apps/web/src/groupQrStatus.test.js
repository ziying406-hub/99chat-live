import assert from "node:assert/strict";
import test from "node:test";

import { groupQrExpiryLabel, isGroupQrExpired } from "./groupQrStatus.js";

test("group qr without expiry is treated as permanent", () => {
  assert.equal(groupQrExpiryLabel({}, new Date("2026-07-06T00:00:00Z")), "永久有效");
  assert.equal(isGroupQrExpired({}, new Date("2026-07-06T00:00:00Z")), false);
});

test("group qr shows future expiry date", () => {
  const label = groupQrExpiryLabel(
    { qrCodeExpiresAt: "2026-07-13T08:30:00Z" },
    new Date("2026-07-06T00:00:00Z")
  );

  assert.match(label, /^有效至 /);
  assert.equal(isGroupQrExpired({ qrCodeExpiresAt: "2026-07-13T08:30:00Z" }, new Date("2026-07-06T00:00:00Z")), false);
});

test("group qr marks expired codes", () => {
  const group = { qrCodeExpiresAt: "2026-07-05T23:59:00Z" };

  assert.equal(groupQrExpiryLabel(group, new Date("2026-07-06T00:00:00Z")), "已过期，请刷新二维码");
  assert.equal(isGroupQrExpired(group, new Date("2026-07-06T00:00:00Z")), true);
});
