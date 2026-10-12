export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

/**
 * Searches the web and academic paper repositories without requiring API keys.
 */
export async function performLiveResearch(query: string): Promise<SearchResult[]> {
  const [arxivResults, webResults] = await Promise.allSettled([
    searchArxiv(query, 3),
    searchDuckDuckGo(query, 3)
  ]);

  const results: SearchResult[] = [];
  if (arxivResults.status === "fulfilled") results.push(...arxivResults.value);
  if (webResults.status === "fulfilled") results.push(...webResults.value);
  return results.slice(0, 6);
}

/**
 * Searches arXiv for the latest academic preprints and papers.
 */
export async function searchArxiv(query: string, maxResults = 3): Promise<SearchResult[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const cleanQuery = query.replace(/[^\w\s]/g, " ").trim().split(/\s+/).slice(0, 6).join("+");
    const response = await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQuery)}&start=0&max_results=${maxResults}&sortBy=relevance`, {
      signal: controller.signal,
      headers: { "user-agent": "BlackWire-AI-Research/1.0" }
    });
    clearTimeout(timer);
    if (!response.ok) return [];
    const xml = await response.text();

    const results: SearchResult[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let entryMatch: RegExpExecArray | null;

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entry = entryMatch[1]!;
      const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(entry);
      const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(entry);
      const idMatch = /<id>([\s\S]*?)<\/id>/i.exec(entry);

      if (titleMatch) {
        results.push({
          source: "arXiv",
          title: stripHtml(titleMatch[1]!).replace(/\s+/g, " "),
          url: idMatch ? stripHtml(idMatch[1]!) : "",
          snippet: summaryMatch ? stripHtml(summaryMatch[1]!).replace(/\s+/g, " ").slice(0, 250) : ""
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Fallback Web search using DuckDuckGo Instant Answer and Lite endpoints.
 */
export async function searchDuckDuckGo(query: string, maxResults = 3): Promise<SearchResult[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json() as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    const results: SearchResult[] = [];
    if (data.AbstractText) {
      results.push({
        source: "Web",
        title: data.Heading || query,
        url: data.AbstractURL || "",
        snippet: data.AbstractText
      });
    }

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, maxResults)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            source: "Web",
            title: topic.Text.slice(0, 60) + "...",
            url: topic.FirstURL,
            snippet: topic.Text
          });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}
