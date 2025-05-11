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
    console.log('Raw request body:', event.body);
    const requestBody = JSON.parse(event.body);
    console.log('Parsed request body:', JSON.stringify(requestBody, null, 2));
    
    // Extract data - be flexible with format that might come from ElevenLabs
    let customerName = '';
    let orderItems = [];
    
    // Check for typical properties we might receive
    if (requestBody.customer_name) {
      customerName = requestBody.customer_name;
    } else if (requestBody.customerName) {
      customerName = requestBody.customerName;
    } else if (requestBody.name) {
      customerName = requestBody.name;
    }
    
    // Check for items array in different possible formats
    if (Array.isArray(requestBody.items)) {
      orderItems = requestBody.items;
    } else if (Array.isArray(requestBody.orderItems)) {
      orderItems = requestBody.orderItems;
    } else if (requestBody.order && Array.isArray(requestBody.order.items)) {
      orderItems = requestBody.order.items;
    } else if (typeof requestBody === 'object') {
      // Try to extract items from the structure if they're not in an expected format
      for (const key in requestBody) {
        if (Array.isArray(requestBody[key])) {
          const possibleItems = requestBody[key];
          if (possibleItems.length > 0 && 
              (possibleItems[0].name || possibleItems[0].item || possibleItems[0].product)) {
            orderItems = possibleItems;
            break;
          }
        }
      }
    }
    
    console.log('Extracted customer name:', customerName);
    console.log('Extracted order items:', JSON.stringify(orderItems, null, 2));
    
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'No items provided in the order',
          receivedData: requestBody 
        })
      };
    }
    
    // Create a demo catalog for testing
    const catalogCache = getDemoCatalog();
    
    // Match items to catalog
    const lineItems = [];
    
    for (const item of orderItems) {
      // Extract item name - be flexible with the property name
      const itemName = item.name || item.item || item.product || item.description || '';
      
      // Log what we're processing
      console.log(`Processing item: ${JSON.stringify(item)}`);
      console.log(`Extracted item name: ${itemName}`);
      
      // Find matching item in catalog
      const catalogItem = findCatalogItem(catalogCache, itemName);
      
      if (catalogItem) {
        // Create Square line item - be flexible with the quantity property
        const quantity = item.quantity || item.count || item.amount || 1;
        console.log(`Item quantity: ${quantity}`);
        
        const lineItem = {
          quantity: String(quantity),
          note: customerName ? `For: ${customerName}` : undefined
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
        
        // Add modifiers if present - be flexible with different property names
        const modifiers = item.modifiers || item.modifications || item.options || [];
        if (Array.isArray(modifiers) && modifiers.length > 0) {
          const validModifiers = modifiers.filter(mod => mod && mod !== '');
          if (validModifiers.length > 0) {
            lineItem.note = (lineItem.note || '') + ` - Mods: ${validModifiers.join(', ')}`;
          }
        } else if (typeof item.modifiers === 'string' && item.modifiers.trim() !== '') {
          // Handle case where modifiers might be a single string
          lineItem.note = (lineItem.note || '') + ` - Mods: ${item.modifiers.trim()}`;
        }
        
        lineItems.push(lineItem);
      } else {
        // Fallback if item not found in catalog
        const itemName = item.name || item.item || item.product || item.description || 'Unknown Item';
        const quantity = item.quantity || item.count || item.amount || 1;
        
        lineItems.push({
          name: itemName,
          quantity: String(quantity),
          note: `For: ${customerName || 'Customer'} - Not in catalog`,
          base_price_money: {
            amount: 1000, // Default $10.00
            currency: 'USD'
          }
        });
        
        console.log(`Added fallback item: ${itemName}, quantity: ${quantity}`);
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
      
      // First, log our final processed items
      console.log('Final processed line items for Square:', JSON.stringify(lineItems, null, 2));
      
      const orderPayload = {
        order: {
          locationId: LOCATION_ID,
          lineItems: lineItems,
          state: 'OPEN',
          customerNote: `Voice order for ${customerName || 'Customer'}`,
          source: {
            name: 'Burger Rebellion Voice Ordering'
          }
        },
        idempotencyKey: `voice-order-${Date.now()}`
      };
      
      console.log('Sending order to Square using SDK:', JSON.stringify(orderPayload, null, 2));
      console.log(`Using Location ID: ${LOCATION_ID}`);
      
      // Make the API call to Square using SDK
      try {
        const { result } = await squareClient.ordersApi.createOrder(orderPayload);
        console.log('Square SDK response:', JSON.stringify(result, null, 2));
        console.log('Order created successfully:', JSON.stringify(result, null, 2));
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result)
        };
      } catch (squareSdkError) {
        console.error('Error from Square SDK:', squareSdkError);
        throw squareSdkError; // Re-throw to be caught by the outer catch
      }
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
