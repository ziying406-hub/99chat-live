export function currentDeviceInfo(userAgent = "") {
  const ua = String(userAgent || "");
  let name = "当前浏览器";
  if (/Edg\//.test(ua)) name = "Edge 浏览器";
  else if (/Chrome\//.test(ua)) name = "Chrome 浏览器";
  else if (/Safari\//.test(ua)) name = "Safari 浏览器";
  else if (/Firefox\//.test(ua)) name = "Firefox 浏览器";

  return {
    name,
    status: "当前设备",
    hint: "正在使用此浏览器登录"
  };
}

export function loginDeviceDisplay(device = {}, userAgent = "") {
  const fallback = currentDeviceInfo(userAgent);
  if (device.current) {
    return {
      name: device.name || fallback.name,
      status: "当前设备",
      hint: "正在使用此浏览器登录",
      canRevoke: false
    };
  }
  return {
    name: device.name || "已登录设备",
    status: "其它设备",
    hint: "可退出此登录",
    canRevoke: true
  };
}
