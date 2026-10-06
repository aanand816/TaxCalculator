// api/geocode.js
// Vercel serverless function: address -> coordinates using Geocoder.ca.
// Works with the free (throttled) port. If GEOCODER_CA_AUTH is set in Vercel,
// the token is added automatically. The token never reaches the browser.

const cache = new Map();

module.exports = async (req, res) => {
  const text = String(req.query?.text || '').trim();

  if (text.length < 5) {
    return res.status(400).json({
      error: 'Address is too short. Include the street and town.'
    });
  }

  const auth = String(process.env.GEOCODER_CA_AUTH || '')
    .trim()
    .replace(/^["']|["']$/g, '');

  const cacheKey = text.toLowerCase();

  if (cache.has(cacheKey)) {
    return res.status(200).json({ results: cache.get(cacheKey) });
  }

  const params = new URLSearchParams({
    locate: text,
    geoit: 'XML',
    json: '1',
    standard: '1',
    showpostal: '1',
    region: 'ON'
  });

  if (auth) params.set('auth', auth);

  try {
    const response = await fetch(`https://geocoder.ca/?${params.toString()}`);

    if (!response.ok) {
      return res.status(502).json({
        error:
          `Geocoder.ca returned ${response.status}. ` +
          'Try again or paste coordinates manually.'
      });
    }

    const raw = await response.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseError) {
      console.error('Geocoder.ca non-JSON response:', raw.slice(0, 300));
      return res.status(502).json({
        error:
          'Geocoder.ca returned an unreadable response. ' +
          'Paste coordinates manually.'
      });
    }

    if (data.error) {
      const errCode = String(
        (typeof data.error === 'object' ? data.error.code : data.error) || ''
      );
      const errText =
        typeof data.error === 'object' ? data.error.description || '' : '';

      console.error('Geocoder.ca error:', errCode, errText);

      if (errCode === '001') {
        return res.status(502).json({
          error:
            'Geocoder.ca rejected this server IP. Remove the IP restriction on your token.'
        });
      }

      if (errCode === '002') {
        return res.status(502).json({
          error: 'Geocoder.ca credits are used up. Paste coordinates manually.'
        });
      }

      if (errCode === '003') {
        return res.status(502).json({
          error:
            'Geocoder.ca token not found. Check GEOCODER_CA_AUTH in Vercel.'
        });
      }

      return res.status(404).json({
        error:
          'No match found. Add the town name or paste coordinates manually.'
      });
    }

    const std = data.standard || data;

    const lat = Number(data.latt);
    const lon = Number(data.longt);
    const confidence = Number(std.confidence ?? data.confidence);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat === 0 ||
      lon === 0
    ) {
      return res.status(404).json({
        error:
          'No match found. Add the town name or paste coordinates manually.'
      });
    }

    if (!isInNorthwesternOntario(lat, lon)) {
      return res.status(404).json({
        error:
          'The result is outside Northwestern Ontario. ' +
          'Check the town name or paste coordinates manually.'
      });
    }

    const label =
      [std.stnumber, std.staddress, std.city, std.prov, std.postal]
        .filter(Boolean)
        .join(' ') || text;

    const results = [
      {
        label,
        lat,
        lon,
        precise: Boolean(std.stnumber) && confidence >= 0.8,
        confidence: Number.isFinite(confidence) ? confidence : null
      }
    ];

    if (data.remaining_credits !== undefined) {
      console.log('Geocoder.ca remaining credits:', data.remaining_credits);
    }

    cache.set(cacheKey, results);

    res.setHeader(
      'Cache-Control',
      's-maxage=3600, stale-while-revalidate=86400'
    );

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Geocoder.ca request failed:', error);

    return res.status(502).json({
      error:
        'The address service is unavailable. ' +
        'Try again or paste coordinates manually.'
    });
  }
};

function isInNorthwesternOntario(lat, lon) {
  return lat >= 48.0 && lat <= 54.5 && lon >= -95.5 && lon <= -89.0;
}
