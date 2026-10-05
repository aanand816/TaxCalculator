// api/geocode.js
// Vercel serverless function: address -> coordinates using Nominatim.
// No API key is required for Nominatim.

const NORTHWESTERN_ONTARIO = {
  west: -95.5,
  east: -89.0,
  south: 48.0,
  north: 54.5
};

const CACHE = new Map();

module.exports = async (req, res) => {
  const text = String(req.query?.text || '').trim();

  if (text.length < 5) {
    return res.status(400).json({
      error: 'Address is too short. Enter a fuller address, including the town.'
    });
  }

  const cacheKey = text.toLowerCase();

  if (CACHE.has(cacheKey)) {
    return res.status(200).json({ results: CACHE.get(cacheKey) });
  }

  const params = new URLSearchParams({
    q: text,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
    countrycodes: 'ca',
    viewbox: [
      NORTHWESTERN_ONTARIO.west,
      NORTHWESTERN_ONTARIO.north,
      NORTHWESTERN_ONTARIO.east,
      NORTHWESTERN_ONTARIO.south
    ].join(','),
    bounded: '1'
  });

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          'User-Agent': 'FortFrancesWindowLabourCalculator/1.0 (contact: your-email@example.com)',
          'Accept-Language': 'en'
        }
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: `Address service error (${response.status}). Try again, or paste coordinates manually.`
      });
    }

    const data = await response.json();

    const results = data
      .map(item => {
        const lat = Number(item.lat);
        const lon = Number(item.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        if (!isInNorthwesternOntario(lat, lon)) return null;

        return {
          label: item.display_name,
          lat,
          lon,
          category: item.category || item.class || '',
          type: item.type || '',
          // Nominatim does not use Pelias's match_type; use its own fields.
          matchType: item.category || item.class || '',
          precise: isPreciseNominatim(item)
        };
      })
      .filter(Boolean);

    if (!results.length) {
      return res.status(404).json({
        error:
          'No valid address found in Northwestern Ontario. Add the town name, or paste coordinates from Google Maps.'
      });
    }

    CACHE.set(cacheKey, results);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Nominatim geocode failed:', error);

    return res.status(502).json({
      error: 'Address service is unavailable. Try again, or paste coordinates manually.'
    });
  }
};

function isInNorthwesternOntario(lat, lon) {
  return (
    lat >= NORTHWESTERN_ONTARIO.south &&
    lat <= NORTHWESTERN_ONTARIO.north &&
    lon >= NORTHWESTERN_ONTARIO.west &&
    lon <= NORTHWESTERN_ONTARIO.east
  );
}

function isPreciseNominatim(item) {
  // House-level results are precise. Street, town, and area results are not.
  const preciseCategories = new Set(['building', 'place']);
  const preciseTypes = new Set([
    'house',
    'residential',
    'apartments',
    'detached',
    'semidetached_house',
    'terrace',
    'commercial',
    'retail',
    'industrial',
    'office'
  ]);

  return (
    preciseCategories.has(item.category || item.class) ||
    preciseTypes.has(item.type)
  );
}
