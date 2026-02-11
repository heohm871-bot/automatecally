export type DdgImage = {
  provider: "duckduckgo";
  imageUrl: string;
  pageUrl: string;
  licenseNote: string;
};

export async function searchDuckDuckGoFallback(_q: string): Promise<DdgImage[]> {
  return [];
}
