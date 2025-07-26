declare module 'simple-spellchecker' {
  interface Dictionary {
    spellCheck(word: string): boolean;
    getSuggestions(word: string, limit?: number): string[];
  }

  export function getDictionary(language: string): Promise<Dictionary>;
}