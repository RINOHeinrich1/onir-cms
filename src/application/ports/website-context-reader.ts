/** Port de lecture d'un site pour l'assistance IA (ADR-0038). */

export type WebsiteCrawlOptions = {
  /** Nombre de pages maximum (1..10). */
  maxPages: number;
  /** Profondeur de liens (0..2). */
  maxDepth: number;
};

export type CrawledPage = {
  url: string;
  title: string;
  text: string;
};

export type WebsiteContext = {
  startUrl: string;
  pages: CrawledPage[];
  chars: number;
  truncated: boolean;
  warnings: string[];
};

export interface WebsiteContextReader {
  read(url: string, options: WebsiteCrawlOptions): Promise<WebsiteContext>;
}
