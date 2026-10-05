// api/route.js
// Vercel serverless function: closest office by driving distance using ORS.

const OFFICES = [
  { name: 'Fort Frances', lon: -93.4108, lat: 48.6094 },
  { name: 'Kenora', lon: -94.4894, lat: 49.7667 },
  { name: 'Dryden', lon: -92.8370, lat: 49.7830 },
  { name: 'Sioux Lookout', lon: -91.9170, lat: 50.0997 }
];

const MATRIX_URLS = [
  'https://api.heigit.org/openrouteservice/v2/matrix/driving-car',
  'https://api.openrouteservice.org/v2/matrix/driving-car'
];

module.exports = async (req, res) => {
  const rawKey = process.env.ORS_API_KEY;

  if (!rawKey) {
    return res.status(500).json({
      error: 'Server is missing ORS_API_KEY. Enter km and hours manually.'
    });
  }

  const key = rawKey.trim().replace(/^["']|["']$/g, '');

  const lon = Number(req.query?.lon);
  const lat = Number(req.query?.lat);

  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 90
  ) {
    return res.status(400).json({ error: 'Bad coordinates.' });
  }

  const body = JSON.stringify({
    locations: [
      ...OFFICES.map(office => [office.lon, office.lat]),
      [lon, lat]
    ],
    sources: OFFICES.map((_, index) => index),
    destinations: [OFFICES.length],
    metrics: ['distance', 'duration'],
    units: 'km'
  });

  let lastError = null;

  for (const url of MATRIX_URLS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: key,
          'Content-Type': 'application/json'
        },
        body
      });

      if (!response.ok) {
        const errorText = await response.text();

        lastError = {
          status: response.status,
          text: errorText.slice(0, 300),
          url
        };

        console.error('ORS matrix failed:', lastError);

        if (response.status !== 403 && response.status < 500) break;

        continue;
      }

      const data = await response.json();

      let best = null;

      OFFICES.forEach((office, index) => {
        const km = data.distances?.[index]?.[0];
        const seconds = data.durations?.[index]?.[0];

        if (
          typeof km === 'number' &&
          typeof seconds === 'number' &&
          (!best || km < best.km)
        ) {
          best = {
            office: office.name,
            km,
            seconds
          };
        }
      });

      if (!best) {
        return res.status(422).json({
          error:
            'No driving route was found from any office. Enter km and hours manually.'
        });
      }

      return res.status(200).json(best);
    } catch (error) {
      lastError = {
        status: 0,
        text: String(error?.message || error),
        url
      };

      console.error('ORS matrix request failed:', lastError);
    }
  }

  const status = lastError?.status || 0;

  const hint =
    status === 403
      ? 'ORS refused the API key (403). Check ORS_API_KEY in Vercel.'
      : status === 429
        ? 'Too many ORS requests right now (429). Wait a minute and try again.'
        : `Routing service error (${status || 'network'}).`;

  return res.status(502).json({
    error: `${hint} Enter km and hours manually.`,
    detail: lastError
  });
};
