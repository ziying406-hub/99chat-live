export const collectionFilters = [
  { key: "all", label: "全部" },
  { key: "text", label: "文字" },
  { key: "media", label: "图片与视频" },
  { key: "file", label: "文件" },
  { key: "voice", label: "语音" }
];

export function normalizeCollectionFilter(filter) {
  return collectionFilters.some(item => item.key === filter) ? filter : "all";
}

export function collectionFilterLabel(filter) {
  return collectionFilters.find(item => item.key === normalizeCollectionFilter(filter))?.label || "全部";
}

export function collectionFilterMatches(item, filter) {
  const normalized = normalizeCollectionFilter(filter);
  if (normalized === "all") return true;
  if (normalized === "media") return ["image", "video"].includes(item?.kind);
  return item?.kind === normalized;
}

export function filterCollections(collections, filter) {
  const normalized = normalizeCollectionFilter(filter);
  return (collections || []).filter(item => collectionFilterMatches(item, normalized));
}
