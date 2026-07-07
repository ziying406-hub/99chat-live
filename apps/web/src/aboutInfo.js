export const ONLINE_APP_VERSION = "v0.1 Beta";
export const MOCK_APP_VERSION = "v0.1 Demo";

export function buildAboutInfo({ useMock = false, networkLine = "线路 A", conversationCount = 0 } = {}) {
  return {
    version: useMock ? MOCK_APP_VERSION : ONLINE_APP_VERSION,
    mode: useMock ? "本地演示" : "在线接口",
    networkLine,
    conversationCount
  };
}
