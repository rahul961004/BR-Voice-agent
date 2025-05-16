// Use CommonJS require for Netlify compatibility
const axios = require('axios');

// Square API Configuration
const SQUARE_API_URL = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2025-03-19';

// CORS Headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  // Enhanced logging
  console.log('List Menu Function - Request:', {
    timestamp: new Date().toISOString(),
    method: event.httpMethod,
    path: event.path,
    headers: event.headers
  });

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    if (!SQUARE_ACCESS_TOKEN) {
      throw new Error('Missing Square API credentials');
    }

    // Call Square API
    const response = await axios.get(`${SQUARE_API_URL}/catalog/list`, {
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`
      },
      params: {
        types: 'ITEM'
      }
    });

    const items = response.data.objects || [];
    console.log(`Retrieved ${items.length} items from Square`);

    // For n8n webhook: return formatted Square response
    if (event.path.includes('webhook-test')) {
      // Filter out $0 items and non-food items
      const menuItems = items.filter(item => 
        item.item_data?.variations?.[0]?.item_variation_data?.price_money?.amount > 0 &&
        !['DELIVERY FEE', 'Room Rental', 'Team Chips Kickback', 'Toque'].includes(item.item_data?.name)
      );

      const formattedItems = menuItems.map(item => ({
        catalog_object_id: item.id,
        variation_id: item.item_data?.variations?.[0]?.id || '',
        name: item.item_data?.name || '',
        description: item.item_data?.description || '',
        price: item.item_data?.variations?.[0]?.item_variation_data?.price_money?.amount || 0,
        currency: item.item_data?.variations?.[0]?.item_variation_data?.price_money?.currency || 'CAD'
      }));
      
      // Add variation_id if missing
      formattedItems.forEach(item => {
        if (!item.variation_id) {
          item.variation_id = item.catalog_object_id;
        }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          items: formattedItems,
          success: true
        })
      };
    }

    // For website: return formatted menu items
    const menuItems = items.map(item => ({
      id: item.id,
      name: item.item_data?.name || '',
      description: item.item_data?.description || '',
      price: item.item_data?.variations?.[0]?.item_variation_data?.price_money?.amount || 0,
      currency: item.item_data?.variations?.[0]?.item_variation_data?.price_money?.currency || 'USD'
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(menuItems)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: error.response?.status || 500,
      headers,
      body: JSON.stringify({
        error: 'Operation failed',
        message: error.message,
        details: error.response?.data
      })
    };
  }
};
