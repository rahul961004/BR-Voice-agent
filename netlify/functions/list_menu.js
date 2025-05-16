// Use CommonJS require for Netlify compatibility
const axios = require('axios');

// Square API Configuration
const SQUARE_API_URL = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2025-03-19';

exports.handler = async function(event) {
  // Enhanced logging for comprehensive debugging
  console.log('List Menu Function - Detailed Diagnostics', {
    timestamp: new Date().toISOString(),
    method: event.httpMethod,
    headers: JSON.stringify(event.headers),
    environment: process.env.NODE_ENV
  });

  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Validate HTTP Method
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method Not Allowed',
        details: `Received ${event.httpMethod}, expected GET`
      })
    };
  }

  try {
    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    
    if (!SQUARE_ACCESS_TOKEN) {
      throw new Error('Missing Square API credentials');
    }

    console.log('Fetching catalog items from Square...');

    // Fetch catalog items using axios
    const response = await axios.get(`${SQUARE_API_URL}/catalog/list`, {
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        types: 'ITEM,MODIFIER_LIST'
      }
    });

    const catalogObjects = response.data.objects || [];
    console.log(`Found ${catalogObjects.length} catalog objects`);

    // Transform items to required format for both website and ElevenLabs agent
    const menuItems = catalogObjects
      .filter(item => item.type === 'ITEM')
      .map(item => {
        const itemData = item.item_data || {};
        const variations = itemData.variations || [];
        
        const defaultVariation = variations[0]?.item_variation_data || {};
        const priceMoney = defaultVariation.price_money || {};
        
        return {
          id: item.id,
          item_data: {
            name: itemData.name || '',
            description: itemData.description || '',
            variations: variations.map(v => ({
              id: v.id,
              name: v.item_variation_data?.name || '',
              price_money: v.item_variation_data?.price_money || {
                amount: 0,
                currency: 'CAD'
              }
            })),
            modifier_list_info: itemData.modifier_list_info || [],
            price: priceMoney.amount || 0,
            currency: priceMoney.currency || 'CAD'
          }
        };
      });

    // Get modifier lists
    const modifierLists = catalogObjects
      .filter(obj => obj.type === 'MODIFIER_LIST')
      .map(list => ({
        id: list.id,
        modifier_list_data: list.modifier_list_data
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        items: menuItems,
        modifier_lists: modifierLists
      })
    };

  } catch (error) {
    console.error('Menu Retrieval Error:', {
      message: error.message,
      response: error.response?.data
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to retrieve menu',
        message: error.message,
        details: 'Check server logs for more information'
      })
    };
  }
};
