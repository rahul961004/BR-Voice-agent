const axios = require('axios');

// Square API Configuration
const SQUARE_API_URL = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2025-03-19';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  // Log incoming request
  console.log('Webhook Search - Request:', {
    path: event.path,
    method: event.httpMethod,
    body: event.body
  });

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    let requestBody = {};
    try {
      requestBody = JSON.parse(event.body || '{}');
      console.log('Parsed request body:', requestBody);
    } catch (e) {
      console.error('Failed to parse request body:', e);
    }

    // Extract search term from ElevenLabs format
    const searchTerm = requestBody.text || requestBody.search_term || '';
    console.log('Searching for:', searchTerm);

    // Get Square credentials
    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    if (!SQUARE_ACCESS_TOKEN) {
      throw new Error('Missing Square API credentials');
    }

    // Search Square catalog
    const response = await axios.post(`${SQUARE_API_URL}/catalog/search`, 
    {
      object_types: ["ITEM"],
      query: {
        text_query: {
          keywords: [searchTerm]
        }
      }
    }, 
    {
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const items = response.data.objects || [];
    
    // Format response for ElevenLabs
    const formattedItems = items.map(item => ({
      name: item.item_data?.name || '',
      description: item.item_data?.description || '',
      price: {
        amount: item.item_data?.variations?.[0]?.item_variation_data?.price_money?.amount || 0,
        currency: item.item_data?.variations?.[0]?.item_variation_data?.price_money?.currency || 'USD'
      }
    }));

    console.log('Found items:', formattedItems);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        matches: formattedItems  // Using 'matches' key as expected by ElevenLabs
      })
    };

  } catch (error) {
    console.error('Webhook search error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to search catalog',
        message: error.message,
        details: error.response?.data || 'Check server logs for details'
      })
    };
  }
};
