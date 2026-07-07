export const DEMO_LOGIN_CODE = "123456";

export function validateDemoLoginCode(code) {
  if (String(code || "").trim() === DEMO_LOGIN_CODE) {
    return { ok: true, message: "" };
  }
  return { ok: false, message: `验证码不正确，请输入 ${DEMO_LOGIN_CODE}` };
}

export function codeLoginFailureAction(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("user not found")) {
    return { fallbackToMock: false, message: "未找到该手机号" };
  }
  if (message.includes("invalid verification code")) {
    return { fallbackToMock: false, message: `验证码不正确，请输入 ${DEMO_LOGIN_CODE}` };
  }
  return { fallbackToMock: false, message: "验证码登录失败，请确认 API 已启动" };
}

export function sendCodeFailureMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("user not found")) {
    return "未找到该手机号";
  }
  if (message.includes("phone is required")) {
    return "请输入手机号码";
  }
  return "验证码发送失败，请确认 API 已启动";
}
