const NORTHWESTERN_ONTARIO = {
  west: -95.5,
  east: -89.0,
  south: 48.0,
  north: 54.5
};

const cache = new Map();

module.exports = async (req, res) => {
  const text = String(req.query?.text || '').trim();

  if (text.length < 5) {
    return res.status(400).json({
      error: 'Address is too short. Include the street and town.'
    });
  }

  const cacheKey = text.toLowerCase();

  if (cache.has(cacheKey)) {
    return res.status(200).json({
      results: cache.get(cacheKey)
    });
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
          'User-Agent':
            'FortFrancesWindowLabourCalculator/1.0 (contact: aanandsaini816@gmail.com)',
          'Accept-Language': 'en-CA'
        }
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error:
          `Nominatim returned ${response.status}. ` +
          'Try again or paste coordinates manually.'
      });
    }

    const data = await response.json();

    const results = data
      .map(item => {
        const lat = Number(item.lat);
        const lon = Number(item.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }

        if (!isNorthwesternOntario(lat, lon)) {
          return null;
        }

        return {
          label: item.display_name,
          lat,
          lon,
          precise: Boolean(
            item.address?.house_number &&
            (
              item.address?.road ||
              item.address?.pedestrian ||
              item.address?.residential
            )
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
    console.error('Nominatim error:', error);

    return res.status(502).json({
      error:
        'The address service is unavailable. ' +
        'Try again or paste coordinates manually.'
    });
  }
};

function isNorthwesternOntario(lat, lon) {
  return (
    lat >= NORTHWESTERN_ONTARIO.south &&
    lat <= NORTHWESTERN_ONTARIO.north &&
    lon >= NORTHWESTERN_ONTARIO.west &&
    lon <= NORTHWESTERN_ONTARIO.east
  );
}
