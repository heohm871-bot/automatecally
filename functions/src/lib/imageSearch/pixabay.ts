export type FoundImage = {
  provider: "pixabay";
  imageUrl: string;
  pageUrl: string;
  author?: string;
  licenseUrl: string;
};

type PixabayHit = {
  largeImageURL?: string;
  webformatURL?: string;
  pageURL?: string;
  user?: string;
};

type PixabayApiResponse = {
  hits?: PixabayHit[];
};

export async function searchPixabay(args: { q: string; apiKey: string; perPage?: number }) {
  const perPage = args.perPage ?? 20;
  const url =
    "https://pixabay.com/api/?" +
    new URLSearchParams({
      key: args.apiKey,
      q: args.q,
      image_type: "photo",
      safesearch: "true",
      per_page: String(perPage)
    });

  const r = await fetch(url);
  if (!r.ok) return [] as FoundImage[];
  const j = (await r.json()) as PixabayApiResponse;

  const licenseUrl = "https://pixabay.com/service/license-summary/";
  return (j.hits ?? []).map((h) => ({
    provider: "pixabay",
    imageUrl: h.largeImageURL || h.webformatURL || "",
    pageUrl: h.pageURL || "",
    author: h.user,
    licenseUrl
  }));
}
