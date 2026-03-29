'use strict';

const axios = require('axios');
const RssParser = require('rss-parser');

const rss = new RssParser({ timeout: 8000 });

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','will','would',
  'could','should','may','might','can','do','does','did','have','has','had',
  'this','that','these','those','it','its','as','up','out','if','about',
  'into','through','during','before','after','above','below','between',
  'what','which','who','whom','when','where','why','how','all','each',
  'both','few','more','most','other','some','such','no','nor','not','only',
  'own','same','so','than','too','very','just','don','t','s','re','ve','ll',
]);

function extractKeywords(question, maxWords = 5) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, maxWords)
    .join(' ');
}

/** NewsAPI.org */
async function fetchNewsAPI(keywords) {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];
  try {
    const res = await axios.get('https://newsapi.org/v2/everything', {
      params: { q: keywords, pageSize: 10, sortBy: 'publishedAt', language: 'en' },
      headers: { 'X-Api-Key': key },
      timeout: 8000,
    });
    return (res.data.articles || []).map(a => ({
      title: a.title,
      description: a.description || '',
      publishedAt: a.publishedAt,
      source: 'NewsAPI',
    }));
  } catch (err) {
    console.warn(`[news] NewsAPI error: ${err.message}`);
    return [];
  }
}

/** Google News RSS */
async function fetchGoogleNews(keywords) {
  try {
    const encoded = encodeURIComponent(keywords);
    const feed = await rss.parseURL(`https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`);
    return (feed.items || []).slice(0, 10).map(item => ({
      title: item.title,
      description: item.contentSnippet || item.summary || '',
      publishedAt: item.pubDate,
      source: 'Google News',
    }));
  } catch (err) {
    console.warn(`[news] Google News RSS error: ${err.message}`);
    return [];
  }
}

/** CoinDesk RSS (for crypto/finance markets) */
async function fetchCoinDeskRSS(keywords) {
  try {
    const feed = await rss.parseURL('https://www.coindesk.com/arc/outboundfeeds/rss/');
    const kw = keywords.toLowerCase().split(' ');
    return (feed.items || [])
      .filter(item => kw.some(k => (item.title || '').toLowerCase().includes(k)))
      .slice(0, 5)
      .map(item => ({
        title: item.title,
        description: item.contentSnippet || '',
        publishedAt: item.pubDate,
        source: 'CoinDesk',
      }));
  } catch (err) {
    console.warn(`[news] CoinDesk RSS error: ${err.message}`);
    return [];
  }
}

/** Reuters RSS */
async function fetchReutersRSS(keywords) {
  try {
    const feed = await rss.parseURL('https://feeds.reuters.com/reuters/topNews');
    const kw = keywords.toLowerCase().split(' ');
    return (feed.items || [])
      .filter(item => kw.some(k => (item.title || '').toLowerCase().includes(k)))
      .slice(0, 5)
      .map(item => ({
        title: item.title,
        description: item.contentSnippet || '',
        publishedAt: item.pubDate,
        source: 'Reuters',
      }));
  } catch (err) {
    console.warn(`[news] Reuters RSS error: ${err.message}`);
    return [];
  }
}

/**
 * Fetch 10-15 deduplicated articles for a market question.
 * Returns { articles, confidence, keywords }
 */
async function fetchNewsForMarket(question, category = '') {
  const keywords = extractKeywords(question);

  const isCrypto = ['crypto', 'finance'].includes(category.toLowerCase());

  const [newsApi, google, coindesk, reuters] = await Promise.all([
    fetchNewsAPI(keywords),
    fetchGoogleNews(keywords),
    isCrypto ? fetchCoinDeskRSS(keywords) : Promise.resolve([]),
    fetchReutersRSS(keywords),
  ]);

  // Merge + deduplicate by title
  const allArticles = [...newsApi, ...google, ...coindesk, ...reuters];
  const seenTitles = new Set();
  const deduped = allArticles.filter(a => {
    if (!a.title) return false;
    const key = a.title.toLowerCase().trim().slice(0, 60);
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  // Sort by date descending
  deduped.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const top = deduped.slice(0, 12);

  const confidence = top.length === 0 ? 'low' : top.length < 5 ? 'medium' : 'high';

  return { articles: top, confidence, keywords };
}

module.exports = { fetchNewsForMarket, extractKeywords };
