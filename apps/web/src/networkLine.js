export const NETWORK_LINES = ["线路 A", "线路 B", "线路 C"];

export function nextNetworkLine(currentLine) {
  const index = NETWORK_LINES.indexOf(currentLine);
  if (index < 0) return NETWORK_LINES[0];
  return NETWORK_LINES[(index + 1) % NETWORK_LINES.length];
}
