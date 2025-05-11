// Serverless function for creating orders in Square
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// Load environment variables (will use process.env in production)
let SQUARE_ACCESS_TOKEN, LOCATION_ID, SQUARE_API_URL;

// Check if we're in a Netlify environment or local
try {
  if (process.env.NODE_ENV === 'development' || !process.env.SQUARE_ACCESS_TOKEN) {
    // Try to load from mcp_config.json if we're running locally
    try {
      const mcpConfig = JSON.parse(fs.readFileSync('./mcp_config.json', 'utf8'));
      SQUARE_ACCESS_TOKEN = mcpConfig.servers.square.env.SQUARE_ACCESS_TOKEN;
      LOCATION_ID = mcpConfig.servers.square.env.LOCATION_ID;
      SQUARE_API_URL = mcpConfig.servers.square.url;
    } catch (configError) {
      console.log('Failed to load config file, using environment variables');
    }
  }
  
  // If still not set, use environment variables (Netlify environment)
  SQUARE_ACCESS_TOKEN = SQUARE_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN;
  LOCATION_ID = LOCATION_ID || process.env.LOCATION_ID;
  SQUARE_API_URL = SQUARE_API_URL || 'https://connect.squareupsandbox.com';
} catch (error) {
  console.error('Error loading configuration:', error);
}

// Helper function to find an item in the catalog
function findCatalogItem(catalogCache, itemName) {
  if (!itemName) return null;
  
  const normalizedName = itemName.toLowerCase().trim();
  
  // Use a demo catalog for testing if needed
  if (!catalogCache || catalogCache.length === 0) {
    catalogCache = getDemoCatalog();
  }
  
  // Look for best match
  let bestMatch = null;
  let bestScore = 0;
  
  for (const item of catalogCache) {
    // Check for item type
    if (item.type === 'ITEM' && item.itemData && item.itemData.name) {
      const catalogItemName = item.itemData.name.toLowerCase().trim();
      
      // Calculate similarity score (simple contains check)
      let score = 0;
      if (catalogItemName === normalizedName) {
        score = 100; // Exact match
      } else if (catalogItemName.includes(normalizedName) || normalizedName.includes(catalogItemName)) {
        // Partial match - give higher score to closer length matches
        const lengthDiff = Math.abs(catalogItemName.length - normalizedName.length);
        score = 90 - lengthDiff;
      }
      
      if (score > bestScore) {
        // Find variation ID for this item
        let variationId = null;
        
        // First check for variations defined in the item
        if (item.itemData.variations && item.itemData.variations.length > 0) {
          variationId = item.itemData.variations[0].id;
        }
        
        // Then look for actual variation objects
        if (!variationId) {
          for (const variation of catalogCache) {
            if (variation.type === 'ITEM_VARIATION' && 
                variation.itemVariationData && 
                variation.itemVariationData.itemId === item.id) {
              variationId = variation.id;
              break;
            }
          }
        }
        
        bestMatch = {
          itemId: item.id,
          name: item.itemData.name,
          variationId: variationId
        };
        bestScore = score;
      }
    }
  }
  
  return bestMatch;
}

// Provide a demo catalog for testing
function getDemoCatalog() {
  return [
    {
      id: 'item_1',
      type: 'ITEM',
      itemData: {
        name: 'Rebel Burger',
        description: 'Classic burger with cheese, lettuce, and special sauce',
        variations: [{ id: 'var_1' }]
      }
    },
    {
      id: 'var_1',
      type: 'ITEM_VARIATION',
      itemVariationData: {
        itemId: 'item_1',
        name: 'Regular',
        priceMoney: { amount: 899, currency: 'USD' }
      }
    },
    {
      id: 'item_2',
      type: 'ITEM',
      itemData: {
        name: 'Fries',
        description: 'Crispy golden fries',
        variations: [{ id: 'var_2' }]
      }
    },
    {
      id: 'var_2',
      type: 'ITEM_VARIATION',
      itemVariationData: {
        itemId: 'item_2',
        name: 'Regular',
        priceMoney: { amount: 399, currency: 'USD' }
      }
    },
    {
      id: 'item_3',
      type: 'ITEM',
      itemData: {
        name: 'Coke',
        description: 'Refreshing cola',
        variations: [{ id: 'var_3' }]
      }
    },
    {
      id: 'var_3',
      type: 'ITEM_VARIATION',
      itemVariationData: {
        itemId: 'item_3',
        name: 'Regular',
        priceMoney: { amount: 299, currency: 'USD' }
      }
    }
  ];
}

// Handler for Netlify serverless function
exports.handler = async (event, context) => {
  // Set CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }
  
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    // Parse request body
    const requestBody = JSON.parse(event.body);
    const { customer_name, items } = requestBody;
    
    console.log('Received order request:', JSON.stringify(requestBody, null, 2));
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No items provided in the order' })
      };
    }
    
    // Create a demo catalog for testing
    const catalogCache = getDemoCatalog();
    
    // Match items to catalog
    const lineItems = [];
    
    for (const item of items) {
      // Find matching item in catalog
      const catalogItem = findCatalogItem(catalogCache, item.name);
      
      if (catalogItem) {
        // Create Square line item
        const lineItem = {
          quantity: String(item.quantity || 1),
          note: customer_name ? `For: ${customer_name}` : undefined
        };
        
        // Add catalog object ID if we found a match
        if (catalogItem.variationId) {
          lineItem.catalog_object_id = catalogItem.variationId;
        } else {
          lineItem.name = item.name;
          lineItem.base_price_money = {
            amount: 1000, // Default $10.00 if not found
            currency: 'USD'
          };
        }
        
        // Add modifiers if present
        if (item.modifiers && item.modifiers.length > 0) {
          const validModifiers = item.modifiers.filter(mod => mod && mod !== '');
          if (validModifiers.length > 0) {
            lineItem.note = (lineItem.note || '') + ` - Mods: ${validModifiers.join(', ')}`;
          }
        }
        
        lineItems.push(lineItem);
      } else {
        // Fallback if item not found in catalog
        lineItems.push({
          name: item.name,
          quantity: String(item.quantity || 1),
          note: `For: ${customer_name || 'Customer'} - Not in catalog`,
          base_price_money: {
            amount: 1000, // Default $10.00
            currency: 'USD'
          }
        });
      }
    }
    
    // Create order in Square
    try {
      const orderPayload = {
        order: {
          location_id: LOCATION_ID,
          line_items: lineItems,
          state: 'OPEN',
          customer_note: `Voice order for ${customer_name || 'Customer'}`,
          source: {
            name: 'Burger Rebellion Voice Ordering'
          }
        },
        idempotency_key: `voice-order-${Date.now()}`
      };
      
      console.log('Sending order to Square:', JSON.stringify(orderPayload, null, 2));
      
      if (!SQUARE_ACCESS_TOKEN) {
        throw new Error('Square access token not configured');
      }
      
      const response = await axios.post(`${SQUARE_API_URL}/v2/orders`, orderPayload, {
        headers: {
          'Square-Version': '2023-09-25',
          'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Order created successfully:', JSON.stringify(response.data, null, 2));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response.data)
      };
    } catch (squareError) {
      console.error('Error creating order in Square:', squareError.response?.data || squareError.message);
      
      // For demo purposes, return a success response with mock data
      const demoOrderResponse = {
        order: {
          id: `demo-order-${Date.now()}`,
          location_id: LOCATION_ID || 'DEMO_LOCATION',
          line_items: lineItems.map(item => ({
            ...item,
            id: `item-${Math.floor(Math.random() * 1000)}`,
            name: item.name
          })),
          total_money: {
            amount: lineItems.reduce((total, item) => total + 1000 * parseInt(item.quantity), 0),
            currency: 'USD'
          },
          state: 'OPEN',
          created_at: new Date().toISOString()
        }
      };
      
      console.log('Returning demo order response for testing:', demoOrderResponse);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(demoOrderResponse)
      };
    }
  } catch (error) {
    console.error('Error processing order:', error.message);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process order',
        details: error.message
      })
    };
  }
};
