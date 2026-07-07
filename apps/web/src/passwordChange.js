export function validatePasswordChange(oldPassword, newPassword, confirmPassword) {
  if (!String(oldPassword || "").trim()) {
    return { ok: false, message: "请输入旧密码" };
  }
  if (String(newPassword || "").trim().length < 6) {
    return { ok: false, message: "新密码至少需要 6 位" };
  }
  if (String(newPassword || "").trim() !== String(confirmPassword || "").trim()) {
    return { ok: false, message: "两次输入的新密码不一致" };
  }
  return { ok: true, message: "" };
}

export function passwordActionTarget(action) {
  return action === "change-password" ? "security" : "";
}

export function validateForgotPasswordReset(code, newPassword, confirmPassword) {
  if (!String(code || "").trim()) {
    return { ok: false, message: "请输入验证码" };
  }
  if (String(newPassword || "").trim().length < 6) {
    return { ok: false, message: "新密码至少需要 6 位" };
  }
  if (String(newPassword || "").trim() !== String(confirmPassword || "").trim()) {
    return { ok: false, message: "两次输入的新密码不一致" };
  }
  return { ok: true, message: "" };
}
