const { square } = require('../shared/squareClient');

// CORS Headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  console.log('Search Items Function - Request:', {
    timestamp: new Date().toISOString(),
    method: event.httpMethod,
    body: event.body
  });

  try {
    const { text_filter, enabled_location_ids, limit } = JSON.parse(event.body || '{}');
    const response = await square.catalogApi.searchCatalogObjects({
      objectTypes: ['ITEM'],
      query: {
        prefixQuery: {
          attributeName: 'name',
          attributePrefix: text_filter
        }
      },
      limit: limit ?? 5,
      locationIds: enabled_location_ids
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ objects: response.result.objects || [] })
    };

  } catch (err) {
    console.error('Error searching items:', err);
    return {
      statusCode: err.statusCode || 500,
      headers,
      body: JSON.stringify({ 
        error: err.message || String(err),
        details: err.response?.data || {}
      })
    };
  }
};
