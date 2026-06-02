import { useCallback, useState } from "react";
import type { ScrapedContent } from "../../shared/types";
import { scrapeCurrentPage } from "../lib/scraper";

interface ScraperState {
  loading: boolean;
  content: ScrapedContent | null;
  error: string | null;
}

export function useScraper() {
  const [state, setState] = useState<ScraperState>({
    loading: false,
    content: null,
    error: null,
  });

  const scrape = useCallback(async () => {
    setState({ loading: true, content: null, error: null });
    try {
      const content = await scrapeCurrentPage();
      setState({ loading: false, content, error: null });
      return content;
    } catch (e) {
      const error = e instanceof Error ? e.message : "Scrape failed";
      setState({ loading: false, content: null, error });
      return null;
    }
  }, []);

  return { ...state, scrape };
}
