export declare const N: number;
export declare function words(s: string): string[];
export declare function shingles(text: string, n?: number): Set<string>;
export declare function findOverlaps(shipped: { where: string; text: string }[], reference: string, n?: number): { where: string; run: string }[];
