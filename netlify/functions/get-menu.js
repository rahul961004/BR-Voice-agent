const axios = require('axios');
require('dotenv').config();

// Square API constants
const SQUARE_API_URL = 'https://connect.squareup.com/v2';
const SQUARE_API_VERSION = '2025-03-19';
const LOCATION_ID = process.env.SQUARE_LOCATION_ID;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }
  
  try {
    const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
    
    if (!SQUARE_ACCESS_TOKEN) {
      throw new Error('Missing Square API credentials');
    }
    
    console.log('Fetching catalog items from Square...');
    
    // Fetch catalog items
    const response = await axios.get(`${SQUARE_API_URL}/catalog/list`, {
      headers: {
        'Square-Version': SQUARE_API_VERSION,
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        types: 'ITEM',
        location_id: LOCATION_ID
      },
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });
    
    console.log(`Found ${response.data.objects?.length || 0} catalog objects`);
    
    // Process catalog items into a menu format
    const menuItems = (response.data.objects || [])
      .filter(item => item.type === 'ITEM')
      .map(item => {
        const itemData = item.item_data || {};
        const variations = itemData.variations || [];
        
        let price = 0;
        let currency = 'CAD';
        
        if (variations.length > 0) {
          const variation = variations[0];
          if (variation.id && variation.item_variation_data) {
            const priceData = variation.item_variation_data.price_money;
            if (priceData) {
              price = priceData.amount || 0;
              currency = priceData.currency || 'CAD';
            }
          }
        }
        
        return {
          id: item.id,
          name: itemData.name,
          description: itemData.description || '',
          price: price,
          currency: currency,
          variations: variations.map(v => ({
            id: v.id,
            name: v.item_variation_data?.name || '',
            price: v.item_variation_data?.price_money?.amount || 0
          }))
        };
      });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        menu_items: menuItems 
      })
    };
  } catch (error) {
    console.error('Error fetching menu:', error);
    return {
      statusCode: 200, // Always return 200 for easier frontend handling
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to fetch menu' 
      })
    };
  }
};
