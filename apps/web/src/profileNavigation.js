export function profileCenterPath(location) {
  return `${location.pathname}${location.search}`;
}

export function chatReturnPath(location) {
  return profileCenterPath(location);
}
