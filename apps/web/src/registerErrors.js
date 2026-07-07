export function registerErrorMessage(error) {
  const message = String(error?.message || error || "");
  if (message.includes("phone and password with at least 6 chars")) {
    return "请输入手机号和至少 6 位密码";
  }
  if (message.includes("user already exists")) {
    return "这个手机号已经注册";
  }
  if (message.includes("invalid json")) {
    return "注册信息格式不正确";
  }
  return "注册失败，请稍后再试";
}
