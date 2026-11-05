let pendingNewsArticleId: string | null = null;

export function requestNewsArticle(articleId: string) {
  pendingNewsArticleId = articleId;
}

export function peekPendingNewsArticle(): string | null {
  return pendingNewsArticleId;
}

export function clearPendingNewsArticle(articleId: string) {
  if (pendingNewsArticleId === articleId) pendingNewsArticleId = null;
}
