/**
 * String manipulation utilities for Excel import functionality
 * Provides fuzzy matching, similarity scoring, and header normalization
 */

/**
 * Calculate Levenshtein distance between two strings
 * @param str1 First string
 * @param str2 Second string
 * @returns Edit distance between strings
 */
export function calculateLevenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  // Initialize matrix
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len2][len1];
}

/**
 * Calculate similarity score between two strings
 * @param str1 First string
 * @param str2 Second string
 * @returns Similarity score between 0 and 1
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeHeader(str1);
  const normalized2 = normalizeHeader(str2);
  
  if (normalized1 === normalized2) {
    return 1.0;
  }
  
  const distance = calculateLevenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  
  if (maxLength === 0) {
    return 1.0;
  }
  
  return 1 - (distance / maxLength);
}

/**
 * Check if needle is contained in haystack (case-insensitive)
 * @param needle String to search for
 * @param haystack String to search in
 * @returns True if needle is found in haystack
 */
export function partialMatch(needle: string, haystack: string): boolean {
  const normalizedNeedle = normalizeHeader(needle);
  const normalizedHaystack = normalizeHeader(haystack);
  
  return normalizedHaystack.includes(normalizedNeedle);
}

/**
 * Normalize header string for comparison
 * @param header Header string to normalize
 * @returns Normalized header string
 */
export function normalizeHeader(header: string): string {
  if (!header) return '';
  
  return header
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')     // Replace multiple spaces with single space
    .replace(/\b(the|a|an)\b/g, '') // Remove common articles
    .trim();
}

/**
 * Generate common variations of a header
 * @param header Original header string
 * @returns Array of header variations
 */
export function getHeaderVariations(header: string): string[] {
  const variations = new Set<string>();
  const normalized = normalizeHeader(header);
  
  // Add original normalized version
  variations.add(normalized);
  
  // Add version without spaces
  variations.add(normalized.replace(/\s/g, ''));
  
  // Add version with underscores
  variations.add(normalized.replace(/\s/g, '_'));
  
  // Add version with hyphens
  variations.add(normalized.replace(/\s/g, '-'));
  
  // Add version with camelCase
  const camelCase = normalized
    .split(' ')
    .map((word, index) => 
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('');
  variations.add(camelCase);
  
  // Add abbreviated versions
  const words = normalized.split(' ');
  if (words.length > 1) {
    const abbreviated = words.map(word => word.charAt(0)).join('');
    variations.add(abbreviated);
    
    // Add partial abbreviations
    if (words.length === 2) {
      variations.add(words[0] + words[1].charAt(0));
      variations.add(words[0].charAt(0) + words[1]);
    }
  }
  
  // Add common abbreviations
  const abbreviations: Record<string, string[]> = {
    'number': ['no', 'num', 'nbr'],
    'name': ['nm', 'nme'],
    'mobile': ['mob', 'mbl'],
    'client': ['clnt', 'cust'],
    'address': ['addr', 'add'],
    'date': ['dt', 'dte'],
    'status': ['stat', 'sts'],
    'amount': ['amt', 'qty'],
    'email': ['eml', 'mail'],
    'phone': ['ph', 'tel']
  };
  
  Object.entries(abbreviations).forEach(([full, abbrs]) => {
    if (normalized.includes(full)) {
      abbrs.forEach(abbr => {
        variations.add(normalized.replace(full, abbr));
      });
    }
  });
  
  return Array.from(variations).filter(v => v.length > 0);
}

/**
 * Find best fuzzy match for a header
 * @param header Header to match
 * @param candidates Array of candidate headers
 * @param threshold Minimum similarity threshold (default: 0.7)
 * @returns Best match with score, or null if no good match
 */
export function findBestFuzzyMatch(
  header: string, 
  candidates: string[], 
  threshold: number = 0.7
): { match: string; score: number } | null {
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const candidate of candidates) {
    const score = calculateSimilarity(header, candidate);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }
  
  return bestMatch ? { match: bestMatch, score: bestScore } : null;
}

/**
 * Check if two headers are similar enough to be considered the same
 * @param header1 First header
 * @param header2 Second header
 * @param threshold Similarity threshold (default: 0.8)
 * @returns True if headers are similar
 */
export function areHeadersSimilar(header1: string, header2: string, threshold: number = 0.8): boolean {
  return calculateSimilarity(header1, header2) >= threshold;
}

/**
 * Extract keywords from header for better matching
 * @param header Header string
 * @returns Array of keywords
 */
export function extractKeywords(header: string): string[] {
  const normalized = normalizeHeader(header);
  const keywords = normalized.split(' ').filter(word => word.length > 1);
  
  // Add common variations
  const variations = new Set(keywords);
  keywords.forEach(keyword => {
    const headerVariations = getHeaderVariations(keyword);
    headerVariations.forEach(variation => variations.add(variation));
  });
  
  return Array.from(variations);
}

/**
 * Calculate weighted similarity score considering partial matches
 * @param str1 First string
 * @param str2 Second string
 * @returns Weighted similarity score
 */
export function calculateWeightedSimilarity(str1: string, str2: string): number {
  const similarity = calculateSimilarity(str1, str2);
  const partial = partialMatch(str1, str2) || partialMatch(str2, str1);
  
  // Boost score if partial match exists
  return partial ? Math.min(1.0, similarity + 0.2) : similarity;
}
