// Serverless function for creating orders in Square using official SDK
const { SquareClient, SquareEnvironment, SquareError } = require('square');
const fs = require('fs');
require('dotenv').config();

// Initialize Square client (will use either local config or environment variables)
let LOCATION_ID;
let squareClient;

// Set up the Square client with proper configuration
try {
  // First try environment variables (Netlify production environment)
  if (process.env.SQUARE_ACCESS_TOKEN) {
    console.log('Using Square credentials from environment variables');
    LOCATION_ID = process.env.LOCATION_ID;
    
    squareClient = new SquareClient({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: SquareEnvironment.Sandbox, // Always use sandbox for testing
      userAgentDetail: 'Burger-Rebellion-Voice-Ordering' // Custom agent for tracking API calls
    });
  } 
  // Try loading from mcp_config.json if we're running locally
  else {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync('./mcp_config.json', 'utf8'));
      LOCATION_ID = mcpConfig.servers.square.env.LOCATION_ID;
      
      squareClient = new SquareClient({
        accessToken: mcpConfig.servers.square.env.SQUARE_ACCESS_TOKEN,
        environment: SquareEnvironment.Sandbox,
        userAgentDetail: 'Burger-Rebellion-Voice-Ordering'
      });
      
      console.log('Using Square credentials from mcp_config.json');
    } catch (configError) {
      throw new Error('Failed to load Square credentials from config file or environment variables');
    }
  }
  
  // Verify client is initialized
  if (!squareClient) {
    throw new Error('Failed to initialize Square client');
  }
  
  console.log('Square client initialized successfully');
} catch (error) {
  console.error('Error initializing Square client:', error.message);
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
    
    // Create order in Square using the SDK
    try {
      if (!squareClient) {
        throw new Error('Square client not initialized');
      }
      
      if (!LOCATION_ID) {
        throw new Error('Square location ID not configured');
      }
      
      const orderPayload = {
        order: {
          locationId: LOCATION_ID,
          lineItems: lineItems,
          state: 'OPEN',
          customerNote: `Voice order for ${customer_name || 'Customer'}`,
          source: {
            name: 'Burger Rebellion Voice Ordering'
          }
        },
        idempotencyKey: `voice-order-${Date.now()}`
      };
      
      console.log('Sending order to Square using SDK:', JSON.stringify(orderPayload, null, 2));
      console.log(`Using Location ID: ${LOCATION_ID}`);
      
      // Make the API call to Square using SDK
      const { result } = await squareClient.ordersApi.createOrder(orderPayload);
      
      console.log('Order created successfully:', JSON.stringify(result, null, 2));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    } catch (squareError) {
      // Detailed error logging to diagnose the issue
      console.error('Error creating order in Square:');
      
      if (squareError instanceof SquareError) {
        // This is a Square-specific error with more details
        console.error('Square API Error:');
        
        // Log each error in the array
        squareError.errors.forEach(error => {
          console.error('Category:', error.category);
          console.error('Code:', error.code);
          console.error('Detail:', error.detail);
        });
        
        // Return error response to client
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Failed to create order in Square',
            details: squareError.errors,
            timestamp: new Date().toISOString()
          })
        };
      } else {
        // This is a general error (not a Square API error)
        console.error('General error:', squareError.message);
        
        // Return error response to client
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to create order in Square',
            details: squareError.message,
            timestamp: new Date().toISOString()
          })
        };
      }
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
