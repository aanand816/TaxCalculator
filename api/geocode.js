// api/geocode.js
// Vercel serverless function: address -> coordinates using Geoapify.
// Keeps GEOAPIFY_API_KEY off the frontend.

const cache = new Map();

module.exports = async (req, res) => {
  const text = String(req.query?.text || '').trim();

  if (text.length < 5) {
    return res.status(400).json({
      error: 'Address is too short. Include the street and town.'
    });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        'Server is missing GEOAPIFY_API_KEY. Paste coordinates manually.'
    });
  }

  const cacheKey = text.toLowerCase();

  if (cache.has(cacheKey)) {
    return res.status(200).json({
      results: cache.get(cacheKey)
    });
  }

  const params = new URLSearchParams({
    text,
    apiKey,
    limit: '5',
    filter: 'countrycode:ca',
    bias: 'proximity:-93.4,49.2'
  });

  try {
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/search?${params.toString()}`
    );

    if (!response.ok) {
      return res.status(502).json({
        error:
          `Geoapify returned ${response.status}. ` +
          'Try again or paste coordinates manually.'
      });
    }

    const data = await response.json();

    const results = (data.features || [])
      .map(feature => {
        const lon = feature.geometry?.coordinates?.[0];
        const lat = feature.geometry?.coordinates?.[1];

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }

        if (!isInNorthwesternOntario(lat, lon)) {
          return null;
        }

        return {
          label:
            feature.properties?.formatted ||
            feature.properties?.name ||
            text,
          lat,
          lon,
          precise: Boolean(
            feature.properties?.housenumber ||
            feature.properties?.rank?.confidence >= 0.8
          )
        };
      })
      .filter(Boolean);

    if (!results.length) {
      return res.status(404).json({
        error:
          'No valid location was found in Northwestern Ontario. ' +
          'Add the town name or paste coordinates manually.'
      });
    }

    cache.set(cacheKey, results);

    res.setHeader(
      'Cache-Control',
      's-maxage=3600, stale-while-revalidate=86400'
    );

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Geoapify geocode error:', error);

    return res.status(502).json({
      error:
        'The address service is unavailable. ' +
        'Try again or paste coordinates manually.'
    });
  }
};

function isInNorthwesternOntario(lat, lon) {
  return (
    lat >= 48.0 &&
    lat <= 54.5 &&
    lon >= -95.5 &&
    lon <= -89.0
  );
}
